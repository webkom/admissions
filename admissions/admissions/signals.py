from django.db import transaction
from django.db.models.signals import post_delete, pre_delete
from django.dispatch import receiver

from admissions.admissions.models import (
    Admission,
    GroupApplication,
    InterviewAvailability,
    NameVisibilityAuditEvent,
    SavedSchedule,
    SolveJob,
    UserApplication,
)

SYSTEM_ACTOR_USERNAME = "system"


@receiver(pre_delete, sender=UserApplication)
def purge_withdrawn_candidate(sender, instance, **kwargs):
    with transaction.atomic():
        admission = Admission.objects.select_for_update().get(pk=instance.admission_id)
        candidate_id = str(instance.pk)

        # Withdrawing the whole application can affect several committees'
        # schedules at once now that each committee's schedule is
        # independent - one row per (admission, group), not one per
        # admission - so every one of the admission's schedules needs its
        # own purge pass, not just the first one found.
        for saved in SavedSchedule.objects.select_for_update().filter(
            admission_id=instance.admission_id
        ):
            was_visible = (
                saved.is_distributed
                and saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
            )
            current_schedule = saved.schedule or []
            current_candidate_ids = {
                str(value)
                for value in UserApplication.objects.filter(
                    admission_id=instance.admission_id,
                    group_applications__group_id=saved.group_id,
                ).values_list("pk", flat=True)
            }
            has_legacy_rows = any(
                not isinstance(item, dict)
                or str(item.get("candidate_id") or "") not in current_candidate_ids
                for item in current_schedule
            )
            schedule = (
                []
                if has_legacy_rows
                else [
                    item
                    for item in current_schedule
                    if str(item.get("candidate_id")) != candidate_id
                ]
            )
            if schedule != current_schedule:
                saved.schedule = schedule
                saved.distributed_through = None
                saved.name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN
                saved.save(
                    update_fields=[
                        "schedule",
                        "distributed_through",
                        "name_visibility",
                        "updated_at",
                    ]
                )
                if was_visible:
                    NameVisibilityAuditEvent.objects.create(
                        admission=admission,
                        saved_schedule=saved,
                        group=saved.group,
                        group_name=saved.group.name,
                        actor=None,
                        actor_username=SYSTEM_ACTOR_USERNAME,
                        action=NameVisibilityAuditEvent.ACTION_HIDDEN,
                    )

        changed_availability = []
        for availability in InterviewAvailability.objects.filter(
            admission_id=instance.admission_id
        ):
            conflicts = [
                value
                for value in (availability.conflicts or [])
                if str(value) != candidate_id
            ]
            if conflicts != (availability.conflicts or []):
                availability.conflicts = conflicts
                changed_availability.append(availability)
        if changed_availability:
            InterviewAvailability.objects.bulk_update(
                changed_availability, ["conflicts"]
            )

        SolveJob.objects.filter(admission_id=instance.admission_id).delete()


@receiver(post_delete, sender=GroupApplication)
def flag_schedule_after_partial_withdrawal(sender, instance, **kwargs):
    """Un-publish the plan when an applicant drops one committee but stays.

    Withdrawing a whole application already removes the candidate and
    un-publishes the plan (purge_withdrawn_candidate above). Dropping a single
    committee did nothing, so a published plan could keep an interview whose
    panel was picked for a committee the applicant no longer applies to.

    Unlike a full withdrawal this leaves `schedule` and `conflicts` alone: the
    candidate still has an interview and still needs their slot, and a declared
    inhabilitet is a scheduling constraint regardless of which committees remain.
    """

    with transaction.atomic():
        # UserApplication.delete() cascades here too. That case belongs to
        # purge_withdrawn_candidate, which has already run its pre_delete.
        if not UserApplication.objects.filter(pk=instance.application_id).exists():
            return

        application = UserApplication.objects.get(pk=instance.application_id)
        # Scoped to the committee actually dropped: each committee's schedule
        # is independent now, so dropping Bedkom must never touch Webkom's.
        saved = (
            SavedSchedule.objects.select_for_update()
            .filter(
                admission_id=application.admission_id,
                group_id=instance.group_id,
            )
            .first()
        )
        if saved is None or not saved.is_distributed:
            return

        admission = Admission.objects.get(pk=application.admission_id)
        was_visible = saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        saved.distributed_through = None
        saved.name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN
        saved.save(
            update_fields=["distributed_through", "name_visibility", "updated_at"]
        )
        if was_visible:
            NameVisibilityAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved,
                group=saved.group,
                group_name=saved.group.name,
                actor=None,
                actor_username=SYSTEM_ACTOR_USERNAME,
                action=NameVisibilityAuditEvent.ACTION_HIDDEN,
            )
