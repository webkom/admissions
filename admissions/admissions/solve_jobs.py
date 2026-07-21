from django.db import IntegrityError, transaction
from django.utils import timezone

from admissions.admissions.models import SolveJob


def active_solve_job(admission):
    return (
        SolveJob.objects.filter(
            admission=admission,
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
        }
    return {
        "rehydrate": True,
        "baseline_updated_at": (
            data["baseline_updated_at"].isoformat()
            if data.get("baseline_updated_at")
            else None
        ),
        "candidates": [{"id": item["id"]} for item in data["candidates"]],
        "interviewers": [{"id": item["id"]} for item in data["interviewers"]],
        "panel_size": data["panel_size"],
        "options": data.get("options", {}),
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
    }


def enqueue_solve_job(admission, requested_by, request_data):
    existing = active_solve_job(admission)
    if existing is not None:
        return existing
    try:
        with transaction.atomic():
            return SolveJob.objects.create(
                admission=admission,
                requested_by=requested_by,
                request_data=request_data,
            )
    except IntegrityError:
        existing = active_solve_job(admission)
        if existing is None:
            raise
        return existing


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
