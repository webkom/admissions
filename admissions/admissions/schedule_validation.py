from datetime import date

from admissions.admissions import constants
from admissions.admissions.models import (
    ConflictReviewList,
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
    conflict_review_v2_enabled,
    get_declared_conflict_candidate_ids,
    get_eligible_interviewer_ids,
    get_interviewer_participation,
    get_responding_interviewer_ids,
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


def _apply_day_scope(saved_slot_keys, saved, data):
    """Restrict the slot keys to days on or before data["day_scope_through"].

    The partial-plan workflow solves a few days at a time inside an already
    enabled grid: scoping the keys here scopes the encoded slots, the block
    metadata, and every interviewer's availability in one place, without
    touching the saved framework (which would invalidate availability
    answers). A scope beyond the period is clamped to it.
    """
    scope_through = data.get("day_scope_through")
    if not scope_through:
        return saved_slot_keys
    try:
        scope_date = date.fromisoformat(str(scope_through))
    except ValueError as exc:
        raise ScheduleValidationError(
            "day_scope_through", "Ugyldig dato for dagsomfang."
        ) from exc

    def _as_date(value):
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ScheduleValidationError(
                "day_scope_through", "Ugyldig dato for dagsomfang."
            ) from exc

    start_date = _as_date(saved.start_date)
    if scope_date < start_date:
        raise ScheduleValidationError(
            "day_scope_through",
            "Dagsomfanget kan ikke være før planens første dag.",
        )
    end_date = _as_date(saved.end_date) if saved.end_date else start_date
    scope_date = min(scope_date, end_date)
    scoped_keys = []
    for key in saved_slot_keys:
        parsed = parse_slot_key(str(key))
        if parsed is None:
            continue
        try:
            slot_date = date.fromisoformat(parsed[0])
        except ValueError:
            continue
        if slot_date <= scope_date:
            scoped_keys.append(key)
    if not scoped_keys:
        raise ScheduleValidationError(
            "day_scope_through",
            "Dagsomfanget inneholder ingen åpne tidsluker.",
        )
    return scoped_keys


def canonicalize_solver_payload(admission, saved, data, request_user):
    group = saved.group
    saved_slot_keys = saved.enabled_slots or enabled_windows_to_slots(
        saved.enabled_windows, saved.session_duration
    )
    saved_slot_keys = _apply_day_scope(saved_slot_keys, saved, data)
    all_slots = sorted(encode_slot_keys(saved_slot_keys, saved.start_date))
    if not all_slots:
        raise ScheduleValidationError(
            "all_slots", "Tidsoppsettet må ha minst én åpen tidsluke."
        )
    solver_blocks = _solver_blocks(saved, all_slots)

    applications = list(
        UserApplication.objects.filter(
            admission=admission, group_applications__group=group
        )
        .distinct()
        .select_related("user")
    )
    application_map = {str(application.pk): application for application in applications}
    requested_candidate_ids = [str(item["id"]) for item in data["candidates"]]
    if set(requested_candidate_ids) != set(application_map):
        raise ScheduleValidationError(
            "candidates", "Kandidatlisten samsvarer ikke med det aktive opptaket."
        )

    submitted = list(
        InterviewAvailability.objects.filter(
            admission=admission, group=group
        ).select_related("user")
    )
    participation = get_interviewer_participation(admission, group, saved)
    # Scoped to the people who can actually answer. The roster now also carries
    # committee members mirrored from LEGO who have never signed in here; they
    # show up as awaiting so an admin can see who to chase, but they can
    # neither submit availability nor opt out on their own, so requiring their
    # answer would hold the publish hostage to someone who will never give one.
    # An admin who has chased them can still record the answer on their behalf.
    can_respond = get_responding_interviewer_ids(admission, group)
    unresolved_ids = {
        user_id
        for user_id, state in participation.items()
        if state == InterviewAvailability.PARTICIPATION_AWAITING
        and user_id in can_respond
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
    participant_string_ids = {str(value) for value in participant_ids}
    if (data.get("options") or {}).get("require_experienced_panel") and not any(
        str(item.user_id) in participant_string_ids
        and item.experience_level == InterviewAvailability.EXPERIENCE_EXPERIENCED
        for item in submitted
    ):
        raise ScheduleValidationError(
            "options",
            "Minst én deltakende intervjuer må klassifiseres som erfaren.",
        )
    candidate_ids = set(application_map)
    candidates = [
        {
            "id": candidate_id,
            "user_id": str(application_map[candidate_id].user_id),
            "name": application_map[candidate_id].user.get_full_name()
            or application_map[candidate_id].user.username,
            "gender": {
                "male": "M",
                "female": "F",
            }.get(application_map[candidate_id].user.gender, ""),
        }
        for candidate_id in requested_candidate_ids
    ]
    derived_conflicts = get_declared_conflict_candidate_ids(admission, group)
    # A repair (an existing plan is being partly preserved, so some
    # assignments arrive locked) must never place a candidate onto an
    # interviewer's panel who was outside their own+swap review scope for the
    # plan being repaired - otherwise the repaired plan contains a pairing
    # nobody ever reviewed. Not applied to a fresh solve: nothing has been
    # reviewed yet, so there is no scope to enforce.
    # Also checked directly (not just via an empty ConflictReviewList
    # queryset): rows generated before a flag-flip must not keep constraining
    # repairs after it's switched off.
    is_repair = bool(data.get("locked_assignments")) and conflict_review_v2_enabled()
    review_scope_by_interviewer = (
        {
            str(row.interviewer_id): set(row.own_candidate_ids)
            | set(row.swap_candidate_ids)
            for row in ConflictReviewList.objects.filter(saved_schedule=saved)
        }
        if is_repair
        else {}
    )
    interviewers = []
    for interviewer_id in requested_interviewer_ids:
        user = user_map.get(interviewer_id)
        if user is None:
            raise ScheduleValidationError(
                "interviewers", "Intervjuerlisten inneholder en ukjent bruker."
            )
        availability = availability_map.get(interviewer_id)
        # Both lists together are what the interviewer can actually do; the
        # "helst ikke" half is handed to the solver separately below so it
        # can prefer against it rather than be barred from it.
        # Opting out is a participation decision, not deletion of the person's
        # previously entered availability. When they rejoin, keep that data if
        # it is still current for this plan; an empty/stale submission remains
        # awaiting and must be answered again in the normal way.
        submitted_slots = availability.slots if availability is not None else []
        submitted_discouraged = (
            availability.discouraged_slots if availability is not None else []
        )
        # A rejoining interviewer may reuse a previously saved answer. The
        # participation flag must not erase it; current-generation validation
        # below still decides whether the answer is usable for this plan.
        schedulable_slots = list(submitted_slots) + list(submitted_discouraged or [])
        interviewers.append(
            {
                "id": interviewer_id,
                "name": user.get_full_name() or user.username,
                "gender": {"male": "M", "female": "F"}.get(user.gender, ""),
                "availability": sorted(
                    encode_slot_keys(schedulable_slots, saved.start_date).intersection(
                        all_slots
                    )
                ),
                "discouraged": sorted(
                    encode_slot_keys(
                        submitted_discouraged or [], saved.start_date
                    ).intersection(all_slots)
                ),
                # Declared conflicts, plus the ones derived from fadderbarn
                # declarations. Derived ones are unioned here rather than stored
                # on InterviewAvailability: writing them there would echo back
                # through the availability payload and tell the interviewer
                # exactly which of their fadderbarn applied.
                "biased": sorted(
                    (
                        {
                            str(value)
                            for value in (
                                availability.conflicts if availability else []
                            )
                            if str(value) in candidate_ids
                        }
                        | {
                            str(value)
                            for value in derived_conflicts.get(interviewer_id, set())
                            if str(value) in candidate_ids
                        }
                        | (
                            candidate_ids
                            - review_scope_by_interviewer.get(interviewer_id, set())
                            if is_repair
                            else set()
                        )
                    )
                ),
                "experience_level": (
                    availability.experience_level
                    if availability is not None
                    else InterviewAvailability.EXPERIENCE_UNKNOWN
                ),
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
                "candidate": application_map[candidate_id].user.get_full_name()
                or application_map[candidate_id].user.username,
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


def _candidates_per_session(solver_options):
    """Clamp the joint-interview capacity from a solver-options dict to a sane
    range. Anything missing or malformed falls back to a normal interview."""

    raw = (solver_options or {}).get("candidates_per_session", 1)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 1
    return max(1, min(value, constants.MAX_CANDIDATES_PER_SESSION))


def canonicalize_schedule(
    *,
    admission,
    group,
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
        UserApplication.objects.filter(
            admission=admission, group_applications__group=group
        )
        .distinct()
        .select_related("user")
    )
    candidate_map = {str(application.pk): application for application in applications}
    enabled_times = encode_slot_keys(enabled_slots, start_date)
    if not enabled_times:
        raise ScheduleValidationError(
            "schedule", "Tidsoppsettet må ha minst én åpen tidsluke."
        )

    allowed_user_ids = get_eligible_interviewer_ids(admission, group)
    participating_user_ids = {
        user_id
        for user_id, state in get_interviewer_participation(admission, group).items()
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
            admission=admission, group=group, user_id__in=allowed_user_ids
        )
    }
    derived_conflicts = get_declared_conflict_candidate_ids(admission, group)

    allow_overtime = policy.allows_availability_deviations
    # Joint interviews: one shared panel meets this many candidates in a single
    # slot. The solver (v2) produces such rows; validation here must accept them
    # on the same terms - up to N candidates per time, all sharing one panel.
    candidates_per_session = _candidates_per_session(solver_options)
    seen_candidates = set()
    candidates_at_time: dict[int, int] = {}
    panel_by_time: dict[int, frozenset] = {}
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
        if candidates_at_time.get(interview_time, 0) >= candidates_per_session:
            raise ScheduleValidationError(
                "schedule",
                (
                    "Et fellesintervju kan ikke ha flere enn "
                    f"{candidates_per_session} kandidater."
                    if candidates_per_session > 1
                    else "To intervjuer kan ikke ha samme tidspunkt."
                ),
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
        panel_key = frozenset(panel_ids)
        shared_panel = panel_by_time.get(interview_time)
        if shared_panel is not None and shared_panel != panel_key:
            raise ScheduleValidationError(
                "schedule",
                "Kandidatene i et fellesintervju må dele samme panel.",
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
            # Declared conflicts, plus the ones derived from fadderbarn
            # declarations - without this union, a manually-edited or
            # imported schedule could still pair an interviewer with a
            # fadderbarn who applied, even though the solver itself already
            # respects it via canonicalize_solver_payload's "biased" set.
            conflicts = (
                set(str(value) for value in (saved_availability.conflicts or []))
                if saved_availability
                else set()
            ) | derived_conflicts.get(interviewer_id, set())
            if candidate_id in conflicts:
                # Name the offending pair so the admin can find it in
                # the plan: a generic "bryter en inhabilitet" leaves them
                # hunting across 70+ rows for the conflict. The names
                # are looked up from the application (candidate) and
                # the InterviewAvailability row (interviewer) - both
                # already in scope, no extra query needed.
                candidate_name = (
                    candidate_map.get(candidate_id).user.get_full_name()
                    or candidate_map.get(candidate_id).user.username
                    if candidate_map.get(candidate_id) is not None
                    else candidate_id
                )
                interviewer_user = user_map.get(interviewer_id)
                interviewer_name = (
                    interviewer_user.get_full_name() or interviewer_user.username
                    if interviewer_user is not None
                    else interviewer_id
                )
                raise ScheduleValidationError(
                    "schedule",
                    f"Planen bryter en registrert inhabilitet: "
                    f"{interviewer_name} er oppført som inhabil mot "
                    f"{candidate_name}.",
                )
            available_times = (
                # "Helst ikke" counts as available here: the interviewer said
                # they can make it, so the solver pays a preference cost for
                # using one - it is never a deviation needing admin approval.
                encode_slot_keys(
                    list(saved_availability.slots or [])
                    + list(saved_availability.discouraged_slots or []),
                    start_date,
                )
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
                    "experience_level": (
                        saved_availability.experience_level
                        if saved_availability is not None
                        else InterviewAvailability.EXPERIENCE_UNKNOWN
                    ),
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
        candidates_at_time[interview_time] = (
            candidates_at_time.get(interview_time, 0) + 1
        )
        panel_by_time.setdefault(interview_time, panel_key)

    if require_all_candidates and seen_candidates != set(candidate_map):
        raise ScheduleValidationError(
            "schedule",
            "Alle aktive kandidater må ha et intervju før publisering, eller "
            "bekreft at de siste planlegges senere (kandidater uten intervju "
            "nå).",
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

    if (solver_options or {}).get("require_experienced_panel"):
        for item in canonical:
            if not any(
                member.get("experience_level")
                == InterviewAvailability.EXPERIENCE_EXPERIENCED
                for member in item["panel"]
            ):
                raise ScheduleValidationError(
                    "schedule",
                    "Planen mangler en erfaren intervjuer i panelet.",
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
