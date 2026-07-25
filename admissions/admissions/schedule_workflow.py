from dataclasses import dataclass
from datetime import datetime

from django.db import transaction
from django.utils import timezone

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    get_representing_groups,
    set_group_name_visibility,
)
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    SavedSchedule,
    SolveJob,
)
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_schedule,
)
from admissions.admissions.schedule_windows import (
    enabled_windows_to_slots,
    normalize_enabled_windows,
    slots_to_enabled_windows,
)
from admissions.admissions.scheduling_utils import (
    canonicalize_slot_keys,
    get_conflict_review_readiness,
)


class SchedulePermissionDenied(Exception):
    pass


class ScheduleNotFound(Exception):
    pass


class ScheduleRevisionConflict(Exception):
    pass


class ScheduleInputError(Exception):
    def __init__(self, errors):
        super().__init__()
        self.errors = errors


@dataclass(frozen=True)
class ScheduleUpdateResult:
    admission: Admission
    saved_schedule: SavedSchedule


def ensure_window_fields(saved_schedule):
    if not saved_schedule.enabled_windows and saved_schedule.enabled_slots:
        saved_schedule.enabled_windows = slots_to_enabled_windows(
            saved_schedule.enabled_slots,
            saved_schedule.session_duration,
        )

    if saved_schedule.enabled_windows:
        derived_slots = enabled_windows_to_slots(
            saved_schedule.enabled_windows,
            saved_schedule.session_duration,
        )
        if saved_schedule.enabled_slots != derived_slots:
            saved_schedule.enabled_slots = derived_slots

    return saved_schedule


def _ensure_revision_matches(data, existing):
    expected_updated_at = data["expected_updated_at"]
    if existing is None:
        has_conflict = expected_updated_at is not None
    else:
        has_conflict = (
            expected_updated_at is None or existing.updated_at != expected_updated_at
        )
    if has_conflict:
        raise ScheduleRevisionConflict


def _update_group_visibility(
    admission,
    user,
    data,
    existing,
    is_recruiter,
):
    mutable_fields = set(data) - {"expected_updated_at"}
    if not is_recruiter or mutable_fields != {"name_visibility"}:
        raise SchedulePermissionDenied
    _ensure_revision_matches(data, existing)
    if existing is None:
        raise ScheduleNotFound

    visibility = data["name_visibility"]
    if (
        visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        and not existing.is_distributed
    ):
        raise ScheduleInputError(
            {"name_visibility": ["Planen må publiseres før navn kan vises."]}
        )

    represented_groups = get_representing_groups(admission, user)
    visibility_became_group_scoped = (
        visibility != SavedSchedule.NAME_VISIBILITY_COMMITTEE
        and existing.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
    )
    if visibility_became_group_scoped:
        existing.revealed_groups.set(admission.groups.all())
        existing.name_visibility = SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY
    set_group_name_visibility(
        existing,
        represented_groups,
        visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        user,
    )
    update_fields = ["updated_at"]
    if visibility_became_group_scoped:
        update_fields.append("name_visibility")
    existing.save(update_fields=update_fields)
    return existing


def _resolve_schedule_configuration(data, existing):
    if "start_date" not in data and existing is None:
        raise ScheduleInputError({"start_date": ["This field is required."]})
    if "session_duration" not in data and existing is None:
        raise ScheduleInputError({"session_duration": ["This field is required."]})

    start_date = data.get(
        "start_date",
        existing.start_date if existing is not None else timezone.now().date(),
    )
    end_date = data.get(
        "end_date",
        existing.end_date if existing is not None else start_date,
    )
    session_duration = data.get(
        "session_duration",
        existing.session_duration if existing is not None else 60,
    )
    day_start_minute = data.get(
        "day_start_minute",
        existing.day_start_minute if existing is not None else 8 * 60,
    )
    day_end_minute = data.get(
        "day_end_minute",
        existing.day_end_minute if existing is not None else 18 * 60,
    )

    if end_date is not None and end_date < start_date:
        raise ScheduleInputError(
            {"end_date": ["Sluttdato kan ikke være før startdato."]}
        )
    effective_end_date = end_date or start_date
    if (effective_end_date - start_date).days >= constants.MAX_SCHEDULE_DAYS:
        raise ScheduleInputError(
            {
                "end_date": [
                    f"Intervjuperioden kan være maksimalt {constants.MAX_SCHEDULE_DAYS} dager."
                ]
            }
        )
    if day_end_minute <= day_start_minute:
        raise ScheduleInputError(
            {"day_end_minute": ["Slutten på dagen må være etter starten."]}
        )

    return {
        "start_date": start_date,
        "end_date": end_date,
        "effective_end_date": effective_end_date,
        "session_duration": session_duration,
        "day_start_minute": day_start_minute,
        "day_end_minute": day_end_minute,
    }


def _resolve_enabled_windows(data, existing, configuration):
    session_duration = configuration["session_duration"]
    if "enabled_windows" in data:
        enabled_windows = normalize_enabled_windows(data["enabled_windows"])
    elif "enabled_slots" in data:
        canonical_slots, invalid_key = canonicalize_slot_keys(data["enabled_slots"])
        if canonical_slots is None:
            raise ScheduleInputError(
                {"enabled_slots": [f"Ugyldig tidsluke: {invalid_key}"]}
            )
        enabled_windows = slots_to_enabled_windows(
            canonical_slots,
            session_duration,
        )
    elif existing is not None:
        enabled_windows = normalize_enabled_windows(existing.enabled_windows)
    else:
        enabled_windows = []

    slot_count = 0
    for window in enabled_windows:
        window_date = datetime.strptime(window["date"], "%Y-%m-%d").date()
        if (
            window_date < configuration["start_date"]
            or window_date > configuration["effective_end_date"]
            or window["start_minute"] < configuration["day_start_minute"]
            or window["end_minute"] > configuration["day_end_minute"]
        ):
            raise ScheduleInputError(
                {
                    "enabled_windows": [
                        "Tidsvinduer må ligge innenfor intervjuperioden og dagen."
                    ]
                }
            )
        slot_count += (
            window["end_minute"] - window["start_minute"]
        ) // session_duration
        if slot_count > constants.MAX_SCHEDULE_SLOTS:
            raise ScheduleInputError(
                {"enabled_windows": ["Tidsoppsettet inneholder for mange luker."]}
            )

    return enabled_windows, enabled_windows_to_slots(
        enabled_windows,
        session_duration,
    )


def _resolve_schedule_state(data, existing, configuration, enabled_windows):
    grid_changed = False
    should_clear_plan = False
    if existing is not None:
        old_windows = normalize_enabled_windows(existing.enabled_windows)
        next_chunk_size = data.get("chunk_size", existing.chunk_size)
        next_chunk_break_minutes = data.get(
            "chunk_break_minutes", existing.chunk_break_minutes
        )
        block_shape_changed = (
            existing.chunk_break_minutes != next_chunk_break_minutes
            or (
                (existing.chunk_break_minutes > 0 or next_chunk_break_minutes > 0)
                and existing.chunk_size != next_chunk_size
            )
        )
        structure_changed = (
            existing.start_date != configuration["start_date"]
            or existing.end_date != configuration["end_date"]
            or existing.session_duration != configuration["session_duration"]
            or block_shape_changed
            or existing.day_start_minute != configuration["day_start_minute"]
            or existing.day_end_minute != configuration["day_end_minute"]
        )
        grid_changed = structure_changed or old_windows != enabled_windows
        incoming_schedule = data.get("schedule")
        should_clear_plan = (
            grid_changed
            and bool(existing.schedule)
            and ("schedule" not in data or incoming_schedule == existing.schedule)
        )

    if should_clear_plan:
        schedule = []
    else:
        schedule = data.get(
            "schedule",
            existing.schedule if existing is not None else [],
        )

    schedule_changed = (
        "schedule" in data
        and existing is not None
        and data["schedule"] != existing.schedule
    )
    if should_clear_plan:
        is_distributed = False
    elif "is_distributed" in data:
        is_distributed = data["is_distributed"]
    elif schedule_changed:
        is_distributed = False
    else:
        is_distributed = existing.is_distributed if existing is not None else False

    if data.get("is_distributed") is True and not schedule:
        raise ScheduleInputError(
            {"is_distributed": ["Kan ikke publisere en tom intervjuplan."]}
        )

    name_visibility = data.get(
        "name_visibility",
        existing.name_visibility if existing is not None else "hidden",
    )
    if not is_distributed:
        name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN

    # A saved internal draft automatically opens the short, assignment-based
    # conflict review. There is no separate administrative "open review" step:
    # members can review proposed candidates until the plan is published.
    conflict_review_open = bool(schedule) and not is_distributed

    return {
        "grid_changed": grid_changed,
        "schedule": schedule,
        "is_distributed": is_distributed,
        "conflict_review_open": conflict_review_open,
        "name_visibility": name_visibility,
    }


def _ensure_conflict_review_ready_for_publish(admission, data, schedule):
    if data.get("is_distributed") is not True or not schedule:
        return

    readiness = get_conflict_review_readiness(admission, schedule=schedule)
    incomplete_count = len(readiness["incomplete_participant_ids"])
    if incomplete_count:
        raise ScheduleInputError(
            {
                "schedule": [
                    f"{incomplete_count} intervjuere må kontrollere "
                    f"{readiness['missing_pair_count']} foreslåtte "
                    "kandidater før planen publiseres."
                ]
            }
        )


def _canonicalize_schedule(
    admission,
    user,
    data,
    existing,
    configuration,
    enabled_slots,
    state,
):
    schedule = state["schedule"]
    panel_size = data.get(
        "panel_size", existing.panel_size if existing is not None else None
    )
    solver_options = data.get(
        "solver_options",
        existing.solver_options if existing is not None else None,
    )
    if schedule and ("schedule" in data or state["is_distributed"]):
        try:
            schedule = canonicalize_schedule(
                admission=admission,
                schedule=schedule,
                start_date=configuration["start_date"],
                enabled_slots=enabled_slots,
                panel_size=panel_size,
                solver_options=solver_options,
                request_user_id=user.id,
                require_all_candidates=state["is_distributed"],
                end_date=configuration["end_date"],
                session_duration=configuration["session_duration"],
                day_start_minute=configuration["day_start_minute"],
                day_end_minute=configuration["day_end_minute"],
                chunk_size=data.get(
                    "chunk_size", existing.chunk_size if existing is not None else 4
                ),
                chunk_break_minutes=data.get(
                    "chunk_break_minutes",
                    existing.chunk_break_minutes if existing is not None else 0,
                ),
            )
        except ScheduleValidationError as exc:
            raise ScheduleInputError({exc.field: [exc.message]}) from exc
    return schedule, panel_size, solver_options


def _persist_schedule(
    admission,
    user,
    data,
    existing,
    configuration,
    enabled_windows,
    enabled_slots,
    state,
    schedule,
    panel_size,
    solver_options,
):
    conflict_review_was_open = bool(
        existing is not None and existing.conflict_review_open
    )
    with transaction.atomic():
        saved, _ = SavedSchedule.objects.update_or_create(
            admission=admission,
            defaults={
                "schedule": schedule,
                "start_date": configuration["start_date"],
                "end_date": configuration["end_date"],
                "session_duration": configuration["session_duration"],
                "enabled_windows": enabled_windows,
                "enabled_slots": enabled_slots,
                "day_start_minute": configuration["day_start_minute"],
                "day_end_minute": configuration["day_end_minute"],
                "chunk_size": data.get(
                    "chunk_size", existing.chunk_size if existing is not None else 4
                ),
                "chunk_break_minutes": data.get(
                    "chunk_break_minutes",
                    existing.chunk_break_minutes if existing is not None else 0,
                ),
                "panel_size": panel_size,
                "solver_options": solver_options,
                "is_distributed": state["is_distributed"],
                "conflict_review_open": state["conflict_review_open"],
                "name_visibility": state["name_visibility"],
            },
        )

        if conflict_review_was_open != saved.conflict_review_open:
            ConflictReviewAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved,
                actor=user,
                actor_username=user.username,
                action=(
                    ConflictReviewAuditEvent.ACTION_OPENED
                    if saved.conflict_review_open
                    else ConflictReviewAuditEvent.ACTION_CLOSED
                ),
            )

        if not saved.is_distributed:
            set_group_name_visibility(
                saved,
                saved.revealed_groups.all(),
                False,
                user,
            )
        elif "name_visibility" in data:
            show_names = (
                data["name_visibility"] == SavedSchedule.NAME_VISIBILITY_COMMITTEE
            )
            if not show_names:
                set_group_name_visibility(
                    saved,
                    saved.revealed_groups.all(),
                    False,
                    user,
                )
            else:
                set_group_name_visibility(
                    saved,
                    saved.revealed_groups.exclude(pk__in=admission.groups.all()),
                    False,
                    user,
                )
                set_group_name_visibility(
                    saved,
                    admission.groups.all(),
                    True,
                    user,
                )

        if state["grid_changed"] and existing is not None:
            admission.interview_availabilities.all().delete()

        SolveJob.objects.filter(admission=admission).delete()

    return saved


@transaction.atomic
def update_saved_schedule(
    *,
    admission,
    user,
    data,
    is_admin,
    is_recruiter,
    is_admission_admin=False,
):
    admission = Admission.objects.select_for_update().get(pk=admission.pk)
    existing = SavedSchedule.objects.filter(admission=admission).first()

    mutable_fields = set(data) - {"expected_updated_at"}
    if not is_admission_admin and mutable_fields == {"name_visibility"}:
        saved = _update_group_visibility(
            admission,
            user,
            data,
            existing,
            is_recruiter,
        )
        return ScheduleUpdateResult(admission=admission, saved_schedule=saved)

    if not is_admission_admin and "name_visibility" in mutable_fields:
        raise SchedulePermissionDenied

    if not is_admin:
        raise SchedulePermissionDenied

    _ensure_revision_matches(data, existing)
    if existing is not None:
        ensure_window_fields(existing)

    configuration = _resolve_schedule_configuration(data, existing)
    enabled_windows, enabled_slots = _resolve_enabled_windows(
        data,
        existing,
        configuration,
    )
    state = _resolve_schedule_state(data, existing, configuration, enabled_windows)
    schedule, panel_size, solver_options = _canonicalize_schedule(
        admission,
        user,
        data,
        existing,
        configuration,
        enabled_slots,
        state,
    )
    _ensure_conflict_review_ready_for_publish(admission, data, schedule)
    saved = _persist_schedule(
        admission,
        user,
        data,
        existing,
        configuration,
        enabled_windows,
        enabled_slots,
        state,
        schedule,
        panel_size,
        solver_options,
    )
    return ScheduleUpdateResult(admission=admission, saved_schedule=saved)
