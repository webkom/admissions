from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from admissions.admissions.models import InterviewStatusAuditEvent, UserApplication


class InterviewStatusConflict(Exception):
    pass


class InterviewStatusNotFound(Exception):
    pass


@transaction.atomic
def update_interview_status(application, status, expected_status_updated_at, actor):
    try:
        locked = UserApplication.objects.select_for_update().get(pk=application.pk)
    except UserApplication.DoesNotExist:
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
        application=locked,
        actor=actor,
        actor_username=actor.username,
        previous_status=previous_status,
        new_status=status,
    )
    return locked
