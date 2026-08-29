import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.db import transaction
from django.utils import timezone

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    ConflictReviewList,
    InterviewAvailability,
    NameVisibilityAuditEvent,
    SavedSchedule,
    ScheduleDeviationApproval,
)
from admissions.admissions.schedule_layout import (
    ScheduleLayoutError,
    build_grid_slot_keys,
    build_standard_slot_blocks,
    derive_version_two_layout,
)
from admissions.admissions.schedule_policy import (
    SchedulePolicyError,
    build_deviation_review,
    new_admission_solver_options,
    normalize_schedule_policy,
    solver_options_for_storage,
)
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_schedule,
)
from admissions.admissions.schedule_windows import (
    enabled_windows_to_slots,
    make_slot_key,
    normalize_enabled_windows,
    parse_slot_key,
    slots_to_enabled_windows,
)
from admissions.admissions.scheduling_utils import (
    build_conflict_review_lists,
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
    if saved_schedule.enabled_slots:
        saved_schedule.enabled_windows = slots_to_enabled_windows(
            saved_schedule.enabled_slots,
            saved_schedule.session_duration,
        )
    elif saved_schedule.enabled_windows:
        saved_schedule.enabled_slots = enabled_windows_to_slots(
            saved_schedule.enabled_windows,
            saved_schedule.session_duration,
        )

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
    group,
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

    # A schedule belongs to exactly one committee now, so this toggle is
    # simply that committee's own name_visibility - there is no other
    # committee it could mean anything for.
    if visibility != existing.name_visibility:
        was_revealed = (
            existing.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        is_revealed = visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        existing.name_visibility = visibility
        existing.save(update_fields=["name_visibility", "updated_at"])
        if was_revealed != is_revealed:
            NameVisibilityAuditEvent.objects.create(
                admission=admission,
                saved_schedule=existing,
                group=group,
                group_name=group.name,
                actor=user,
                actor_username=user.username,
                action=(
                    NameVisibilityAuditEvent.ACTION_REVEALED
                    if is_revealed
                    else NameVisibilityAuditEvent.ACTION_HIDDEN
                ),
            )
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
    if "enabled_slots" in data:
        canonical_slots, invalid_key = canonicalize_slot_keys(data["enabled_slots"])
        if canonical_slots is None:
            raise ScheduleInputError(
                {"enabled_slots": [f"Ugyldig tidsluke: {invalid_key}"]}
            )
        enabled_slots = canonical_slots
        if "enabled_windows" in data:
            supplied_windows = normalize_enabled_windows(data["enabled_windows"])
            supplied_slots = enabled_windows_to_slots(
                supplied_windows, session_duration
            )
            if supplied_slots != enabled_slots:
                raise ScheduleInputError(
                    {
                        "enabled_windows": [
                            "Tidsvinduer og eksplisitte tidsluker må beskrive samme oppsett."
                        ]
                    }
                )
    elif "enabled_windows" in data:
        supplied_windows = normalize_enabled_windows(data["enabled_windows"])
        enabled_slots = enabled_windows_to_slots(supplied_windows, session_duration)
    elif existing is not None:
        duration_changed = existing.session_duration != session_duration
        if duration_changed and existing.enabled_windows:
            enabled_slots = enabled_windows_to_slots(
                existing.enabled_windows, session_duration
            )
        else:
            enabled_slots = list(existing.enabled_slots or [])
            if not enabled_slots and existing.enabled_windows:
                enabled_slots = enabled_windows_to_slots(
                    existing.enabled_windows, existing.session_duration
                )
    else:
        enabled_slots = []

    if len(enabled_slots) > constants.MAX_SCHEDULE_SLOTS:
        raise ScheduleInputError(
            {"enabled_slots": ["Tidsoppsettet inneholder for mange luker."]}
        )
    uses_version_two_grid = "slot_overrides" in data or (
        existing is not None
        and existing.layout_version >= 2
        and "manual_blocks" not in data
        and data.get("block_mode") != SavedSchedule.BLOCK_MODE_MANUAL
    )
    valid_grid_slots = None
    if uses_version_two_grid:
        valid_grid_slots = set(
            build_grid_slot_keys(
                start_date=configuration["start_date"],
                end_date=configuration["end_date"],
                day_start_minute=configuration["day_start_minute"],
                day_end_minute=configuration["day_end_minute"],
                session_duration=session_duration,
                chunk_size=data.get(
                    "chunk_size", existing.chunk_size if existing is not None else 4
                ),
                chunk_break_minutes=data.get(
                    "chunk_break_minutes",
                    existing.chunk_break_minutes if existing is not None else 0,
                ),
            )
        )
    for slot in enabled_slots:
        parsed = parse_slot_key(slot)
        if parsed is None:
            raise ScheduleInputError({"enabled_slots": [f"Ugyldig tidsluke: {slot}"]})
        date_text, minute = parsed
        try:
            window_date = datetime.strptime(date_text, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ScheduleInputError(
                {"enabled_slots": [f"Ugyldig tidsluke: {slot}"]}
            ) from exc
        if (
            window_date < configuration["start_date"]
            or window_date > configuration["effective_end_date"]
            or minute < configuration["day_start_minute"]
            or minute + session_duration > configuration["day_end_minute"]
            or (valid_grid_slots is not None and slot not in valid_grid_slots)
            or (
                valid_grid_slots is None
                and (minute - configuration["day_start_minute"]) % session_duration != 0
            )
        ):
            raise ScheduleInputError(
                {
                    "enabled_slots": [
                        "Tidsluker må ligge innenfor perioden og følge intervjulengden."
                    ]
                }
            )
    enabled_windows = slots_to_enabled_windows(enabled_slots, session_duration)
    return enabled_windows, enabled_slots


def _resolve_legacy_block_configuration(data, existing, configuration):
    block_mode = data.get(
        "block_mode",
        (
            existing.block_mode
            if existing is not None
            else SavedSchedule.BLOCK_MODE_STANDARD
        ),
    )
    if block_mode == SavedSchedule.BLOCK_MODE_STANDARD:
        return block_mode, []

    raw_blocks = data.get(
        "manual_blocks",
        existing.resolved_blocks if existing is not None else None,
    )
    if not isinstance(raw_blocks, list) or not raw_blocks:
        raise ScheduleInputError(
            {"manual_blocks": ["Manuell plan krever minst én blokk."]}
        )

    canonical_blocks = []
    seen_slots = set()
    membership_count = 0
    previous_block_last = None
    session_duration = configuration["session_duration"]
    for block_index, raw_block in enumerate(raw_blocks, start=1):
        if not isinstance(raw_block, dict) or not isinstance(
            raw_block.get("slots"), list
        ):
            raise ScheduleInputError(
                {"manual_blocks": [f"Blokk {block_index} har ugyldig format."]}
            )
        if not raw_block["slots"]:
            raise ScheduleInputError(
                {
                    "manual_blocks": [
                        f"Blokk {block_index} må inneholde minst én tidsluke."
                    ]
                }
            )

        block_date = None
        previous_minute = None
        canonical_slots = []
        for raw_slot in raw_block["slots"]:
            parsed = parse_slot_key(str(raw_slot))
            if parsed is None:
                raise ScheduleInputError(
                    {"manual_blocks": [f"Blokk {block_index} har en ugyldig tidsluke."]}
                )
            date_text, minute = parsed
            try:
                slot_date = datetime.strptime(date_text, "%Y-%m-%d").date()
            except ValueError as exc:
                raise ScheduleInputError(
                    {"manual_blocks": [f"Blokk {block_index} har en ugyldig dato."]}
                ) from exc
            if (
                slot_date < configuration["start_date"]
                or slot_date > configuration["effective_end_date"]
                or minute < configuration["day_start_minute"]
                or minute + session_duration > configuration["day_end_minute"]
                or (minute - configuration["day_start_minute"]) % session_duration != 0
            ):
                raise ScheduleInputError(
                    {
                        "manual_blocks": [
                            f"Blokk {block_index} må ligge innenfor perioden og følge intervjulengden."
                        ]
                    }
                )
            if block_date is not None and slot_date != block_date:
                raise ScheduleInputError(
                    {
                        "manual_blocks": [
                            f"Blokk {block_index} kan ikke gå over flere dager."
                        ]
                    }
                )
            if (
                previous_minute is not None
                and minute != previous_minute + session_duration
            ):
                raise ScheduleInputError(
                    {
                        "manual_blocks": [
                            f"Tidslukene i blokk {block_index} må være sammenhengende."
                        ]
                    }
                )
            canonical_slot = make_slot_key(slot_date, minute)
            if canonical_slot in seen_slots:
                raise ScheduleInputError(
                    {"manual_blocks": ["En tidsluke kan bare tilhøre én blokk."]}
                )
            block_date = slot_date
            previous_minute = minute
            seen_slots.add(canonical_slot)
            canonical_slots.append(canonical_slot)
            membership_count += 1
            if membership_count > constants.MAX_SOLVER_BLOCK_MEMBERSHIPS:
                raise ScheduleInputError(
                    {"manual_blocks": ["Den manuelle planen er for omfattende."]}
                )
        block_first = (block_date, parse_slot_key(canonical_slots[0])[1])
        block_last = (block_date, previous_minute)
        if previous_block_last is not None and block_first <= previous_block_last:
            raise ScheduleInputError(
                {
                    "manual_blocks": [
                        "Manuelle blokker må ligge i kronologisk rekkefølge."
                    ]
                }
            )
        previous_block_last = block_last
        canonical_blocks.append({"slots": canonical_slots})

    expected_slots = set()
    current_date = configuration["start_date"]
    while current_date <= configuration["effective_end_date"]:
        minute = configuration["day_start_minute"]
        while minute + session_duration <= configuration["day_end_minute"]:
            expected_slots.add(make_slot_key(current_date, minute))
            minute += session_duration
        current_date += timedelta(days=1)

    missing_slots = expected_slots - seen_slots
    if missing_slots:
        raise ScheduleInputError(
            {
                "manual_blocks": [
                    "Alle tidsluker, også stengte pauser, må tilhøre nøyaktig én manuell blokk."
                ]
            }
        )
    return block_mode, canonical_blocks


def _resolve_block_configuration(data, existing, configuration, enabled_slots):
    has_new_contract = "slot_overrides" in data
    existing_is_version_two = existing is not None and existing.layout_version >= 2
    legacy_request = not has_new_contract
    if legacy_request:
        configuration_fields = {
            "start_date",
            "end_date",
            "session_duration",
            "day_start_minute",
            "day_end_minute",
            "chunk_size",
            "chunk_break_minutes",
            "enabled_slots",
            "enabled_windows",
            "block_mode",
            "manual_blocks",
        }
        if (
            existing is not None
            and existing.layout_version >= 2
            and not configuration_fields.intersection(data)
        ):
            return {
                "layout_version": existing.layout_version,
                "block_mode": existing.block_mode,
                "resolved_blocks": existing.resolved_blocks,
                "slot_overrides": existing.slot_overrides,
                "legacy_compatibility": True,
            }
        explicitly_writes_legacy_manual_layout = (
            "manual_blocks" in data
            or data.get("block_mode") == SavedSchedule.BLOCK_MODE_MANUAL
        )
        if existing_is_version_two and not explicitly_writes_legacy_manual_layout:
            chunk_size = data.get("chunk_size", existing.chunk_size)
            chunk_break_minutes = data.get(
                "chunk_break_minutes", existing.chunk_break_minutes
            )
            standard_blocks = build_standard_slot_blocks(
                start_date=configuration["start_date"],
                end_date=configuration["end_date"],
                day_start_minute=configuration["day_start_minute"],
                day_end_minute=configuration["day_end_minute"],
                session_duration=configuration["session_duration"],
                chunk_size=chunk_size,
                chunk_break_minutes=chunk_break_minutes,
            )
            enabled_set = set(enabled_slots)
            inferred_base = {
                slot
                for block in standard_blocks
                if set(block["slots"]).issubset(enabled_set)
                for slot in block["slots"]
            }
            inferred_overrides = [
                {"slot": slot, "open": True}
                for slot in enabled_slots
                if slot not in inferred_base
            ]
            try:
                inferred_layout = derive_version_two_layout(
                    enabled_slots=enabled_slots,
                    slot_overrides=inferred_overrides,
                    start_date=configuration["start_date"],
                    end_date=configuration["end_date"],
                    day_start_minute=configuration["day_start_minute"],
                    day_end_minute=configuration["day_end_minute"],
                    session_duration=configuration["session_duration"],
                    chunk_size=chunk_size,
                    chunk_break_minutes=chunk_break_minutes,
                )
            except ScheduleLayoutError as exc:
                raise ScheduleInputError({"enabled_slots": [str(exc)]}) from exc
            return {
                "layout_version": 2,
                "legacy_compatibility": True,
                **inferred_layout,
            }
        block_mode, resolved_blocks = _resolve_legacy_block_configuration(
            data, existing, configuration
        )
        return {
            "layout_version": 1,
            "block_mode": block_mode,
            "resolved_blocks": resolved_blocks,
            "slot_overrides": [],
            "legacy_compatibility": True,
        }

    duration_changed = (
        existing is not None
        and existing.session_duration != configuration["session_duration"]
    )
    raw_overrides = data.get(
        "slot_overrides",
        (
            existing.slot_overrides
            if existing_is_version_two and not duration_changed
            else []
        ),
    )
    try:
        layout = derive_version_two_layout(
            enabled_slots=enabled_slots,
            slot_overrides=raw_overrides,
            start_date=configuration["start_date"],
            end_date=configuration["end_date"],
            day_start_minute=configuration["day_start_minute"],
            day_end_minute=configuration["day_end_minute"],
            session_duration=configuration["session_duration"],
            chunk_size=data.get(
                "chunk_size", existing.chunk_size if existing is not None else 4
            ),
            chunk_break_minutes=data.get(
                "chunk_break_minutes",
                existing.chunk_break_minutes if existing is not None else 0,
            ),
        )
    except ScheduleLayoutError as exc:
        raise ScheduleInputError({"slot_overrides": [str(exc)]}) from exc
    return {"layout_version": 2, "legacy_compatibility": False, **layout}


def _has_enabled_days_after(enabled_slots, boundary):
    """True while the framework has enabled days beyond the publish boundary.

    Slot keys are "YYYY-MM-DD|minute" strings, so the date half decides which
    calendar days the plan can still grow into. A boundary at or past the last
    enabled day means the whole framework is published and nothing remains to
    schedule.
    """
    if boundary is None:
        return False
    for slot in enabled_slots or []:
        if not isinstance(slot, str):
            continue
        day_text = slot.split("|", 1)[0]
        if day_text:
            try:
                if date.fromisoformat(day_text) > boundary:
                    return True
            except ValueError:
                continue
    return False


def _full_publish_boundary(start_date, schedule):
    """distributed_through for an unscoped ("is_distributed: true") publish.

    The calendar day of the last scheduled interview, plus a one-day margin -
    the special case in distributed_through's own docstring where the
    boundary lands past the whole plan rather than partway through it.
    """
    if not schedule or start_date is None:
        return None
    day_offsets = [
        int(item["time"]) // (24 * 60)
        for item in schedule
        if isinstance(item, dict) and isinstance(item.get("time"), int)
    ]
    if not day_offsets:
        return None
    return start_date + timedelta(days=max(day_offsets) + 1)


def _resolve_schedule_state(
    admission,
    data,
    existing,
    configuration,
    enabled_slots,
    layout,
):
    grid_changed = False
    added_slots = set()
    removed_slots = set()
    duration_changed = False
    should_clear_plan = False
    availability_generation = 1
    if existing is not None:
        old_slots = set(existing.enabled_slots or [])
        new_slots = set(enabled_slots)
        added_slots = new_slots - old_slots
        removed_slots = old_slots - new_slots
        duration_changed = (
            existing.session_duration != configuration["session_duration"]
        )
        next_chunk_size = data.get("chunk_size", existing.chunk_size)
        next_chunk_break_minutes = data.get(
            "chunk_break_minutes", existing.chunk_break_minutes
        )
        block_shape_changed = (
            existing.chunk_break_minutes != next_chunk_break_minutes
            or existing.chunk_size != next_chunk_size
        )
        structure_changed = (
            existing.start_date != configuration["start_date"]
            or existing.end_date != configuration["end_date"]
            or duration_changed
            or existing.day_start_minute != configuration["day_start_minute"]
            or existing.day_end_minute != configuration["day_end_minute"]
            or block_shape_changed
        )
        block_configuration_changed = (
            existing.layout_version != layout["layout_version"]
            or existing.block_mode != layout["block_mode"]
            or existing.resolved_blocks != layout["resolved_blocks"]
            or existing.slot_overrides != layout["slot_overrides"]
        )
        grid_changed = (
            structure_changed or old_slots != new_slots or block_configuration_changed
        )
        availability_generation = existing.availability_generation
        if duration_changed or added_slots or removed_slots:
            availability_generation += 1
        incoming_schedule = data.get("schedule")
        scheduled_slot_keys = {
            make_slot_key(
                existing.start_date + timedelta(days=int(item["time"]) // (24 * 60)),
                int(item["time"]) % (24 * 60),
            )
            for item in existing.schedule or []
            if isinstance(item, dict) and isinstance(item.get("time"), int)
        }
        layout_boundaries_rebuilt = (
            block_shape_changed or existing.layout_version != layout["layout_version"]
        )
        proposal_invalidated = (
            duration_changed
            or existing.start_date != configuration["start_date"]
            or layout_boundaries_rebuilt
            or bool(removed_slots.intersection(scheduled_slot_keys))
        )
        should_clear_plan = (
            proposal_invalidated
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
    # distributed_through is the field that actually gets written (see
    # models.py - is_distributed is a generated column derived from it and
    # the database rejects direct writes to it). "distributed_through" in
    # data takes precedence when present, for the admin's own publish-through
    # date control; is_distributed alone is still the all-or-nothing publish
    # toggle and computes the boundary for it.
    if should_clear_plan:
        distributed_through = None
    elif "distributed_through" in data:
        distributed_through = data["distributed_through"]
        if distributed_through is not None:
            if distributed_through < configuration["start_date"]:
                raise ScheduleInputError(
                    {
                        "distributed_through": [
                            "Kan ikke publisere før planens startdato."
                        ]
                    }
                )
            if (
                existing is not None
                and existing.distributed_through is not None
                and distributed_through < existing.distributed_through
            ):
                raise ScheduleInputError(
                    {
                        "distributed_through": [
                            "Publiseringsgrensen kan ikke flyttes bakover."
                        ]
                    }
                )
    elif "is_distributed" in data:
        if not data["is_distributed"]:
            distributed_through = None
        elif existing is not None and existing.distributed_through is not None:
            # On an already-published plan this flag means "stay published";
            # widening must arrive as an explicit distributed_through, or a
            # row edit silently converts a partial publish into a full one.
            distributed_through = existing.distributed_through
        else:
            distributed_through = _full_publish_boundary(
                configuration["start_date"], schedule
            )
    elif schedule_changed:
        distributed_through = None
    else:
        distributed_through = (
            existing.distributed_through if existing is not None else None
        )
    is_distributed = distributed_through is not None

    if (
        data.get("is_distributed") is True or data.get("distributed_through")
    ) and not schedule:
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
    # conflict review. There is no separate administrative "open review" step.
    # A prefix publish no longer ends the review either: while enabled days
    # remain beyond the boundary the plan can still grow (rolling admissions
    # add candidates that must be inhabilitet-checked before the next
    # publish), so the review stays open until the final day is published.
    conflict_review_open = bool(schedule) and (
        distributed_through is None
        or _has_enabled_days_after(enabled_slots, distributed_through)
    )
    # Is this save asking the server to (re)publish? Distinct from
    # `is_distributed` (the *post*-write state) because the three-way rule
    # for `published_without_review_by` cares about the intent: an unrelated
    # edit while published is not a fresh publish, an unlock back to draft
    # is not a publish, and only a publish that survives the gate counts.
    is_publish_request = (
        data.get("is_distributed") is True
        or bool(data.get("distributed_through"))
    ) and bool(schedule)

    return {
        "grid_changed": grid_changed,
        "added_slots": added_slots,
        "removed_slots": removed_slots,
        "duration_changed": duration_changed,
        "availability_generation": availability_generation,
        "should_clear_plan": should_clear_plan,
        "schedule": schedule,
        "is_distributed": is_distributed,
        "distributed_through": distributed_through,
        "conflict_review_open": conflict_review_open,
        "name_visibility": name_visibility,
        "is_publish_request": is_publish_request,
    }


def _ensure_conflict_review_ready_for_publish(admission, group, data, schedule):
    """Gate publish on a finished kandidatkontroll.

    Returns the ids of the interviewers whose check was outstanding and got
    published past anyway - empty in the normal case, and empty when nothing
    is being published. Raises unless the caller has explicitly said to go
    ahead without them.
    """
    is_publishing = data.get("is_distributed") is True or bool(
        data.get("distributed_through")
    )
    if not is_publishing or not schedule:
        return []

    readiness = get_conflict_review_readiness(admission, group, schedule=schedule)
    incomplete_ids = list(readiness["incomplete_participant_ids"])
    if not incomplete_ids:
        return []

    # Publishing anyway is allowed but never quiet: an admin can decide the
    # recruitment cannot wait for a member who has stopped answering, and
    # accepts that some pairings go out unchecked for inhabilitet. The
    # decision is recorded against the plan and against each person skipped
    # (see _record_conflict_review_bypass), and the published plan says so.
    if data.get("publish_without_full_review") is True:
        return incomplete_ids

    # Name up to a few of the missing reviewers so the admin can act
    # on the message - "9 må kontrollere" is unactionable, "Kari, Ola
    # og 7 andre" is a checklist. Names stay inside the admin who is
    # already mid-publish; the form is the source of the complete list.
    incomplete_count = len(incomplete_ids)
    names = _missing_reviewer_names(incomplete_ids)
    named = ", ".join(names[:3])
    suffix = (
        f" og {incomplete_count - len(names[:3])} andre"
        if incomplete_count > len(names[:3])
        else ""
    )
    raise ScheduleInputError(
        {
            "schedule": [
                f"{incomplete_count} intervjuere må kontrollere "
                f"{readiness['missing_pair_count']} foreslåtte "
                f"kandidater før planen publiseres: {named}{suffix}."
            ]
        }
    )


def _missing_reviewer_names(user_ids):
    """Best-effort display names for missing-reviewer error messages.

    Admins see this when they hit the publish gate mid-flow, so the names
    need to be recognisable (full name > username) and ordered so the list
    reads as a checklist. Membership lookups intentionally avoid any access
    checks - this is a server-side diagnostic and the caller is already
    the publish-gated admin.
    """
    from admissions.admissions.models import LegoUser

    str_ids = {str(user_id) for user_id in user_ids}
    users = {
        str(user.pk): user
        for user in LegoUser.objects.filter(pk__in=str_ids)
    }
    ordered = sorted(
        (users[str(user_id)] for user_id in user_ids if str(user_id) in users),
        key=lambda user: (
            (user.get_full_name() or user.username).lower(),
            user.username,
        ),
    )
    return [
        user.get_full_name() or user.username
        for user in ordered
    ]


def _record_conflict_review_bypass(admission, saved, user, skipped_user_ids):
    """Write the audit trail for a publish that skipped the kandidatkontroll.

    One event per skipped person, so the log answers "was my check waived, by
    whom, when" per interviewer rather than only per plan.
    """
    from admissions.admissions.models import LegoUser

    if not skipped_user_ids:
        return

    users = {
        str(skipped.pk): skipped
        for skipped in LegoUser.objects.filter(
            pk__in=[str(user_id) for user_id in skipped_user_ids]
        )
    }
    for user_id in skipped_user_ids:
        skipped = users.get(str(user_id))
        ConflictReviewAuditEvent.objects.create(
            admission=admission,
            saved_schedule=saved,
            actor=user,
            actor_username=user.username,
            subject_user=skipped,
            subject_username=skipped.username if skipped else "",
            action=ConflictReviewAuditEvent.ACTION_BYPASSED,
        )


def _canonicalize_schedule(
    admission,
    group,
    user,
    data,
    existing,
    configuration,
    enabled_slots,
    state,
    layout,
):
    schedule = state["schedule"]
    panel_size = data.get(
        "panel_size", existing.panel_size if existing is not None else None
    )
    solver_options = data.get(
        "solver_options",
        (
            existing.solver_options
            if existing is not None
            else new_admission_solver_options()
        ),
    )
    if "solver_options" in data and solver_options is not None:
        try:
            solver_options = solver_options_for_storage(solver_options)
        except SchedulePolicyError as exc:
            raise ScheduleInputError({"solver_options": [str(exc)]}) from exc
    framework_fields = {
        "start_date",
        "end_date",
        "session_duration",
        "day_start_minute",
        "day_end_minute",
        "chunk_size",
        "chunk_break_minutes",
        "enabled_slots",
        "enabled_windows",
        "block_mode",
        "manual_blocks",
        "slot_overrides",
    }
    preserves_unpublished_draft = (
        existing is not None
        and not state["is_distributed"]
        and "schedule" in data
        and data["schedule"] == existing.schedule
        and bool(framework_fields.intersection(data))
        and not {"solver_options", "panel_size", "is_distributed"}.intersection(data)
    )
    if (
        schedule
        and ("schedule" in data or state["is_distributed"])
        and not preserves_unpublished_draft
    ):
        try:
            schedule = canonicalize_schedule(
                admission=admission,
                group=group,
                schedule=schedule,
                start_date=configuration["start_date"],
                enabled_slots=enabled_slots,
                panel_size=panel_size,
                solver_options=solver_options,
                request_user_id=user.id,
                # A prefix publish may leave candidates unscheduled on the
                # unpublished days still to come; only publishing through the
                # last enabled day demands that everyone has an interview, so
                # nobody can silently fall through at the end of the plan.
                # defer_unplaced_candidates is the explicit way out: an
                # acknowledgment that the remaining candidates are planned
                # for later even though no further days are enabled yet.
                require_all_candidates=state["is_distributed"]
                and not _has_enabled_days_after(
                    enabled_slots, state["distributed_through"]
                )
                and not data.get("defer_unplaced_candidates"),
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
                resolved_blocks=layout["resolved_blocks"],
                availability_generation=state["availability_generation"],
                legacy_submission_without_generation=(
                    layout["layout_version"] == 1
                    or layout.get("legacy_compatibility", False)
                ),
            )
        except ScheduleValidationError as exc:
            raise ScheduleInputError({exc.field: [exc.message]}) from exc
    return schedule, panel_size, solver_options


def _deviation_review_for_publish(data, schedule, solver_options, state, layout):
    if data.get("is_distributed") is not True or not schedule:
        return None
    try:
        policy = normalize_schedule_policy(solver_options, persisted=True)
    except SchedulePolicyError as exc:
        raise ScheduleInputError({"solver_options": [str(exc)]}) from exc
    review = build_deviation_review(
        schedule=schedule,
        policy=policy,
        availability_generation=state["availability_generation"],
        layout_version=layout["layout_version"],
    )
    if (
        review["requires_approval"]
        and data.get("deviation_approval_fingerprint")
        != review["deviation_fingerprint"]
    ):
        raise ScheduleInputError(
            {
                "deviation_approval_fingerprint": [
                    "Bekreft de konkrete tilgjengelighetsavvikene før planen publiseres."
                ]
            }
        )
    return review


def _record_deviation_approval(admission, saved, user, review):
    if review is None or not review["requires_approval"]:
        return
    ScheduleDeviationApproval.objects.create(
        admission=admission,
        saved_schedule=saved,
        actor=user,
        actor_username=user.username,
        schedule_fingerprint=review["schedule_fingerprint"],
        deviation_fingerprint=review["deviation_fingerprint"],
        policy_snapshot=review["policy"],
        availability_generation=saved.availability_generation,
        layout_version=saved.layout_version,
    )


def _project_interview_availability(
    *, admission, group, existing_schedule, next_schedule, enabled_slots, state
):
    rows = list(
        InterviewAvailability.objects.select_for_update().filter(
            admission=admission, group=group
        )
    )
    if not rows:
        return
    enabled_set = set(enabled_slots)
    changed_at = timezone.now()
    for row in rows:
        if state["duration_changed"]:
            row.slots = []
            row.submitted_grid_generation = None
        elif state["removed_slots"]:
            row.slots = [slot for slot in row.slots or [] if slot in enabled_set]

        # reviewed_candidate_ids is deliberately left untouched by schedule
        # changes: an attestation is a fact about the (interviewer, candidate)
        # pair - "I have checked this person" - not about where the plan put
        # them. Trimming it on every re-solve forced everyone (leaders most of
        # all, since their scope is every candidate) to re-check the same
        # people after each solve. Withdrawn candidates are already purged by
        # the UserApplication pre_delete signal; readiness compares the stored
        # ids against the current scope, so genuinely new candidates are the
        # only thing anyone is ever asked to check.
        row.updated_at = changed_at

    InterviewAvailability.objects.bulk_update(
        rows,
        ["slots", "submitted_grid_generation", "updated_at"],
    )


def _persist_schedule(
    admission,
    group,
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
    layout,
    skipped_reviewer_names=None,
):
    conflict_review_was_open = bool(
        existing is not None and existing.conflict_review_open
    )
    previous_name_visibility = (
        existing.name_visibility
        if existing is not None
        else SavedSchedule.NAME_VISIBILITY_HIDDEN
    )
    # Snapshotted before the setattr loop below, like the two fields above:
    # `saved` aliases `existing`, so after the loop every old-vs-new schedule
    # comparison degenerates to new-vs-new.
    previous_schedule = existing.schedule if existing is not None else None
    with transaction.atomic():
        desired_fields = {
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
            "block_mode": layout["block_mode"],
            "resolved_blocks": layout["resolved_blocks"],
            "layout_version": layout["layout_version"],
            "slot_overrides": layout["slot_overrides"],
            "availability_generation": state["availability_generation"],
            "panel_size": panel_size,
            "solver_options": solver_options,
            "distributed_through": state["distributed_through"],
            "conflict_review_open": state["conflict_review_open"],
            "name_visibility": state["name_visibility"],
        }
        # Three-way rule for the bypass note:
        # - taking the plan back to draft (publish_request is false) clears it,
        #   there is no published plan to mark;
        # - a fresh publish with everyone confirmed (skipped_reviewer_names
        #   is empty) replaces it with an empty list, wiping the previous
        #   waiver on the first review-complete republish;
        # - any other save (unrelated edit while published) keeps the
        #   existing list, so the note does not silently outlive a
        #   no-op-but-bumped-updated_at write.
        # Bypass-note rule. The note is published-plan metadata: it only
        # makes sense to write it when this save is mutating the publish
        # boundary (`distributed_through` changing). An unrelated edit
        # while published - e.g. a name-visibility change - must not
        # silently rewrite or clear the note, which is why we look at
        # the boundary delta rather than the user's intent field.
        # When the boundary is being moved: clearing the boundary (unlock
        # back to draft) wipes the note because there is no published
        # plan to mark; setting the boundary records the names of anyone
        # skipped (an empty list is the "review complete" case).
        new_publish_boundary = state["distributed_through"]
        boundary_changed = (
            existing is None
            or existing.distributed_through != new_publish_boundary
        )
        if boundary_changed:
            desired_fields["published_without_review_by"] = list(
                skipped_reviewer_names or []
            ) if new_publish_boundary is not None else []
        if "outreach_templates" in data:
            desired_fields["outreach_templates"] = data["outreach_templates"] or {}
        if existing is None:
            saved = SavedSchedule.objects.create(
                admission=admission, group=group, **desired_fields
            )
        else:
            # A byte-identical save must not bump updated_at: that token is the
            # optimistic lock, so a no-op write 409s concurrent admins and kills
            # DONE-but-undecided proposals.
            saved = existing
            changed_fields = [
                field
                for field, value in desired_fields.items()
                if getattr(saved, field) != value
            ]
            if changed_fields:
                for field in changed_fields:
                    setattr(saved, field, desired_fields[field])
                saved.save(update_fields=[*changed_fields, "updated_at"])
                if "distributed_through" in changed_fields:
                    # save(update_fields=...) doesn't refresh GeneratedField
                    # columns unless they're part of the same update, so
                    # is_distributed goes stale on this in-memory instance.
                    saved.refresh_from_db(fields=["is_distributed"])

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

        was_revealed = (
            previous_name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        is_revealed = saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        if was_revealed != is_revealed:
            NameVisibilityAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved,
                group=group,
                group_name=group.name,
                actor=user,
                actor_username=user.username,
                action=(
                    NameVisibilityAuditEvent.ACTION_REVEALED
                    if is_revealed
                    else NameVisibilityAuditEvent.ACTION_HIDDEN
                ),
            )

        if existing is not None:
            _project_interview_availability(
                admission=admission,
                group=group,
                existing_schedule=previous_schedule,
                next_schedule=schedule,
                enabled_slots=enabled_slots,
                state=state,
            )

        _refresh_conflict_review_lists(
            saved,
            existing is None or previous_schedule != schedule,
        )

    return saved


def _refresh_conflict_review_lists(saved, schedule_changed):
    """Re-snapshot who reviews whom, once per draft.

    Only on an actual schedule change: regenerating on every save would hand
    interviewers a different list between reading it and confirming it, which
    is precisely what a snapshot exists to prevent.
    """

    if not schedule_changed:
        return

    ConflictReviewList.objects.filter(saved_schedule=saved).delete()
    if not saved.schedule:
        return

    revision = uuid.uuid4()
    ConflictReviewList.objects.bulk_create(
        [
            ConflictReviewList(
                saved_schedule=saved,
                revision=revision,
                interviewer_id=interviewer_id,
                own_candidate_ids=entry["own_candidate_ids"],
                swap_candidate_ids=entry["swap_candidate_ids"],
                decoys=entry["decoys"],
            )
            for interviewer_id, entry in build_conflict_review_lists(saved).items()
        ]
    )


@transaction.atomic
def update_saved_schedule(
    *,
    admission,
    group,
    user,
    data,
    is_admin,
    is_recruiter,
    is_admission_admin=False,
):
    admission = Admission.objects.get(pk=admission.pk)
    existing = (
        SavedSchedule.objects.select_for_update()
        .filter(admission=admission, group=group)
        .first()
    )

    mutable_fields = set(data) - {"expected_updated_at"}
    if not is_admission_admin and mutable_fields == {"name_visibility"}:
        saved = _update_group_visibility(
            admission,
            group,
            user,
            data,
            existing,
            is_recruiter,
        )
        return ScheduleUpdateResult(admission=admission, saved_schedule=saved)

    if (is_recruiter or is_admin) and mutable_fields == {"outreach_templates"}:
        _ensure_revision_matches(data, existing)
        if existing is None:
            raise ScheduleNotFound
        existing.outreach_templates = data.get("outreach_templates") or {}
        existing.save(update_fields=["outreach_templates", "updated_at"])
        return ScheduleUpdateResult(admission=admission, saved_schedule=existing)

    # A name-visibility change never rides along with other mutations for a
    # non-admin: the audited reveal path is the visibility-only branch above.
    # The one exception is publishing - the publish dialog legitimately sends
    # the visibility choice together with is_distributed/distributed_through,
    # and the main path audits that reveal transition itself.
    is_publish_transition = data.get("is_distributed") is True or data.get(
        "distributed_through"
    )
    if (
        not is_admission_admin
        and "name_visibility" in mutable_fields
        and not is_publish_transition
    ):
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
    layout = _resolve_block_configuration(
        data,
        existing,
        configuration,
        enabled_slots,
    )
    enabled_windows = slots_to_enabled_windows(
        enabled_slots, configuration["session_duration"]
    )
    state = _resolve_schedule_state(
        admission,
        data,
        existing,
        configuration,
        enabled_slots,
        layout,
    )
    schedule, panel_size, solver_options = _canonicalize_schedule(
        admission,
        group,
        user,
        data,
        existing,
        configuration,
        enabled_slots,
        state,
        layout,
    )
    skipped_reviewer_ids = _ensure_conflict_review_ready_for_publish(
        admission, group, data, schedule
    )
    deviation_review = _deviation_review_for_publish(
        data,
        schedule,
        solver_options,
        state,
        layout,
    )
    saved = _persist_schedule(
        admission,
        group,
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
        layout,
        skipped_reviewer_names=_missing_reviewer_names(skipped_reviewer_ids),
    )
    _record_conflict_review_bypass(admission, saved, user, skipped_reviewer_ids)
    _record_deviation_approval(admission, saved, user, deviation_review)
    return ScheduleUpdateResult(admission=admission, saved_schedule=saved)
