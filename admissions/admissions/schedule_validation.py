from datetime import date

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    candidate_identity_is_revealed,
    get_candidate_pseudonyms,
)
from admissions.admissions.models import (
    InterviewAvailability,
    LegoUser,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.schedule_policy import (
    SchedulePolicyError,
    normalize_schedule_policy,
)
from admissions.admissions.schedule_windows import (
    enabled_windows_to_slots,
    parse_slot_key,
)
from admissions.admissions.scheduling_utils import (
    get_eligible_interviewer_ids,
    get_interviewer_participation,
)

MINUTES_PER_DAY = 24 * 60


class ScheduleValidationError(Exception):
    def __init__(self, field, message):
        self.field = field
        self.message = message
        super().__init__(message)


def encode_slot_keys(slot_keys, start_date):
    encoded = set()
    for key in slot_keys or []:
        parsed = parse_slot_key(str(key))
        if parsed is None:
            continue
        date_text, minute = parsed
        try:
            slot_date = date.fromisoformat(date_text)
        except ValueError:
            continue
        day_index = (slot_date - start_date).days
        if day_index >= 0 and 0 <= minute < MINUTES_PER_DAY:
            encoded.add(day_index * MINUTES_PER_DAY + minute)
    return encoded


def build_solver_blocks(
    *,
    day_count,
    day_start_minute,
    day_end_minute,
    session_duration,
    chunk_size,
    chunk_break_minutes,
):
    duration = max(int(session_duration or 60), 1)
    chunk_size = max(int(chunk_size or 1), 1)
    break_minutes = max(int(chunk_break_minutes or 0), 0)
    blocks = []
    for day_index in range(day_count):
        minute = day_start_minute
        while minute + duration <= day_end_minute:
            block = []
            for _ in range(chunk_size):
                if minute + duration > day_end_minute:
                    break
                block.append(day_index * MINUTES_PER_DAY + minute)
                minute += duration
            if block:
                blocks.append(block)
            minute += break_minutes
    return blocks


def filter_solver_blocks(blocks, open_slots):
    open_slot_set = set(open_slots)
    return [
        [slot for slot in block if slot in open_slot_set]
        for block in blocks
        if any(slot in open_slot_set for slot in block)
    ]


def build_solver_block_metadata(blocks, open_slots):
    open_slot_set = set(open_slots)
    metadata = []
    for block_index, block in enumerate(blocks):
        usable_slots = [slot for slot in block if slot in open_slot_set]
        metadata.append(
            {
                "index": block_index,
                "day": block[0] // MINUTES_PER_DAY,
                "start_time": block[0],
                "canonical_slots": list(block),
                "usable_slots": usable_slots,
                "has_zero_usable_slots": not usable_slots,
            }
        )
    return metadata


def build_resolved_solver_blocks(resolved_blocks, start_date):
    """Encode persisted layout block definitions for the solver.

    Manual definitions are validated when they are saved. This defensive
    conversion still rejects malformed persisted data instead of silently
    changing block membership during a rehydrated solve.
    """
    blocks = []
    for raw_block in resolved_blocks or []:
        if not isinstance(raw_block, dict) or not isinstance(
            raw_block.get("slots"), list
        ):
            raise ScheduleValidationError(
                "resolved_blocks", "Lagrede blokker har ugyldig format."
            )
        encoded_slots = []
        for key in raw_block["slots"]:
            parsed = parse_slot_key(str(key))
            if parsed is None:
                raise ScheduleValidationError(
                    "resolved_blocks", "Lagrede blokker har en ugyldig tidsluke."
                )
            date_text, minute = parsed
            try:
                slot_date = date.fromisoformat(date_text)
            except ValueError as exc:
                raise ScheduleValidationError(
                    "resolved_blocks", "Lagrede blokker har en ugyldig dato."
                ) from exc
            day_index = (slot_date - start_date).days
            if day_index < 0 or not 0 <= minute < MINUTES_PER_DAY:
                raise ScheduleValidationError(
                    "resolved_blocks", "Lagrede blokker har en ugyldig tidsluke."
                )
            encoded_slots.append(day_index * MINUTES_PER_DAY + minute)
        if not encoded_slots:
            raise ScheduleValidationError(
                "resolved_blocks", "En lagret blokk må inneholde minst én tidsluke."
            )
        blocks.append(encoded_slots)
    if not blocks:
        raise ScheduleValidationError(
            "resolved_blocks", "Det lagrede oppsettet krever minst én blokk."
        )
    return blocks


def _solver_blocks(saved, open_slots):
    if saved.resolved_blocks:
        configured_blocks = build_resolved_solver_blocks(
            saved.resolved_blocks,
            saved.start_date,
        )
    else:
        end_date = saved.end_date or saved.start_date
        configured_blocks = build_solver_blocks(
            day_count=(end_date - saved.start_date).days + 1,
            day_start_minute=saved.day_start_minute,
            day_end_minute=saved.day_end_minute,
            session_duration=saved.session_duration,
            chunk_size=saved.chunk_size,
            chunk_break_minutes=saved.chunk_break_minutes,
        )
    return build_solver_block_metadata(configured_blocks, open_slots)


def canonicalize_solver_payload(admission, saved, data, request_user):
    saved_slot_keys = saved.enabled_slots or enabled_windows_to_slots(
        saved.enabled_windows, saved.session_duration
    )
    all_slots = sorted(encode_slot_keys(saved_slot_keys, saved.start_date))
    if not all_slots:
        raise ScheduleValidationError(
            "all_slots", "Tidsoppsettet må ha minst én åpen tidsluke."
        )
    solver_blocks = _solver_blocks(saved, all_slots)

    applications = list(
        UserApplication.objects.filter(admission=admission).select_related("user")
    )
    application_map = {str(application.pk): application for application in applications}
    requested_candidate_ids = [str(item["id"]) for item in data["candidates"]]
    if set(requested_candidate_ids) != set(application_map):
        raise ScheduleValidationError(
            "candidates", "Kandidatlisten samsvarer ikke med det aktive opptaket."
        )

    submitted = list(
        InterviewAvailability.objects.filter(admission=admission).select_related("user")
    )
    participation = get_interviewer_participation(admission, saved)
    unresolved_ids = {
        user_id
        for user_id, state in participation.items()
        if state == InterviewAvailability.PARTICIPATION_AWAITING
    }
    if unresolved_ids:
        raise ScheduleValidationError(
            "interviewers",
            "Alle intervjuere må sende inn tilgjengelighet eller melde at de ikke deltar.",
        )
    participant_ids = {
        user_id
        for user_id, state in participation.items()
        if state == InterviewAvailability.PARTICIPATION_PARTICIPATING
    }
    if data["panel_size"] > len(participant_ids):
        raise ScheduleValidationError(
            "panel_size",
            "Panelstørrelsen kan ikke være større enn intervjuergruppen.",
        )
    requested_interviewer_ids = [str(item["id"]) for item in data["interviewers"]]
    if set(requested_interviewer_ids) != {str(value) for value in participant_ids}:
        raise ScheduleValidationError(
            "interviewers", "Intervjuerlisten samsvarer ikke med de som deltar."
        )

    user_map = {
        str(user.pk): user for user in LegoUser.objects.filter(id__in=participant_ids)
    }
    availability_map = {str(item.user_id): item for item in submitted}
    candidate_ids = set(application_map)
    candidate_pseudonyms = (
        {}
        if candidate_identity_is_revealed(saved)
        else get_candidate_pseudonyms(admission)
    )

    def candidate_display_name(candidate_id):
        application = application_map[candidate_id]
        return candidate_pseudonyms.get(
            candidate_id,
            application.user.get_full_name() or application.user.username,
        )

    candidates = [
        {
            "id": candidate_id,
            "name": candidate_display_name(candidate_id),
            "gender": {
                "male": "M",
                "female": "F",
            }.get(application_map[candidate_id].user.gender, ""),
        }
        for candidate_id in requested_candidate_ids
    ]
    interviewers = []
    for interviewer_id in requested_interviewer_ids:
        user = user_map.get(interviewer_id)
        if user is None:
            raise ScheduleValidationError(
                "interviewers", "Intervjuerlisten inneholder en ukjent bruker."
            )
        availability = availability_map.get(interviewer_id)
        submitted_slots = availability.slots if availability is not None else []
        interviewers.append(
            {
                "id": interviewer_id,
                "name": user.get_full_name() or user.username,
                "gender": {"male": "M", "female": "F"}.get(user.gender, ""),
                "availability": sorted(
                    encode_slot_keys(submitted_slots, saved.start_date).intersection(
                        all_slots
                    )
                ),
                "biased": [
                    str(value)
                    for value in (availability.conflicts if availability else [])
                    if str(value) in candidate_ids
                ],
            }
        )

    locked_assignments = []
    for assignment in data.get("locked_assignments", []):
        candidate_id = str(assignment.get("candidate_id") or "")
        if candidate_id not in application_map:
            raise ScheduleValidationError(
                "locked_assignments", "En låst kandidat er ikke aktiv i opptaket."
            )
        panel = []
        for member in assignment.get("panel", []):
            interviewer_id = str(member.get("id") or "")
            if interviewer_id not in user_map:
                raise ScheduleValidationError(
                    "locked_assignments", "Et låst panel har en ukjent bruker."
                )
            panel.append(
                {
                    "id": interviewer_id,
                    "name": user_map[interviewer_id].get_full_name()
                    or user_map[interviewer_id].username,
                }
            )
        locked_assignments.append(
            {
                "candidate_id": candidate_id,
                "candidate": candidate_display_name(candidate_id),
                "time": assignment["time"],
                "panel": panel,
            }
        )

    return {
        "candidates": candidates,
        "interviewers": interviewers,
        "all_slots": all_slots,
        "blocks": [
            block["usable_slots"] for block in solver_blocks if block["usable_slots"]
        ],
        "block_metadata": solver_blocks,
        "locked_assignments": locked_assignments,
    }


def canonicalize_schedule(
    *,
    admission,
    schedule,
    start_date,
    enabled_slots,
    panel_size,
    solver_options,
    request_user_id,
    require_all_candidates,
    end_date,
    session_duration,
    day_start_minute,
    day_end_minute,
    chunk_size,
    chunk_break_minutes,
    resolved_blocks=None,
    availability_generation=1,
    legacy_submission_without_generation=False,
):
    if not panel_size:
        raise ScheduleValidationError("panel_size", "Panelstørrelse må være satt.")
    try:
        policy = normalize_schedule_policy(solver_options, persisted=True)
    except SchedulePolicyError as exc:
        raise ScheduleValidationError("solver_options", str(exc)) from exc

    applications = list(
        UserApplication.objects.filter(admission=admission).select_related("user")
    )
    candidate_map = {str(application.pk): application for application in applications}
    enabled_times = encode_slot_keys(enabled_slots, start_date)
    if not enabled_times:
        raise ScheduleValidationError(
            "schedule", "Tidsoppsettet må ha minst én åpen tidsluke."
        )

    allowed_user_ids = get_eligible_interviewer_ids(admission)
    participating_user_ids = {
        user_id
        for user_id, state in get_interviewer_participation(admission).items()
        if state == InterviewAvailability.PARTICIPATION_PARTICIPATING
    }
    if panel_size > len(participating_user_ids):
        raise ScheduleValidationError(
            "panel_size",
            "Panelstørrelsen kan ikke være større enn intervjuergruppen.",
        )
    user_map = {
        str(user.pk): user for user in LegoUser.objects.filter(id__in=allowed_user_ids)
    }
    availability = {
        str(item.user_id): item
        for item in InterviewAvailability.objects.filter(
            admission=admission, user_id__in=allowed_user_ids
        )
    }

    allow_overtime = policy.allows_availability_deviations
    seen_candidates = set()
    seen_times = set()
    canonical = []
    for item in schedule:
        candidate_id = str(item.get("candidate_id") or "")
        application = candidate_map.get(candidate_id)
        if application is None:
            raise ScheduleValidationError(
                "schedule", "Planen inneholder en ukjent kandidat."
            )
        if candidate_id in seen_candidates:
            raise ScheduleValidationError(
                "schedule", "En kandidat kan bare ha ett intervju."
            )

        interview_time = item["time"]
        if interview_time not in enabled_times:
            raise ScheduleValidationError(
                "schedule", "Planen inneholder et tidspunkt som ikke er åpnet."
            )
        if interview_time in seen_times:
            raise ScheduleValidationError(
                "schedule", "To intervjuer kan ikke ha samme tidspunkt."
            )

        panel = item.get("panel") or []
        if len(panel) != panel_size:
            raise ScheduleValidationError(
                "schedule", "Alle intervjuer må ha riktig panelstørrelse."
            )
        panel_ids = [str(member.get("id") or "") for member in panel]
        if len(panel_ids) != len(set(panel_ids)):
            raise ScheduleValidationError(
                "schedule", "Et panel kan ikke inneholde samme person flere ganger."
            )
        if str(application.user_id) in panel_ids:
            raise ScheduleValidationError(
                "schedule", "En kandidat kan ikke intervjue seg selv."
            )

        canonical_panel = []
        for interviewer_id in panel_ids:
            interviewer = user_map.get(interviewer_id)
            if interviewer is None:
                raise ScheduleValidationError(
                    "schedule", "Planen inneholder en ukjent intervjuer."
                )
            if interviewer.pk not in participating_user_ids:
                raise ScheduleValidationError(
                    "schedule",
                    "Planen inneholder en intervjuer som ikke deltar.",
                )
            saved_availability = availability.get(interviewer_id)
            conflicts = (
                set(str(value) for value in (saved_availability.conflicts or []))
                if saved_availability
                else set()
            )
            if candidate_id in conflicts:
                raise ScheduleValidationError(
                    "schedule", "Planen bryter en registrert inhabilitet."
                )
            available_times = (
                encode_slot_keys(saved_availability.slots, start_date)
                if saved_availability
                and (
                    saved_availability.submitted_grid_generation
                    == availability_generation
                    or (
                        legacy_submission_without_generation
                        and saved_availability.submitted_grid_generation is None
                    )
                )
                else set()
            )
            is_overtime = interview_time not in available_times
            if is_overtime and not allow_overtime:
                raise ScheduleValidationError(
                    "schedule", "Planen krever overtid som er slått av."
                )
            canonical_panel.append(
                {
                    "id": interviewer_id,
                    "name": interviewer.get_full_name() or interviewer.username,
                    "is_overtime": is_overtime,
                }
            )

        canonical_item = {
            "candidate_id": candidate_id,
            "candidate": application.user.get_full_name() or application.user.username,
            "time": interview_time,
            "panel": canonical_panel,
        }
        if "locked" in item:
            canonical_item["locked"] = item["locked"]
        if "booking_source" in item:
            canonical_item["booking_source"] = item["booking_source"]
        canonical.append(canonical_item)
        seen_candidates.add(candidate_id)
        seen_times.add(interview_time)

    if require_all_candidates and seen_candidates != set(candidate_map):
        raise ScheduleValidationError(
            "schedule", "Alle aktive kandidater må ha et intervju før publisering."
        )

    if (solver_options or {}).get("enforce_same_gender"):
        interviewer_genders = {
            str(user.pk): constants.LEGO_GENDER_TO_PANEL_CODE.get(user.gender, "")
            for user in user_map.values()
        }
        if any(interviewer_genders.values()):
            for item in canonical:
                candidate_gender = constants.LEGO_GENDER_TO_PANEL_CODE.get(
                    candidate_map[item["candidate_id"]].user.gender, ""
                )
                if candidate_gender and not any(
                    interviewer_genders.get(member["id"]) == candidate_gender
                    for member in item["panel"]
                ):
                    raise ScheduleValidationError(
                        "schedule",
                        "Planen mangler en intervjuer med samme kjønn som kandidaten.",
                    )

    if policy.requires_stable_panel:
        if resolved_blocks:
            configured_blocks = build_resolved_solver_blocks(
                resolved_blocks, start_date
            )
        else:
            effective_end_date = end_date or start_date
            configured_blocks = build_solver_blocks(
                day_count=(effective_end_date - start_date).days + 1,
                day_start_minute=day_start_minute,
                day_end_minute=day_end_minute,
                session_duration=session_duration,
                chunk_size=chunk_size,
                chunk_break_minutes=chunk_break_minutes,
            )
        blocks = build_solver_block_metadata(configured_blocks, enabled_times)
        block_by_time = {
            interview_time: block["index"]
            for block in blocks
            for interview_time in block["usable_slots"]
        }
        panel_by_block = {}
        for item in canonical:
            block_index = block_by_time.get(item["time"])
            if block_index is None:
                continue
            panel_ids = frozenset(member["id"] for member in item["panel"])
            previous = panel_by_block.setdefault(block_index, panel_ids)
            if previous != panel_ids:
                raise ScheduleValidationError(
                    "schedule", "Alle intervjuer i samme blokk må ha samme panel."
                )

    return canonical
