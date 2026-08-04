from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from typing import Any, Collection, Iterable, Sequence

EXPERIENCE_EXPERIENCED = "experienced"


def _value(item, name, default=None):
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _block_slots(block) -> tuple[int, ...]:
    return tuple(_value(block, "usable_slots", ()) or ())


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    message: str
    candidate_id: str | None = None
    interviewer_id: str | None = None
    time: int | None = None

    def as_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class ObjectiveVector:
    unplaced: int
    overtime: int
    changed_times: int
    changed_rows: int
    changed_panel_members: int
    panel_breaks: int
    adjacent_block_rest: int
    extra_experienced: int
    max_load: int
    load_spread: int
    experienced_load_spread: int
    continuity_latest_rank: int
    continuity_runs: int
    earliness: int
    canonical_tie: int

    def as_dict(self):
        return asdict(self)


REPAIR_PROFILES = {
    "minimum_change": {
        "time": 100_000,
        "row": 20_000,
        "member": 2_000,
        "panel_break": 500,
    },
    "preserve_panels": {
        "time": 100_000,
        "row": 20_000,
        "member": 1_000,
        "panel_break": 50_000,
    },
    "balanced": {
        "time": 100_000,
        "row": 20_000,
        "member": 2_000,
        "panel_break": 3_000,
    },
}


def validate_schedule_result(
    *,
    schedule: Sequence[dict],
    candidates: Sequence[Any],
    interviewers: Sequence[Any],
    panel_size: int,
    all_slots: Iterable[int],
    allow_overtime: bool,
    enforce_same_gender: bool,
    require_experienced_panel: bool,
    requires_stable_panel: bool,
    blocks: Sequence[Any],
    locked_assignments: Sequence[dict],
    require_all_candidates: bool = False,
) -> list[ValidationIssue]:
    """Validate a reconstructed result without consulting CP-SAT or the DB."""

    issues: list[ValidationIssue] = []
    candidate_map = {
        str(_value(candidate, "id")): candidate for candidate in candidates
    }
    interviewer_map = {
        str(_value(interviewer, "id")): interviewer for interviewer in interviewers
    }
    allowed_slots = set(all_slots)
    gender_data_available = any(
        _value(interviewer, "gender") in {"M", "F"} for interviewer in interviewers
    )
    seen_candidates: set[str] = set()
    seen_times: set[int] = set()
    row_by_candidate: dict[str, dict] = {}

    for row in schedule:
        candidate_id = str(row.get("candidate_id") or "")
        interview_time = row.get("time")
        candidate = candidate_map.get(candidate_id)
        if candidate is None:
            issues.append(
                ValidationIssue(
                    "unknown_candidate",
                    "Resultatet inneholder en ukjent kandidat.",
                    candidate_id=candidate_id or None,
                    time=interview_time,
                )
            )
            continue
        if candidate_id in seen_candidates:
            issues.append(
                ValidationIssue(
                    "duplicate_candidate",
                    "En kandidat kan bare ha ett intervju.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )
        if not isinstance(interview_time, int) or interview_time not in allowed_slots:
            issues.append(
                ValidationIssue(
                    "invalid_time",
                    "Resultatet inneholder et tidspunkt som ikke er åpnet.",
                    candidate_id=candidate_id,
                    time=interview_time if isinstance(interview_time, int) else None,
                )
            )
        elif interview_time in seen_times:
            issues.append(
                ValidationIssue(
                    "duplicate_time",
                    "To intervjuer kan ikke ha samme tidspunkt.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )

        panel = row.get("panel") or []
        panel_ids = [str(member.get("id") or "") for member in panel]
        if len(panel_ids) != panel_size:
            issues.append(
                ValidationIssue(
                    "panel_size",
                    "Panelet har feil størrelse.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )
        if len(panel_ids) != len(set(panel_ids)):
            issues.append(
                ValidationIssue(
                    "duplicate_panel_member",
                    "Et panel kan ikke inneholde samme person flere ganger.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )

        candidate_user_id = str(_value(candidate, "user_id") or "")
        panel_genders = set()
        experienced = False
        for interviewer_id in panel_ids:
            interviewer = interviewer_map.get(interviewer_id)
            if interviewer is None:
                issues.append(
                    ValidationIssue(
                        "unknown_interviewer",
                        "Resultatet inneholder en ukjent intervjuer.",
                        candidate_id=candidate_id,
                        interviewer_id=interviewer_id or None,
                        time=interview_time,
                    )
                )
                continue
            if candidate_user_id and candidate_user_id == interviewer_id:
                issues.append(
                    ValidationIssue(
                        "self_interview",
                        "En kandidat kan ikke intervjue seg selv.",
                        candidate_id=candidate_id,
                        interviewer_id=interviewer_id,
                        time=interview_time,
                    )
                )
            if candidate_id in set(_value(interviewer, "biased", ()) or ()):
                issues.append(
                    ValidationIssue(
                        "interviewer_conflict",
                        "Resultatet bryter en registrert inhabilitet.",
                        candidate_id=candidate_id,
                        interviewer_id=interviewer_id,
                        time=interview_time,
                    )
                )
            availability = set(_value(interviewer, "availability", ()) or ())
            if not allow_overtime and interview_time not in availability:
                issues.append(
                    ValidationIssue(
                        "overtime_disabled",
                        "Resultatet krever overtid som er slått av.",
                        candidate_id=candidate_id,
                        interviewer_id=interviewer_id,
                        time=interview_time,
                    )
                )
            gender = _value(interviewer, "gender")
            if gender:
                panel_genders.add(gender)
            experienced = experienced or (
                _value(interviewer, "experience_level", "unknown")
                == EXPERIENCE_EXPERIENCED
            )

        candidate_gender = _value(candidate, "gender")
        if (
            enforce_same_gender
            and gender_data_available
            and candidate_gender in {"M", "F"}
            and candidate_gender not in panel_genders
        ):
            issues.append(
                ValidationIssue(
                    "same_gender_missing",
                    "Panelet mangler en intervjuer med samme kjønn.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )
        if require_experienced_panel and not experienced:
            issues.append(
                ValidationIssue(
                    "experienced_interviewer_missing",
                    "Panelet mangler en erfaren intervjuer.",
                    candidate_id=candidate_id,
                    time=interview_time,
                )
            )

        seen_candidates.add(candidate_id)
        if isinstance(interview_time, int):
            seen_times.add(interview_time)
        row_by_candidate[candidate_id] = row

    if require_all_candidates:
        for candidate_id in sorted(candidate_map.keys() - seen_candidates):
            issues.append(
                ValidationIssue(
                    "missing_candidate",
                    "Et fullstendig resultat mangler en kandidat.",
                    candidate_id=candidate_id,
                )
            )

    if requires_stable_panel:
        row_by_time = {
            row.get("time"): row for row in schedule if isinstance(row.get("time"), int)
        }
        for block in blocks:
            block_panels = {
                frozenset(str(member.get("id") or "") for member in row["panel"])
                for interview_time in _block_slots(block)
                for row in [row_by_time.get(interview_time)]
                if row is not None
            }
            if len(block_panels) > 1:
                issues.append(
                    ValidationIssue(
                        "stable_panel_violation",
                        "Intervjuer i samme blokk har forskjellige paneler.",
                    )
                )

    for locked in locked_assignments:
        candidate_id = str(locked.get("candidate_id") or "")
        row = row_by_candidate.get(candidate_id)
        locked_time = locked.get("time")
        locked_panel = {
            str(member.get("id") or "") for member in locked.get("panel") or []
        }
        if row is None:
            issues.append(
                ValidationIssue(
                    "locked_candidate_missing",
                    "En låst kandidat mangler fra resultatet.",
                    candidate_id=candidate_id,
                    time=locked_time,
                )
            )
            continue
        result_panel = {
            str(member.get("id") or "") for member in row.get("panel") or []
        }
        if row.get("time") != locked_time or result_panel != locked_panel:
            issues.append(
                ValidationIssue(
                    "locked_assignment_changed",
                    "En låst tildeling ble endret.",
                    candidate_id=candidate_id,
                    time=locked_time,
                )
            )

    return issues


def _panel_break_count(
    schedule: Sequence[dict],
    blocks: Sequence[Any],
    panel_size: int,
) -> int:
    row_by_time = {
        row.get("time"): row for row in schedule if isinstance(row.get("time"), int)
    }
    breaks = 0
    for block in blocks:
        panels = [
            {str(member.get("id") or "") for member in row.get("panel") or []}
            for interview_time in _block_slots(block)
            for row in [row_by_time.get(interview_time)]
            if row is not None
        ]
        if not panels:
            continue
        frequency = Counter(member for panel in panels for member in panel)
        reference = {
            member
            for member, _count in sorted(
                frequency.items(), key=lambda item: (-item[1], item[0])
            )[:panel_size]
        }
        breaks += sum(len(panel.symmetric_difference(reference)) for panel in panels)
    return breaks


def evaluate_objective_vector(
    *,
    schedule: Sequence[dict],
    candidates: Sequence[Any],
    interviewers: Sequence[Any],
    sorted_slots: Sequence[int],
    blocks: Sequence[Any],
    previous_schedule: Sequence[dict],
    panel_size: int,
    require_experienced_panel: bool,
    active_interviewer_ids: Collection[str] | None = None,
) -> ObjectiveVector:
    candidate_ids = {str(_value(candidate, "id")) for candidate in candidates}
    interviewer_map = {
        str(_value(interviewer, "id")): interviewer for interviewer in interviewers
    }
    row_by_candidate = {str(row.get("candidate_id") or ""): row for row in schedule}
    slot_rank = {slot: rank for rank, slot in enumerate(sorted_slots)}
    overtime = 0
    extra_experienced = 0
    loads = Counter()

    for row in schedule:
        interview_time = row.get("time")
        experienced_count = 0
        for member in row.get("panel") or []:
            interviewer_id = str(member.get("id") or "")
            interviewer = interviewer_map.get(interviewer_id)
            if interviewer is None:
                continue
            loads[interviewer_id] += 1
            if interview_time not in set(_value(interviewer, "availability", ()) or ()):
                overtime += 1
            if (
                _value(interviewer, "experience_level", "unknown")
                == EXPERIENCE_EXPERIENCED
            ):
                experienced_count += 1
        if require_experienced_panel:
            extra_experienced += max(0, experienced_count - 1)

    previous_by_candidate = {
        str(row.get("candidate_id") or ""): row
        for row in previous_schedule
        if str(row.get("candidate_id") or "") in candidate_ids
        and isinstance(row.get("time"), int)
        and row.get("time") in slot_rank
    }
    changed_times = 0
    changed_rows = 0
    changed_panel_members = 0
    for candidate_id, previous in previous_by_candidate.items():
        current = row_by_candidate.get(candidate_id)
        previous_panel = {
            str(member.get("id") or "") for member in previous.get("panel") or []
        }
        current_panel = (
            {str(member.get("id") or "") for member in current.get("panel") or []}
            if current
            else set()
        )
        same_time = bool(current and current.get("time") == previous.get("time"))
        retained = previous_panel.intersection(current_panel) if same_time else set()
        changed_times += int(not same_time)
        changed_panel_members += len(previous_panel) - len(retained)
        changed_rows += int(not (same_time and current_panel == previous_panel))

    works_by_block: dict[tuple[int, int], set[str]] = defaultdict(set)
    blocks_by_day: dict[int, list[Any]] = defaultdict(list)
    for block in blocks:
        blocks_by_day[int(_value(block, "day", 0))].append(block)
    block_details_by_time = {
        interview_time: (
            int(_value(block, "day", 0)),
            int(_value(block, "index", position)),
        )
        for position, block in enumerate(blocks)
        for interview_time in _block_slots(block)
    }
    for row in schedule:
        block_details = block_details_by_time.get(row.get("time"))
        if block_details is None:
            continue
        day, block_index = block_details
        works_by_block[(day, block_index)].update(
            str(member.get("id") or "") for member in row.get("panel") or []
        )
    adjacent_rest = 0
    for day, day_blocks in blocks_by_day.items():
        ordered = sorted(
            day_blocks,
            key=lambda block: (
                int(_value(block, "start_time", 0)),
                int(_value(block, "index", 0)),
            ),
        )
        for left, right in zip(ordered, ordered[1:]):
            adjacent_rest += len(
                works_by_block[(day, int(_value(left, "index", 0)))].intersection(
                    works_by_block[(day, int(_value(right, "index", 0)))]
                )
            )

    all_loads = [loads[str(_value(interviewer, "id"))] for interviewer in interviewers]
    active_id_set = (
        {str(value) for value in active_interviewer_ids}
        if active_interviewer_ids is not None
        else set(interviewer_map)
    )
    active_loads = [
        loads[str(_value(interviewer, "id"))]
        for interviewer in interviewers
        if str(_value(interviewer, "id")) in active_id_set
    ]
    experienced_loads = [
        loads[str(_value(interviewer, "id"))]
        for interviewer in interviewers
        if _value(interviewer, "experience_level", "unknown") == EXPERIENCE_EXPERIENCED
        and str(_value(interviewer, "id")) in active_id_set
    ]
    max_load = max(all_loads, default=0)
    load_spread = max(active_loads) - min(active_loads) if len(active_loads) > 1 else 0
    experienced_load_spread = (
        max(experienced_loads) - min(experienced_loads)
        if len(experienced_loads) > 1
        else 0
    )

    occupied = {row.get("time") for row in schedule}
    latest_rank = max((slot_rank[slot] for slot in occupied), default=0)
    sequences = [list(_block_slots(block)) for block in blocks if _block_slots(block)]
    covered_slots = {slot for sequence in sequences for slot in sequence}
    if not sequences:
        sequences = [list(sorted_slots)]
    else:
        sequences.extend([[slot] for slot in sorted_slots if slot not in covered_slots])
    continuity_runs = 0
    for sequence in sequences:
        previous_used = False
        for slot in sequence:
            used = slot in occupied
            continuity_runs += int(used and not previous_used)
            previous_used = used
    candidate_rank = {
        candidate_id: rank for rank, candidate_id in enumerate(sorted(candidate_ids))
    }
    interviewer_rank = {
        interviewer_id: rank
        for rank, interviewer_id in enumerate(sorted(interviewer_map))
    }
    canonical_tie = sum(
        candidate_rank[str(row.get("candidate_id") or "")]
        * (len(sorted_slots) - 1 - slot_rank.get(row.get("time"), 0))
        for row in schedule
        if str(row.get("candidate_id") or "") in candidate_rank
    ) + sum(
        interviewer_rank[str(member.get("id") or "")]
        * (len(sorted_slots) - slot_rank.get(row.get("time"), 0))
        for row in schedule
        for member in row.get("panel") or []
        if str(member.get("id") or "") in interviewer_rank
    )

    return ObjectiveVector(
        unplaced=max(0, len(candidates) - len(row_by_candidate)),
        overtime=overtime,
        changed_times=changed_times,
        changed_rows=changed_rows,
        changed_panel_members=changed_panel_members,
        panel_breaks=_panel_break_count(schedule, blocks, panel_size),
        adjacent_block_rest=adjacent_rest,
        extra_experienced=extra_experienced,
        max_load=max_load,
        load_spread=load_spread,
        experienced_load_spread=experienced_load_spread,
        continuity_latest_rank=latest_rank,
        continuity_runs=continuity_runs,
        earliness=sum(slot_rank.get(row.get("time"), 0) for row in schedule),
        canonical_tie=canonical_tie,
    )


def objective_key(
    vector: ObjectiveVector,
    *,
    candidate_count: int,
    repair_mode: bool,
    repair_strategy: str,
    prefers_stable_panel: bool,
    load_balance_weight: int,
    continuity_weight: int,
    previous_panel_member_count: int,
) -> tuple[int, ...]:
    structure = load_balance_weight * (
        vector.max_load + vector.load_spread + vector.experienced_load_spread
    ) + continuity_weight * candidate_count * (
        vector.continuity_latest_rank + vector.continuity_runs
    )
    if repair_mode:
        profile = REPAIR_PROFILES.get(repair_strategy, REPAIR_PROFILES["balanced"])
        repair = (
            profile["time"] * vector.changed_times
            + profile["row"] * vector.changed_rows
            + profile["member"] * vector.changed_panel_members
            + profile["panel_break"] * vector.panel_breaks
        )
        return (
            vector.unplaced,
            vector.overtime,
            repair,
            vector.adjacent_block_rest,
            vector.extra_experienced,
            structure,
            vector.earliness,
        )
    stability_tie = (
        previous_panel_member_count + 1
    ) * vector.changed_times + vector.changed_panel_members
    return (
        vector.unplaced,
        vector.overtime,
        vector.panel_breaks if prefers_stable_panel else 0,
        vector.adjacent_block_rest,
        vector.extra_experienced,
        structure,
        vector.earliness,
        stability_tie,
        vector.canonical_tie,
    )
