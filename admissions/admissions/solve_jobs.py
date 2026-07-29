from django.db import IntegrityError, transaction
from django.utils import timezone

from admissions.admissions.models import SolveJob
from admissions.admissions.schedule_policy import (
    canonical_schedule_assignments,
    fingerprint,
    solve_request_fingerprint,
)


class ActiveSolveRequestConflict(Exception):
    pass


def planning_input_fingerprint(data, previous_schedule=None):
    """Fingerprint every canonical fact that can change a solver result.

    Display names are deliberately excluded. Candidate and interviewer order is
    normalized because the API treats those collections as sets, while block
    order is retained because it is meaningful to the solver.
    """

    candidates = sorted(
        (
            {
                "id": str(item.get("id") or ""),
                "user_id": str(item.get("user_id") or ""),
                "gender": item.get("gender") or "",
            }
            for item in data.get("candidates", [])
            if isinstance(item, dict)
        ),
        key=lambda item: item["id"],
    )
    interviewers = sorted(
        (
            {
                "id": str(item.get("id") or ""),
                "gender": item.get("gender") or "",
                "availability": sorted(item.get("availability") or []),
                "biased": sorted(str(value) for value in (item.get("biased") or [])),
                "experience_level": item.get("experience_level") or "",
            }
            for item in data.get("interviewers", [])
            if isinstance(item, dict)
        ),
        key=lambda item: item["id"],
    )
    return fingerprint(
        {
            "candidates": candidates,
            "interviewers": interviewers,
            "panel_size": data.get("panel_size"),
            "options": data.get("options") or {},
            "all_slots": sorted(data.get("all_slots") or []),
            "blocks": data.get("blocks") or [],
            "block_metadata": data.get("block_metadata") or [],
            "locked_assignments": canonical_schedule_assignments(
                data.get("locked_assignments") or []
            ),
            "previous_schedule": canonical_schedule_assignments(
                previous_schedule
                if previous_schedule is not None
                else data.get("previous_schedule") or []
            ),
            "availability_generation": data.get("availability_generation", 1),
            "layout_version": data.get("layout_version", 1),
        }
    )


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
    input_fingerprint = planning_input_fingerprint(data, previous_schedule)
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
            "planning_input_fingerprint": input_fingerprint,
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
        "planning_input_fingerprint": input_fingerprint,
    }


def enqueue_solve_job(admission, requested_by, request_data):
    request_fingerprint = solve_request_fingerprint(request_data)
    existing = active_solve_job(admission)
    if existing is not None:
        if existing.request_fingerprint == request_fingerprint:
            return existing
        raise ActiveSolveRequestConflict
    try:
        with transaction.atomic():
            return SolveJob.objects.create(
                admission=admission,
                requested_by=requested_by,
                request_data=request_data,
                request_fingerprint=request_fingerprint,
            )
    except IntegrityError:
        existing = active_solve_job(admission)
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
