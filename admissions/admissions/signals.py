from django.db import transaction
from django.db.models.signals import pre_delete
from django.dispatch import receiver

from admissions.admissions.admission_access import get_name_revealed_groups
from admissions.admissions.models import (
    Admission,
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
        try:
            saved = SavedSchedule.objects.get(admission_id=instance.admission_id)
        except SavedSchedule.DoesNotExist:
            saved = None

        if saved is not None:
            revealed_groups = list(get_name_revealed_groups(admission, saved))
            current_schedule = saved.schedule or []
            current_candidate_ids = {
                str(value)
                for value in UserApplication.objects.filter(
                    admission_id=instance.admission_id
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
                saved.is_distributed = False
                saved.name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN
                saved.save(
                    update_fields=[
                        "schedule",
                        "is_distributed",
                        "name_visibility",
                        "updated_at",
                    ]
                )
                NameVisibilityAuditEvent.objects.bulk_create(
                    [
                        NameVisibilityAuditEvent(
                            admission=admission,
                            saved_schedule=saved,
                            group=group,
                            group_name=group.name,
                            actor=None,
                            actor_username=SYSTEM_ACTOR_USERNAME,
                            action=NameVisibilityAuditEvent.ACTION_HIDDEN,
                        )
                        for group in revealed_groups
                    ]
                )
                saved.revealed_groups.clear()

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
