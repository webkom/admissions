from datetime import timedelta

from django.utils import timezone

from admissions.admissions.admission_access import get_name_revealed_groups
from admissions.admissions.models import (
    ConflictReviewAuditEvent,
    InterviewAvailability,
    NameVisibilityAuditEvent,
    SavedSchedule,
    ScheduleDeviationApproval,
    SolveJob,
)

SYSTEM_ACTOR_USERNAME = "system"


def _hide_revealed_groups(saved, actor, revealed_groups=None):
    if revealed_groups is None:
        revealed_groups = list(get_name_revealed_groups(saved.admission, saved))
    if revealed_groups:
        actor_username = actor.username if actor is not None else SYSTEM_ACTOR_USERNAME
        NameVisibilityAuditEvent.objects.bulk_create(
            [
                NameVisibilityAuditEvent(
                    admission=saved.admission,
                    saved_schedule=saved,
                    group=group,
                    group_name=group.name,
                    actor=actor,
                    actor_username=actor_username,
                    action=NameVisibilityAuditEvent.ACTION_HIDDEN,
                )
                for group in revealed_groups
            ]
        )
    saved.revealed_groups.clear()


def invalidate_solver_work(admission, *, clear_all_payloads=False):
    """Cancel solver work derived from planning inputs that just changed."""

    finished_at = timezone.now()
    admission_jobs = SolveJob.objects.filter(admission=admission)
    if clear_all_payloads:
        admission_jobs.update(request_data={}, result=None, error="")
    admission_jobs.filter(status__in=SolveJob.ACTIVE_STATUSES).update(
        status=SolveJob.STATUS_CANCELLED,
        result=None,
        request_data={},
        finished_at=finished_at,
    )
    admission_jobs.filter(
        status=SolveJob.STATUS_DONE,
        applied_at__isnull=True,
        discarded_at__isnull=True,
    ).update(discarded_at=finished_at)


def invalidate_planning_input(saved, *, actor, publication_invalidated):
    """Advance one planning revision and invalidate its derived solver work.

    The caller owns the Admission lock and passes the matching SavedSchedule.
    """

    revealed_groups = (
        list(get_name_revealed_groups(saved.admission, saved))
        if publication_invalidated
        else []
    )
    conflict_review_was_open = saved.conflict_review_open
    update_fields = ["updated_at"]
    if publication_invalidated:
        saved.is_distributed = False
        saved.name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN
        saved.conflict_review_open = False
        update_fields.extend(
            ["is_distributed", "name_visibility", "conflict_review_open"]
        )
    saved.save(update_fields=update_fields)

    if publication_invalidated:
        _hide_revealed_groups(saved, actor, revealed_groups)
        if conflict_review_was_open:
            actor_username = (
                actor.username if actor is not None else SYSTEM_ACTOR_USERNAME
            )
            ConflictReviewAuditEvent.objects.create(
                admission=saved.admission,
                saved_schedule=saved,
                actor=actor,
                actor_username=actor_username,
                action=ConflictReviewAuditEvent.ACTION_CLOSED,
            )
        ScheduleDeviationApproval.objects.filter(saved_schedule=saved).delete()
    invalidate_solver_work(saved.admission)
    return publication_invalidated


def publication_is_invalidated_by_availability(
    saved,
    *,
    target_availability,
    previous_values,
):
    """Whether an availability change invalidates a published assignment."""

    if saved is None or not saved.is_distributed:
        return False

    target_id = str(target_availability.user_id)
    assignments = [
        item
        for item in saved.schedule or []
        if isinstance(item, dict)
        and any(
            isinstance(member, dict) and str(member.get("id") or "") == target_id
            for member in item.get("panel") or []
        )
    ]
    if not assignments:
        return False

    previous_generation = previous_values["submitted_grid_generation"]
    next_generation = target_availability.submitted_grid_generation
    if previous_generation != next_generation:
        return True

    participation_changed = (
        previous_values["participation"] != target_availability.participation
    )
    if (
        participation_changed
        and target_availability.participation
        != InterviewAvailability.PARTICIPATION_PARTICIPATING
    ):
        return True

    previous_participates = (
        previous_values["participation"]
        == InterviewAvailability.PARTICIPATION_PARTICIPATING
        and previous_generation == saved.availability_generation
    )
    next_participates = (
        target_availability.participation
        == InterviewAvailability.PARTICIPATION_PARTICIPATING
        and next_generation == saved.availability_generation
    )
    if previous_participates and not next_participates:
        return True

    previous_slots = set(previous_values["slots"])
    next_slots = set(target_availability.slots or [])
    for assignment in assignments:
        interview_time = assignment.get("time")
        if not isinstance(interview_time, int):
            return True
        day_index, minute = divmod(interview_time, 24 * 60)
        slot_key = f"{saved.start_date + timedelta(days=day_index)}|{minute}"
        was_available = previous_participates and slot_key in previous_slots
        is_available = next_participates and slot_key in next_slots
        if was_available != is_available:
            return True

    previous_conflicts = {str(value) for value in previous_values["conflicts"]}
    next_conflicts = {str(value) for value in target_availability.conflicts or []}
    assigned_candidate_ids = {
        str(assignment.get("candidate_id") or "") for assignment in assignments
    }
    return any(
        (candidate_id in previous_conflicts) != (candidate_id in next_conflicts)
        for candidate_id in assigned_candidate_ids
    )
