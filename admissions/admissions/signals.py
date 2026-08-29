from django.db import transaction
from django.db.models.signals import post_delete, pre_delete
from django.dispatch import receiver

from admissions.admissions.models import (
    Admission,
    ConflictReviewList,
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
                # A withdrawal cancels that candidate's interview; it must not
                # unpublish the plan. Invitations for the other interviews are
                # already out, and pulling a published prefix back to draft
                # mid-week revokes every one of them. Only a plan left with
                # nothing left to show comes down entirely.
                emptied = not schedule
                if emptied:
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
                if was_visible and emptied:
                    NameVisibilityAuditEvent.objects.create(
                        admission=admission,
                        saved_schedule=saved,
                        group=saved.group,
                        group_name=saved.group.name,
                        actor=None,
                        actor_username=SYSTEM_ACTOR_USERNAME,
                        action=NameVisibilityAuditEvent.ACTION_HIDDEN,
                    )

        # Readiness demands review of every snapshotted id, and nobody can
        # see or submit a withdrawn one - left in place it blocks publication
        # permanently.
        changed_review_lists = []
        for review_list in ConflictReviewList.objects.filter(
            saved_schedule__admission_id=instance.admission_id
        ):
            own = [
                value
                for value in (review_list.own_candidate_ids or [])
                if str(value) != candidate_id
            ]
            swap = [
                value
                for value in (review_list.swap_candidate_ids or [])
                if str(value) != candidate_id
            ]
            if own != (review_list.own_candidate_ids or []) or swap != (
                review_list.swap_candidate_ids or []
            ):
                review_list.own_candidate_ids = own
                review_list.swap_candidate_ids = swap
                changed_review_lists.append(review_list)
        if changed_review_lists:
            ConflictReviewList.objects.bulk_update(
                changed_review_lists, ["own_candidate_ids", "swap_candidate_ids"]
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
            # Attestations are append-only, so a withdrawn candidate's id
            # would otherwise sit in reviewed_candidate_ids forever - and the
            # availability GET echoes it back to the UI, whose save then
            # trips over it. Purge it exactly like the declared conflicts.
            reviewed = [
                value
                for value in (availability.reviewed_candidate_ids or [])
                if str(value) != candidate_id
            ]
            if conflicts != (availability.conflicts or []) or reviewed != (
                availability.reviewed_candidate_ids or []
            ):
                availability.conflicts = conflicts
                availability.reviewed_candidate_ids = reviewed
                changed_availability.append(availability)
        if changed_availability:
            InterviewAvailability.objects.bulk_update(
                changed_availability,
                ["conflicts", "reviewed_candidate_ids"],
            )

        SolveJob.objects.filter(admission_id=instance.admission_id).delete()


@receiver(post_delete, sender=GroupApplication)
def flag_schedule_after_partial_withdrawal(sender, instance, **kwargs):
    """Cancel this committee's interview when an applicant drops only it.

    Withdrawing a whole application already removes the candidate and purges
    their rows (purge_withdrawn_candidate above). Dropping a single committee
    leaves the candidate's other interviews intact, but this committee's
    interview is moot - so its row is cancelled in place. The published
    boundary survives: revoking the whole prefix over one dropped committee
    would strand every other already-invited candidate.
    """

    with transaction.atomic():
        application = UserApplication.objects.filter(pk=instance.application_id).first()
        if application is None:
            return

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

        # Only a candidate actually scheduled in this published plan needs
        # their row cancelled. This also keeps full-withdrawal cascades out:
        # a parent-row existence check cannot (the Collector deletes children
        # while the parent still exists), but purge_withdrawn_candidate has
        # already stripped the candidate from every schedule by the time this
        # fires.
        candidate_id = str(instance.application_id)
        remaining_schedule = [
            item
            for item in saved.schedule or []
            if not (
                isinstance(item, dict)
                and str(item.get("candidate_id") or "") == candidate_id
            )
        ]
        if len(remaining_schedule) == len(saved.schedule or []):
            return

        admission = Admission.objects.get(pk=application.admission_id)
        was_visible = saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        saved.schedule = remaining_schedule
        if not remaining_schedule:
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
        if was_visible and not remaining_schedule:
            NameVisibilityAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved,
                group=saved.group,
                group_name=saved.group.name,
                actor=None,
                actor_username=SYSTEM_ACTOR_USERNAME,
                action=NameVisibilityAuditEvent.ACTION_HIDDEN,
            )
