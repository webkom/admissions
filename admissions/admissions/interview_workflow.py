from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from admissions.admissions.models import GroupApplication, InterviewStatusAuditEvent


class InterviewStatusConflict(Exception):
    pass


class InterviewStatusNotFound(Exception):
    pass


@transaction.atomic
def update_interview_status(
    group_application, status, expected_status_updated_at, actor
):
    """Set the interview status for one (applicant, committee) pairing.

    Status is per GroupApplication - one applicant can sit at a different
    stage with each committee they applied to.
    """
    try:
        locked = GroupApplication.objects.select_for_update().get(
            pk=group_application.pk
        )
    except GroupApplication.DoesNotExist:
        raise InterviewStatusNotFound from None
    if locked.interview_status_updated_at != expected_status_updated_at:
        raise InterviewStatusConflict
    if locked.interview_status == status:
        return locked
    previous_status = locked.interview_status
    locked.interview_status = status
    locked.interview_status_updated_at = max(
        timezone.now(),
        locked.interview_status_updated_at + timedelta(microseconds=1),
    )
    locked.interview_status_updated_by = actor
    locked.interview_status_updated_by_username = actor.username
    locked.save(
        update_fields=[
            "interview_status",
            "interview_status_updated_at",
            "interview_status_updated_by",
            "interview_status_updated_by_username",
        ]
    )
    InterviewStatusAuditEvent.objects.create(
        group_application=locked,
        actor=actor,
        actor_username=actor.username,
        previous_status=previous_status,
        new_status=status,
    )
    return locked
