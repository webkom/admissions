from django.db import IntegrityError, transaction
from django.utils import timezone

from admissions.admissions.models import SolveJob
from admissions.admissions.schedule_policy import solve_request_fingerprint


class ActiveSolveRequestConflict(Exception):
    pass


def active_solve_job(admission, group):
    return (
        SolveJob.objects.filter(
            admission=admission,
            group=group,
            status__in=SolveJob.ACTIVE_STATUSES,
        )
        .order_by("created_at")
        .first()
    )


def build_solve_request(data, synthetic_input, previous_schedule):
    if synthetic_input:
        return {
            "candidates": data["candidates"],
            "interviewers": data["interviewers"],
            "panel_size": data["panel_size"],
            "options": data.get("options", {}),
            "locked_assignments": data.get("locked_assignments", []),
            "all_slots": data.get("all_slots"),
            "blocks": data.get("blocks", []),
            "block_metadata": data.get("block_metadata", []),
            "previous_schedule": previous_schedule,
            "availability_generation": data.get("availability_generation", 1),
            "layout_version": data.get("layout_version", 1),
            "preview_only": data.get("preview_only", False),
        }
    return {
        "rehydrate": True,
        "auto_apply_if_empty": data.get("auto_apply_if_empty", False),
        "baseline_updated_at": (
            data["baseline_updated_at"].isoformat()
            if data.get("baseline_updated_at")
            else None
        ),
        "candidates": [{"id": item["id"]} for item in data["candidates"]],
        "interviewers": [{"id": item["id"]} for item in data["interviewers"]],
        "panel_size": data["panel_size"],
        "options": data.get("options", {}),
        "day_scope_through": data.get("day_scope_through"),
        "locked_assignments": [
            {
                "candidate_id": item.get("candidate_id"),
                "time": item["time"],
                "panel": [{"id": member.get("id")} for member in item.get("panel", [])],
            }
            for item in data.get("locked_assignments", [])
        ],
        "blocks": data.get("blocks", []),
        "block_metadata": data.get("block_metadata", []),
        "availability_generation": data.get("availability_generation", 1),
        "layout_version": data.get("layout_version", 1),
        "preview_only": data.get("preview_only", False),
    }


def enqueue_solve_job(admission, group, requested_by, request_data):
    request_fingerprint = solve_request_fingerprint(request_data)
    existing = active_solve_job(admission, group)
    if existing is not None:
        if existing.request_fingerprint == request_fingerprint:
            return existing
        raise ActiveSolveRequestConflict
    try:
        with transaction.atomic():
            return SolveJob.objects.create(
                admission=admission,
                group=group,
                requested_by=requested_by,
                request_data=request_data,
                request_fingerprint=request_fingerprint,
            )
    except IntegrityError:
        existing = active_solve_job(admission, group)
        if existing is None:
            raise
        if existing.request_fingerprint == request_fingerprint:
            return existing
        raise ActiveSolveRequestConflict


def cancel_solve_job(job):
    SolveJob.objects.filter(
        id=job.id,
        status__in=SolveJob.ACTIVE_STATUSES,
    ).update(
        status=SolveJob.STATUS_CANCELLED,
        result=None,
        request_data={},
        finished_at=timezone.now(),
    )
    job.refresh_from_db()
    return job
