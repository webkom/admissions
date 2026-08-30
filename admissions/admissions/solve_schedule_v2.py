import time
from dataclasses import dataclass, replace
from typing import Any, Dict, List, Sequence

from ortools.sat.python import cp_model
from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions import solve_schedule as solve_schedule_module
from admissions.admissions.schedule_policy import normalize_solver_options
from admissions.admissions.solve_schedule import (
    MINUTES_PER_DAY,
    Candidate,
    CanonicalBlock,
    Interviewer,
    ObjectiveTier,
    SolveOptions,
    _canonicalize_blocks,
    build_solve_options,
)
from admissions.admissions.solver_result import (
    REPAIR_PROFILES,
    ObjectiveVector,
    evaluate_objective_vector,
    objective_key,
    validate_schedule_result,
)

log = get_logger()

REQUIRE_SAME_GENDER = 1
REQUIRE_EXPERIENCE = 2
SOLVER_ENGINE_VERSION = "v2"


class ModelTooLarge(Exception):
    pass


def _linear_sum(terms):
    values = list(terms)
    return cp_model.LinearExpr.Sum(values) if values else 0


def _minimum_members_for_requirements(
    capability_masks: Sequence[int], required_mask: int
) -> int | None:
    """Return the fewest distinct members needed to cover all requirement bits."""

    if required_mask == 0:
        return 0
    infinity = len(capability_masks) + 1
    best = [infinity] * (required_mask + 1)
    best[0] = 0
    for capabilities in capability_masks:
        next_best = list(best)
        for covered, count in enumerate(best):
            if count == infinity:
                continue
            new_covered = covered | (capabilities & required_mask)
            next_best[new_covered] = min(next_best[new_covered], count + 1)
        best = next_best
    result = best[required_mask]
    return None if result == infinity else result


@dataclass
class SolverProblem:
    candidates: list[Candidate]
    interviewers: list[Interviewer]
    panel_size: int
    options: SolveOptions
    # Max candidates one shared panel may interview in the same slot
    # (1 = normal interviews, 2+ = joint sessions).
    candidates_per_session: int
    policy: Any
    sorted_slots: list[int]
    canonical_blocks: list[CanonicalBlock]
    eligibility: dict[tuple[str, int], tuple[str, ...]]
    feasible_slots_by_candidate: dict[str, tuple[int, ...]]
    candidate_ids_by_slot: dict[int, tuple[str, ...]]
    panel_pairs: tuple[tuple[str, int], ...]
    locked_by_candidate: dict[str, dict]
    locked_assignments: list[dict]
    previous_schedule: list[dict]
    availability: dict[str, set[int]]
    # Subset of `availability` the interviewer would rather not be used.
    discouraged: dict[str, set[int]]
    candidate_map: dict[str, Candidate]
    interviewer_map: dict[str, Interviewer]
    unplaceable_reason: dict[str, tuple[str, str]]
    masks: dict[str, Any]


@dataclass
class BuiltModel:
    model: cp_model.CpModel
    schedule: dict[tuple[str, int], Any]
    panel: dict[tuple[str, int], Any]
    occupied: dict[int, Any]
    tiers: list[ObjectiveTier]
    full_placement: bool
    previous_panel_member_count: int
    variable_count: int
    constraint_count: int
    build_ms: int
    staged_lexicographic: bool


@dataclass
class PhaseResult:
    name: str
    status: int
    status_name: str
    solver: cp_model.CpSolver
    built: BuiltModel
    schedule: list[dict] | None
    objective_vector: ObjectiveVector | None
    objective_key: tuple[int, ...] | None
    validation_issues: list[dict]
    solve_ms: int
    validation_ms: int


def _locked_conflict(code: str, message: str, assignment=None):
    return {
        "status": "LOCKED_CONFLICT",
        "schedule": [],
        "unplaceable": [],
        "locked_conflicts": [
            {
                "code": code,
                "message": message,
                "assignment": assignment,
            }
        ],
    }


def _error(message: str):
    return {
        "status": "ERROR",
        "schedule": [],
        "unplaceable": [],
        "locked_conflicts": [],
        "error": message,
    }


def _capability_mask(
    interviewer: Interviewer,
    candidate: Candidate,
    required_mask: int,
) -> int:
    capabilities = 0
    if (
        required_mask & REQUIRE_SAME_GENDER
        and candidate.gender in {"M", "F"}
        and interviewer.gender == candidate.gender
    ):
        capabilities |= REQUIRE_SAME_GENDER
    if (
        required_mask & REQUIRE_EXPERIENCE
        and interviewer.experience_level == "experienced"
    ):
        capabilities |= REQUIRE_EXPERIENCE
    return capabilities


def _requirements_for_candidate(
    candidate: Candidate,
    *,
    options: SolveOptions,
    gender_data_available: bool,
) -> int:
    required = 0
    if (
        options.enforce_same_gender
        and gender_data_available
        and candidate.gender in {"M", "F"}
    ):
        required |= REQUIRE_SAME_GENDER
    if options.require_experienced_panel:
        required |= REQUIRE_EXPERIENCE
    return required


def _panel_covers_requirements(
    panel_ids: Sequence[str],
    candidate: Candidate,
    interviewer_map: dict[str, Interviewer],
    required_mask: int,
) -> bool:
    covered = 0
    for interviewer_id in panel_ids:
        interviewer = interviewer_map[interviewer_id]
        covered |= _capability_mask(interviewer, candidate, required_mask)
    return covered == required_mask


def _members_from_mask(mask: int, interviewers: Sequence[Interviewer]):
    while mask:
        least_significant = mask & -mask
        yield interviewers[least_significant.bit_length() - 1]
        mask ^= least_significant


def _normalize_problem(
    *,
    candidates_data: List[dict],
    interviewers_data: List[dict],
    panel_size: int,
    options_data: Dict[str, Any] | None,
    locked_assignments_data: List[dict] | None,
    all_slots_data: List[int] | None,
    blocks_data: List[List[int]] | None,
    block_metadata_data: List[dict] | None,
    previous_schedule_data: List[dict] | None,
):
    candidates = sorted(
        (Candidate(**candidate) for candidate in candidates_data),
        key=lambda candidate: candidate.id,
    )
    interviewers = sorted(
        (Interviewer(**interviewer) for interviewer in interviewers_data),
        key=lambda interviewer: interviewer.id,
    )
    normalized_options, policy = normalize_solver_options(options_data)
    options = build_solve_options(normalized_options)
    strategy_defaults = {
        "minimize_overtime": (1, 0, False),
        # Fair distribution outranks compactness: the balance term competes
        # with continuity_weight * candidates * (runs + latest rank), so a
        # small weight lets a compact plan load a few interviewers heavily
        # while others idle.
        "balanced": (20, 1, True),
        "compact_days": (2, 48, True),
        "balance_workload": (10, 0, False),
    }
    if (
        "initial_strategy" in (options_data or {})
        and options.initial_strategy in strategy_defaults
        and not any(
            field in (options_data or {})
            for field in (
                "load_balance_weight",
                "continuity_weight",
                "prioritize_continuity",
            )
        )
    ):
        (
            options.load_balance_weight,
            options.continuity_weight,
            options.prioritize_continuity,
        ) = strategy_defaults[options.initial_strategy]

    if panel_size <= 0:
        return None, _error("Panelstørrelsen må være minst én.")
    if panel_size > len(interviewers):
        has_explicit_slots = all_slots_data is not None
        return None, {
            "status": (
                "PARTIAL"
                if candidates and has_explicit_slots
                else "INFEASIBLE" if candidates else "SUCCESS"
            ),
            "schedule": [],
            "unplaceable": [
                {
                    "candidate_id": candidate.id,
                    "candidate": candidate.name,
                    "reason_code": "panel_capacity",
                    "reason": "Ikke nok intervjuere til valgt panelstørrelse.",
                }
                for candidate in candidates
            ],
            "locked_conflicts": [],
            "optimal": True,
        }

    locked_assignments = list(locked_assignments_data or [])
    restrict_to_grid = all_slots_data is not None
    all_slots = list(all_slots_data or [])
    all_slots_set = set(all_slots)
    candidate_map = {candidate.id: candidate for candidate in candidates}
    interviewer_map = {interviewer.id: interviewer for interviewer in interviewers}
    candidate_id_by_name = {candidate.name: candidate.id for candidate in candidates}
    interviewer_id_by_name = {
        interviewer.name: interviewer.id for interviewer in interviewers
    }
    availability = {
        interviewer.id: set(interviewer.availability) for interviewer in interviewers
    }
    if restrict_to_grid:
        availability = {
            interviewer_id: slots.intersection(all_slots_set)
            for interviewer_id, slots in availability.items()
        }
    # Intersected with the (already grid-restricted) availability so a
    # discouraged time can never widen what the solver may use.
    discouraged = {
        interviewer.id: set(interviewer.discouraged)
        & availability.get(interviewer.id, set())
        for interviewer in interviewers
    }
    gender_data_available = any(
        interviewer.gender in {"M", "F"} for interviewer in interviewers
    )
    interviewer_bits = {
        interviewer.id: 1 << index for index, interviewer in enumerate(interviewers)
    }
    all_interviewers_mask = (1 << len(interviewers)) - 1
    gender_masks = {
        gender: sum(
            interviewer_bits[interviewer.id]
            for interviewer in interviewers
            if interviewer.gender == gender
        )
        for gender in ("M", "F")
    }
    experienced_mask = sum(
        interviewer_bits[interviewer.id]
        for interviewer in interviewers
        if interviewer.experience_level == "experienced"
    )

    locked_by_candidate: dict[str, dict] = {}
    locked_times: set[int] = set()
    # Per-time bookkeeping so joint interviews may place two locked
    # candidates (with one shared panel) while single sessions stay strict.
    locked_time_counts: dict[int, int] = {}
    locked_panels_by_time: dict[int, frozenset[str]] = {}
    normalized_locks: list[dict] = []
    locked_panel_masks: dict[str, int] = {}
    for assignment in locked_assignments:
        candidate_id = assignment.get("candidate_id") or candidate_id_by_name.get(
            assignment.get("candidate")
        )
        if candidate_id not in candidate_map:
            return None, _locked_conflict(
                "unknown_candidate", "Locked candidate was not found.", assignment
            )
        if candidate_id in locked_by_candidate:
            return None, _locked_conflict(
                "duplicate_candidate",
                "Candidate has multiple locked interviews.",
                assignment,
            )
        locked_time = int(assignment["time"])
        if locked_time < 0 or (restrict_to_grid and locked_time not in all_slots_set):
            return None, _locked_conflict(
                "invalid_time",
                f"Locked time {locked_time} for "
                f"{candidate_map[candidate_id].name} is not an open slot.",
                assignment,
            )
        # Parse the panel up front so the joint-panel check below can compare
        # against it: the same locked time is shared by several candidates in
        # joint mode, and each must carry the identical panel.
        panel_ids = []
        for member in assignment.get("panel", []):
            interviewer_id = member.get("id") or interviewer_id_by_name.get(
                member.get("name")
            )
            if interviewer_id not in interviewer_map:
                return None, _locked_conflict(
                    "unknown_interviewer",
                    "Locked panel member was not found.",
                    assignment,
                )
            panel_ids.append(interviewer_id)
        if len(panel_ids) != panel_size or len(panel_ids) != len(set(panel_ids)):
            return None, _locked_conflict(
                "panel_size",
                "Locked panel does not match panel size.",
                assignment,
            )
        if locked_time in locked_times:
            if options.candidates_per_session <= 1:
                return None, _locked_conflict(
                    "duplicate_time",
                    "Multiple locked interviews share one time.",
                    assignment,
                )
            if locked_time_counts[locked_time] >= options.candidates_per_session:
                return None, _locked_conflict(
                    "joint_capacity",
                    f"A joint slot can hold at most "
                    f"{options.candidates_per_session} candidates.",
                    assignment,
                )
            if locked_panels_by_time[locked_time] != frozenset(panel_ids):
                return None, _locked_conflict(
                    "joint_panel_mismatch",
                    "Locked joint interviews must share one panel.",
                    assignment,
                )

        candidate = candidate_map[candidate_id]
        for interviewer_id in panel_ids:
            interviewer = interviewer_map[interviewer_id]
            if candidate_id in set(interviewer.biased):
                return None, _locked_conflict(
                    "interviewer_conflict",
                    "Locked interview has interest conflict.",
                    assignment,
                )
            if candidate.user_id and str(candidate.user_id) == interviewer_id:
                return None, _locked_conflict(
                    "self_interview",
                    "Locked candidate cannot interview themselves.",
                    assignment,
                )
            if (
                not options.allow_overtime
                and locked_time not in availability[interviewer_id]
            ):
                return None, _locked_conflict(
                    "overtime_disabled",
                    "Locked interview requires overtime while overtime is disabled.",
                    assignment,
                )
        required_mask = _requirements_for_candidate(
            candidate,
            options=options,
            gender_data_available=gender_data_available,
        )
        if not _panel_covers_requirements(
            panel_ids, candidate, interviewer_map, required_mask
        ):
            code = (
                "experienced_interviewer_missing"
                if required_mask & REQUIRE_EXPERIENCE
                else "same_gender_missing"
            )
            return None, _locked_conflict(
                code,
                "Locked panel does not satisfy the panel requirements.",
                assignment,
            )

        locked_by_candidate[candidate_id] = {
            "time": locked_time,
            "panel_ids": frozenset(panel_ids),
        }
        locked_panel_masks[candidate_id] = sum(
            interviewer_bits[interviewer_id] for interviewer_id in panel_ids
        )
        locked_times.add(locked_time)
        locked_time_counts[locked_time] = locked_time_counts.get(locked_time, 0) + 1
        locked_panels_by_time.setdefault(locked_time, frozenset(panel_ids))
        normalized_locks.append(
            {
                "candidate_id": candidate_id,
                "time": locked_time,
                "panel": [{"id": interviewer_id} for interviewer_id in panel_ids],
            }
        )

    available_slots = set().union(
        *(availability[interviewer.id] for interviewer in interviewers)
    )
    available_slots.update(locked_times)
    if options.allow_overtime and restrict_to_grid:
        available_slots.update(all_slots)
    sorted_slots = sorted(available_slots)
    if not sorted_slots:
        return None, {
            "status": "INFEASIBLE",
            "schedule": [],
            "unplaceable": [
                {
                    "candidate_id": candidate.id,
                    "candidate": candidate.name,
                    "reason_code": "no_open_slots",
                    "reason": "Ingen aktive tidsluker er åpnet.",
                }
                for candidate in candidates
            ],
            "locked_conflicts": [],
        }

    canonical_blocks = _canonicalize_blocks(
        blocks_data=blocks_data or [],
        block_metadata_data=block_metadata_data or [],
        sorted_slots=sorted_slots,
    )
    slot_bits = {
        interview_time: 1 << index for index, interview_time in enumerate(sorted_slots)
    }
    availability_masks = {
        interview_time: sum(
            interviewer_bits[interviewer.id]
            for interviewer in interviewers
            if interview_time in availability[interviewer.id]
        )
        for interview_time in sorted_slots
    }
    biased_sets = {
        interviewer.id: frozenset(interviewer.biased) for interviewer in interviewers
    }
    conflict_masks = {
        candidate.id: sum(
            interviewer_bits[interviewer.id]
            for interviewer in interviewers
            if candidate.id in biased_sets[interviewer.id]
            or (candidate.user_id and str(candidate.user_id) == interviewer.id)
        )
        for candidate in candidates
    }
    block_slot_masks = {
        block.index: sum(
            slot_bits[interview_time]
            for interview_time in block.usable_slots
            if interview_time in slot_bits
        )
        for block in canonical_blocks
    }
    previous_panel_masks = {}
    for row in previous_schedule_data or []:
        candidate_id = row.get("candidate_id") or candidate_id_by_name.get(
            row.get("candidate")
        )
        if candidate_id not in candidate_map:
            continue
        previous_panel_masks[candidate_id] = sum(
            interviewer_bits.get(str(member.get("id") or ""), 0)
            for member in row.get("panel") or []
            if isinstance(member, dict)
        )
    if policy.requires_stable_panel and len(locked_by_candidate) > 1:
        for block in canonical_blocks:
            block_slot_set = frozenset(block.usable_slots)
            in_block = [
                (candidate_id, locked)
                for candidate_id, locked in locked_by_candidate.items()
                if locked["time"] in block_slot_set
            ]
            for candidate_id, locked in in_block[1:]:
                if locked["panel_ids"] != in_block[0][1]["panel_ids"]:
                    return None, _locked_conflict(
                        "stable_panel_violation",
                        f"Locked interviews for "
                        f"{candidate_map[in_block[0][0]].name} and "
                        f"{candidate_map[candidate_id].name} are in the same "
                        "block with different panels.",
                    )

    eligibility: dict[tuple[str, int], tuple[str, ...]] = {}
    feasible_slots_by_candidate: dict[str, list[int]] = {
        candidate.id: [] for candidate in candidates
    }
    candidate_ids_by_slot: dict[int, list[str]] = {
        interview_time: [] for interview_time in sorted_slots
    }
    panel_pairs: set[tuple[str, int]] = set()
    unplaceable_reason: dict[str, tuple[str, str]] = {}

    for candidate in candidates:
        required_mask = _requirements_for_candidate(
            candidate,
            options=options,
            gender_data_available=gender_data_available,
        )
        locally_compatible_mask = all_interviewers_mask & ~conflict_masks[candidate.id]
        unbiased_count = locally_compatible_mask.bit_count()
        failure_masks = set()
        for interview_time in sorted_slots:
            if (
                candidate.id in locked_by_candidate
                and interview_time != locked_by_candidate[candidate.id]["time"]
            ):
                continue
            eligible_mask = locally_compatible_mask
            if not options.allow_overtime:
                eligible_mask &= availability_masks[interview_time]
            eligible = list(_members_from_mask(eligible_mask, interviewers))
            capability_masks = [
                _capability_mask(interviewer, candidate, required_mask)
                for interviewer in eligible
            ]
            minimum_required = _minimum_members_for_requirements(
                capability_masks, required_mask
            )
            if len(eligible) < panel_size:
                failure_masks.add("capacity")
                continue
            if minimum_required is None or minimum_required > panel_size:
                if required_mask & REQUIRE_EXPERIENCE:
                    failure_masks.add("experience")
                if required_mask & REQUIRE_SAME_GENDER:
                    failure_masks.add("gender")
                continue
            eligible_ids = tuple(interviewer.id for interviewer in eligible)
            eligibility[(candidate.id, interview_time)] = eligible_ids
            feasible_slots_by_candidate[candidate.id].append(interview_time)
            candidate_ids_by_slot[interview_time].append(candidate.id)
            panel_pairs.update(
                (interviewer_id, interview_time) for interviewer_id in eligible_ids
            )

        if not feasible_slots_by_candidate[candidate.id]:
            if unbiased_count < panel_size:
                unplaceable_reason[candidate.id] = (
                    "interviewer_conflict",
                    "For mange i komiteen har meldt inhabilitet.",
                )
            elif "experience" in failure_masks:
                unplaceable_reason[candidate.id] = (
                    "experienced_interviewer_missing",
                    "Ingen tilgjengelige paneler har en erfaren intervjuer.",
                )
            elif "gender" in failure_masks:
                unplaceable_reason[candidate.id] = (
                    "same_gender_missing",
                    "Ingen tilgjengelige intervjuere med samme kjønn.",
                )
            else:
                unplaceable_reason[candidate.id] = (
                    "panel_capacity",
                    "Ikke nok intervjukapasitet i de åpne tidslukene.",
                )
        else:
            if options.candidates_per_session > 1:
                unplaceable_reason[candidate.id] = (
                    "joint_capacity",
                    f"Kandidaten kan ikke plasseres i et fellesintervju med "
                    f"{options.candidates_per_session} kandidater per intervju.",
                )
            else:
                unplaceable_reason[candidate.id] = (
                    "panel_capacity",
                    "Ikke nok intervjukapasitet i de åpne tidslukene.",
                )

    base_var_bound = (
        len(eligibility)
        + len(panel_pairs)
        + len(sorted_slots)
        + len(interviewers) * len(canonical_blocks) * 3
    )
    if base_var_bound > constants.MAX_SOLVER_SPARSE_BASE_VARS:
        return None, _error(
            "Probleminstansen er for stor til å løses etter sparsom "
            f"forbehandling ({base_var_bound} basisvariabler)."
        )

    return (
        SolverProblem(
            candidates=candidates,
            interviewers=interviewers,
            panel_size=panel_size,
            options=options,
            candidates_per_session=max(1, int(options.candidates_per_session)),
            policy=policy,
            sorted_slots=sorted_slots,
            canonical_blocks=canonical_blocks,
            eligibility=eligibility,
            feasible_slots_by_candidate={
                candidate_id: tuple(slots)
                for candidate_id, slots in feasible_slots_by_candidate.items()
            },
            candidate_ids_by_slot={
                interview_time: tuple(candidate_ids)
                for interview_time, candidate_ids in candidate_ids_by_slot.items()
            },
            panel_pairs=tuple(sorted(panel_pairs)),
            locked_by_candidate=locked_by_candidate,
            locked_assignments=normalized_locks,
            previous_schedule=list(previous_schedule_data or []),
            availability=availability,
            discouraged=discouraged,
            candidate_map=candidate_map,
            interviewer_map=interviewer_map,
            unplaceable_reason=unplaceable_reason,
            masks={
                "interviewer_bits": interviewer_bits,
                "availability_by_slot": availability_masks,
                "conflict_by_candidate": conflict_masks,
                "gender": gender_masks,
                "experienced": experienced_mask,
                "locked_by_candidate": locked_panel_masks,
                "block_slots": block_slot_masks,
                "previous_panel_by_candidate": previous_panel_masks,
            },
        ),
        None,
    )


def _add_and(model, target, parts):
    values = list(parts)
    for part in values:
        model.Add(target <= part)
    model.Add(target >= _linear_sum(values) - len(values) + 1)


def _minimize_lexicographically(model, tiers) -> bool:
    """Set the lexicographic objective. Returns True if it must be staged.

    The single weighted sum needs each tier scaled above the whole range of
    every tier below it, which overflows int64 on any realistic admission -
    so in practice this almost always reports True and the tiers are solved
    one at a time by `_solve_model`.
    """

    try:
        model.Minimize(solve_schedule_module._build_lexicographic_objective(tiers))
        staged = model.Validate().startswith("Possible integer overflow in objective")
    except OverflowError:
        staged = True
    if staged:
        model.Minimize(tiers[0].expression)
    return staged


def _arm_objective(built: BuiltModel) -> BuiltModel:
    """Promote a feasibility-only model into the optimising one, in place.

    `strict_feasibility` and `full_optimization` are the same model down to
    the last constraint - only the objective differs. Rebuilding it meant a
    second pass over every candidate/slot pair for nothing.
    """

    started = time.monotonic()
    staged = _minimize_lexicographically(built.model, built.tiers)
    return replace(
        built,
        staged_lexicographic=staged,
        build_ms=int((time.monotonic() - started) * 1000),
    )


def _build_model(
    problem: SolverProblem,
    *,
    full_placement: bool,
    hint_schedule: Sequence[dict] | None = None,
    feasibility_only: bool = False,
) -> BuiltModel:
    build_started = time.monotonic()
    model = cp_model.CpModel()
    schedule = {
        key: model.NewBoolVar(f"s_{key[0]}_{key[1]}")
        for key in sorted(problem.eligibility)
    }
    panel = {
        key: model.NewBoolVar(f"p_{key[0]}_{key[1]}") for key in problem.panel_pairs
    }
    if problem.candidates_per_session > 1:
        occupied = {
            interview_time: model.NewIntVar(
                0,
                problem.candidates_per_session,
                f"occ_{interview_time}",
            )
            for interview_time in problem.sorted_slots
        }
        panel_active = {
            interview_time: model.NewBoolVar(f"active_{interview_time}")
            for interview_time in problem.sorted_slots
        }
        for interview_time in problem.sorted_slots:
            model.AddMinEquality(
                panel_active[interview_time],
                [occupied[interview_time], 1],
            )
        session_active = panel_active
    else:
        occupied = {
            interview_time: model.NewBoolVar(f"occ_{interview_time}")
            for interview_time in problem.sorted_slots
        }
        session_active = occupied

    for candidate in problem.candidates:
        candidate_vars = [
            schedule[(candidate.id, interview_time)]
            for interview_time in problem.feasible_slots_by_candidate[candidate.id]
        ]
        if full_placement:
            model.Add(_linear_sum(candidate_vars) == 1)
        else:
            model.Add(_linear_sum(candidate_vars) <= 1)
        locked = problem.locked_by_candidate.get(candidate.id)
        if locked:
            locked_var = schedule.get((candidate.id, locked["time"]))
            if locked_var is None:
                model.Add(0 == 1)
            else:
                model.Add(locked_var == 1)

    for interview_time in problem.sorted_slots:
        slot_vars = [
            schedule[(candidate_id, interview_time)]
            for candidate_id in problem.candidate_ids_by_slot[interview_time]
        ]
        model.Add(occupied[interview_time] == _linear_sum(slot_vars))
        panel_vars = [
            panel[(interviewer.id, interview_time)]
            for interviewer in problem.interviewers
            if (interviewer.id, interview_time) in panel
        ]
        model.Add(
            _linear_sum(panel_vars)
            == problem.panel_size * session_active[interview_time]
        )

    if problem.candidates_per_session > 1:
        # Joint mode is exact, not "pack when possible": every session has
        # precisely N candidates sharing one panel. Slots holding locked
        # assignments are exempt - a previously published single interview
        # stays as it is while the remaining days are planned.
        locked_times = {
            locked["time"] for locked in problem.locked_by_candidate.values()
        }
        for interview_time in problem.sorted_slots:
            if interview_time in locked_times:
                continue
            model.Add(
                occupied[interview_time]
                == problem.candidates_per_session * session_active[interview_time]
            )

    # Aggregate every candidate conflict into one row per interviewer/slot.
    # The one-candidate-per-slot invariant makes this exact.
    eligible_sets = {
        key: frozenset(value) for key, value in problem.eligibility.items()
    }
    for (interviewer_id, interview_time), panel_var in panel.items():
        incompatible_candidates = [
            schedule[(candidate_id, interview_time)]
            for candidate_id in problem.candidate_ids_by_slot[interview_time]
            if interviewer_id not in eligible_sets[(candidate_id, interview_time)]
        ]
        model.Add(panel_var + _linear_sum(incompatible_candidates) <= 1)

    gender_data_available = any(
        interviewer.gender in {"M", "F"} for interviewer in problem.interviewers
    )
    if problem.options.enforce_same_gender and gender_data_available:
        # Count the matching panel members once per (slot, gender) and compare
        # each candidate against that count. Writing the sum out per
        # (candidate, slot) instead multiplies the model by the committee size:
        # on a 120-candidate admission it took the linear terms from 87k to
        # 217k, and past 200 candidates from 183k to 509k.
        needed_genders = sorted(
            {
                candidate.gender
                for candidate in problem.candidates
                if candidate.gender in {"M", "F"}
            }
        )
        gender_count: dict[tuple[str, int], Any] = {}
        for gender in needed_genders:
            matching_ids = [
                interviewer.id
                for interviewer in problem.interviewers
                if interviewer.gender == gender
            ]
            for interview_time in problem.sorted_slots:
                members = [
                    panel[(interviewer_id, interview_time)]
                    for interviewer_id in matching_ids
                    if (interviewer_id, interview_time) in panel
                ]
                if not members:
                    continue
                count = model.NewIntVar(
                    0, problem.panel_size, f"gender_{gender}_{interview_time}"
                )
                model.Add(count == _linear_sum(members))
                gender_count[(gender, interview_time)] = count
        for (candidate_id, interview_time), schedule_var in schedule.items():
            candidate = problem.candidate_map[candidate_id]
            if candidate.gender not in {"M", "F"}:
                continue
            count = gender_count.get((candidate.gender, interview_time))
            if count is None:
                # No interviewer of that gender can work the slot at all.
                model.Add(schedule_var == 0)
            else:
                model.Add(count >= schedule_var)

    experienced_panel_vars = []
    if problem.options.require_experienced_panel:
        for interview_time in problem.sorted_slots:
            experienced = [
                panel[(interviewer.id, interview_time)]
                for interviewer in problem.interviewers
                if interviewer.experience_level == "experienced"
                and (interviewer.id, interview_time) in panel
            ]
            model.Add(_linear_sum(experienced) >= session_active[interview_time])
            experienced_panel_vars.extend(experienced)

    for candidate_id, locked in problem.locked_by_candidate.items():
        interview_time = locked["time"]
        for interviewer in problem.interviewers:
            panel_var = panel.get((interviewer.id, interview_time))
            should_work = interviewer.id in locked["panel_ids"]
            if panel_var is None:
                if should_work:
                    model.Add(0 == 1)
                continue
            model.Add(panel_var == int(should_work))

    previous_by_candidate: dict[str, dict] = {}
    previous_time_vars = []
    retained_member_vars = []
    unchanged_row_vars = []
    previous_panel_member_count = 0
    hint_variables: dict[int, Any] = {}

    def remember_hint(variable):
        hint_variables[variable.Index()] = variable

    candidate_id_by_name = {
        candidate.name: candidate.id for candidate in problem.candidates
    }
    sorted_slot_set = frozenset(problem.sorted_slots)
    for row in problem.previous_schedule:
        candidate_id = row.get("candidate_id") or candidate_id_by_name.get(
            row.get("candidate")
        )
        interview_time = row.get("time")
        if (
            candidate_id not in problem.candidate_map
            or not isinstance(interview_time, int)
            or interview_time not in sorted_slot_set
        ):
            continue
        previous_by_candidate[candidate_id] = row
        time_var = schedule.get((candidate_id, interview_time))
        if time_var is not None:
            previous_time_vars.append(time_var)
            remember_hint(time_var)
        retained_for_row = []
        for member in row.get("panel") or []:
            previous_panel_member_count += 1
            interviewer_id = member.get("id")
            panel_var = panel.get((interviewer_id, interview_time))
            if time_var is None or panel_var is None:
                continue
            retained = model.NewBoolVar(
                f"retained_{candidate_id}_{interviewer_id}_{interview_time}"
            )
            _add_and(model, retained, (time_var, panel_var))
            retained_member_vars.append(retained)
            retained_for_row.append(retained)
            remember_hint(panel_var)
        if time_var is not None and len(retained_for_row) == problem.panel_size:
            unchanged = model.NewBoolVar(f"unchanged_{candidate_id}")
            _add_and(model, unchanged, (time_var, *retained_for_row))
            unchanged_row_vars.append(unchanged)

    for row in hint_schedule or []:
        candidate_id = str(row.get("candidate_id") or "")
        interview_time = row.get("time")
        time_var = schedule.get((candidate_id, interview_time))
        if time_var is not None:
            remember_hint(time_var)
        for member in row.get("panel") or []:
            panel_var = panel.get((str(member.get("id") or ""), interview_time))
            if panel_var is not None:
                remember_hint(panel_var)
    for variable in hint_variables.values():
        model.AddHint(variable, 1)

    blocks_by_day: dict[int, list[CanonicalBlock]] = {}
    for block in problem.canonical_blocks:
        blocks_by_day.setdefault(block.day, []).append(block)

    required_block_panel: dict[tuple[str, int], Any] = {}
    if problem.policy.requires_stable_panel:
        for block in problem.canonical_blocks:
            block_slots = list(block.usable_slots)
            if not block_slots:
                continue
            block_occupied = model.NewBoolVar(f"block_occupied_{block.index}")
            model.AddMaxEquality(
                block_occupied,
                [session_active[interview_time] for interview_time in block_slots],
            )
            block_slot_set = frozenset(block_slots)
            possible_ids = sorted(
                {
                    interviewer_id
                    for interviewer_id, interview_time in panel
                    if interview_time in block_slot_set
                }
            )
            block_members = {
                interviewer_id: model.NewBoolVar(
                    f"block_panel_{block.index}_{interviewer_id}"
                )
                for interviewer_id in possible_ids
            }
            model.Add(
                _linear_sum(block_members.values())
                == problem.panel_size * block_occupied
            )
            for interviewer_id, block_member in block_members.items():
                required_block_panel[(interviewer_id, block.index)] = block_member
                for interview_time in block_slots:
                    panel_var = panel.get((interviewer_id, interview_time))
                    # session_active is 0/1 ("is this slot in use"); occupied is
                    # 0..candidates_per_session. These are slot-in-use tests, so
                    # a joint slot (occupied == 2) must not push a Boolean past 1.
                    if panel_var is None:
                        model.Add(block_member + session_active[interview_time] <= 1)
                        continue
                    model.Add(panel_var <= block_member)
                    model.Add(
                        panel_var >= block_member + session_active[interview_time] - 1
                    )

    panel_break_vars = []
    if problem.policy.prefers_stable_panel or problem.options.repair_mode:
        for block in problem.canonical_blocks:
            block_slots = list(block.usable_slots)
            if not block_slots:
                continue
            block_occupied = model.NewBoolVar(f"reference_occupied_{block.index}")
            model.AddMaxEquality(
                block_occupied,
                [session_active[interview_time] for interview_time in block_slots],
            )
            block_slot_set = frozenset(block_slots)
            possible_ids = sorted(
                {
                    interviewer_id
                    for interviewer_id, interview_time in panel
                    if interview_time in block_slot_set
                }
            )
            reference = {
                interviewer_id: model.NewBoolVar(
                    f"reference_{block.index}_{interviewer_id}"
                )
                for interviewer_id in possible_ids
            }
            model.Add(
                _linear_sum(reference.values()) == problem.panel_size * block_occupied
            )
            for position, interview_time in enumerate(block_slots):
                for interviewer_id, reference_var in reference.items():
                    busy = panel.get((interviewer_id, interview_time), 0)
                    panel_break = model.NewBoolVar(
                        f"panel_break_{block.index}_{position}_{interviewer_id}"
                    )
                    # session_active, not occupied: a joint slot has occupied
                    # == candidates_per_session, which would force this Boolean
                    # break variable above 1 and make the model infeasible.
                    model.Add(panel_break <= session_active[interview_time])
                    model.Add(panel_break >= busy - reference_var)
                    model.Add(
                        panel_break
                        >= reference_var + session_active[interview_time] - busy - 1
                    )
                    model.Add(panel_break <= busy + reference_var)
                    model.Add(panel_break <= 2 - busy - reference_var)
                    panel_break_vars.append(panel_break)

    works_block: dict[tuple[str, int], Any] = {}
    if problem.options.avoid_consecutive_interviewer_blocks:
        for interviewer in problem.interviewers:
            for block in problem.canonical_blocks:
                if (interviewer.id, block.index) in required_block_panel:
                    works_block[(interviewer.id, block.index)] = required_block_panel[
                        (interviewer.id, block.index)
                    ]
                    continue
                assignments = [
                    panel[(interviewer.id, interview_time)]
                    for interview_time in block.usable_slots
                    if (interviewer.id, interview_time) in panel
                ]
                works = model.NewBoolVar(f"works_block_{interviewer.id}_{block.index}")
                if assignments:
                    model.AddMaxEquality(works, assignments)
                else:
                    model.Add(works == 0)
                works_block[(interviewer.id, block.index)] = works

    consecutive_block_vars = []
    if problem.options.avoid_consecutive_interviewer_blocks:
        for interviewer in problem.interviewers:
            for day_blocks in blocks_by_day.values():
                ordered = sorted(
                    day_blocks,
                    key=lambda block: (block.start_time, block.index),
                )
                for left, right in zip(ordered, ordered[1:]):
                    violation = model.NewBoolVar(
                        f"consecutive_{interviewer.id}_{left.index}_{right.index}"
                    )
                    left_work = works_block[(interviewer.id, left.index)]
                    right_work = works_block[(interviewer.id, right.index)]
                    _add_and(model, violation, (left_work, right_work))
                    consecutive_block_vars.append(violation)

    loads = []
    active_loads = []
    experienced_loads = []
    eligible_loads = []
    for interviewer in problem.interviewers:
        member_vars = [
            panel[(interviewer.id, interview_time)]
            for interview_time in problem.sorted_slots
            if (interviewer.id, interview_time) in panel
        ]
        load = model.NewIntVar(0, len(problem.candidates), f"load_{interviewer.id}")
        model.Add(load == _linear_sum(member_vars))
        loads.append(load)
        # Only count interviewers with any availability toward the spread.
        # Without this filter a fully-booked-out or zero-availability member
        # pins min(load) = 0, which collapses the load-spread term to max(load)
        # and effectively removes the spread objective from the model.
        if interviewer.availability:
            active_loads.append(load)
        if interviewer.experience_level == "experienced" and interviewer.availability:
            experienced_loads.append(load)
        if any(
            (interviewer.id, interview_time) in panel
            for interview_time in problem.sorted_slots
        ):
            eligible_loads.append(load)
    max_load = model.NewIntVar(0, len(problem.candidates), "max_load")
    if loads:
        model.AddMaxEquality(max_load, loads)
    else:
        model.Add(max_load == 0)

    load_spread = 0
    if len(active_loads) > 1:
        maximum = model.NewIntVar(0, len(problem.candidates), "max_active_load")
        minimum = model.NewIntVar(0, len(problem.candidates), "min_active_load")
        model.AddMaxEquality(maximum, active_loads)
        model.AddMinEquality(minimum, active_loads)
        load_spread = maximum - minimum
    experienced_load_spread = 0
    has_experienced_load_spread = len(experienced_loads) > 1
    if has_experienced_load_spread:
        maximum = model.NewIntVar(0, len(problem.candidates), "max_experienced_load")
        minimum = model.NewIntVar(0, len(problem.candidates), "min_experienced_load")
        model.AddMaxEquality(maximum, experienced_loads)
        model.AddMinEquality(minimum, experienced_loads)
        experienced_load_spread = maximum - minimum

    slot_rank = {
        interview_time: rank for rank, interview_time in enumerate(problem.sorted_slots)
    }
    # Day-major earliness: each day's cost band sits strictly above every
    # earlier day's, so day 1 fills completely before day 2 is touched.
    # Plain global-slot-rank earliness let a late slot on day 1 cost almost
    # as much as an early slot on day 2, which produced thin candidate
    # spread across many days instead of full early days.
    day_of_slot = {
        interview_time: interview_time // MINUTES_PER_DAY
        for interview_time in problem.sorted_slots
    }
    days_in_order = sorted(set(day_of_slot.values()))
    day_depth = {day: depth for depth, day in enumerate(days_in_order)}
    rank_within_day = {}
    per_day_counter: dict[int, int] = {}
    for interview_time in problem.sorted_slots:
        day = day_of_slot[interview_time]
        rank_within_day[interview_time] = per_day_counter.get(day, 0)
        per_day_counter[day] = rank_within_day[interview_time] + 1
    slots_per_day = max(per_day_counter.values(), default=1)
    earliness = _linear_sum(
        (
            day_depth[day_of_slot[interview_time]] * slots_per_day
            + rank_within_day[interview_time]
        )
        * schedule_var
        for (candidate_id, interview_time), schedule_var in schedule.items()
        if rank_within_day[interview_time] > 0
    )

    # Block fill: an empty slot with a USED slot after it (within the same
    # block) is a "hole" - a mid-block gap or a block that starts late.
    # Trailing empty slots are free: they are the sanctioned way to cut a
    # day short ("fyll fra venstre, kutt på slutten"). Combined with the
    # day-major earliness above this packs every day from its first slot
    # and lets leftover capacity fall at the end, instead of scattering
    # lonely interviews through the middle - easier logistics for panels
    # and candidates alike.
    hole_vars = []
    for block in problem.canonical_blocks:
        # Time-sorted, NOT input order: "fill from the earliest slot, cut at
        # the latest" must be a property of clock time, otherwise a permuted
        # all_slots/blocks input inverts the direction and breaks permutation
        # invariance (see test_solver_v2 differential).
        block_slots = sorted(block.usable_slots)
        if len(block_slots) < 2:
            continue
        for position in range(len(block_slots) - 1):
            any_after = model.NewBoolVar(f"hole_any_after_{block.index}_{position}")
            model.AddMaxEquality(
                any_after,
                [
                    session_active[interview_time]
                    for interview_time in block_slots[position + 1 :]
                ],
            )
            gap = model.NewBoolVar(f"hole_gap_{block.index}_{position}")
            # gap = NOT session_active(slot) AND any_after.
            model.Add(gap <= 1 - session_active[block_slots[position]])
            model.Add(gap <= any_after)
            model.Add(gap >= any_after - session_active[block_slots[position]])
            hole_vars.append(gap)
    hole_cost = _linear_sum(hole_vars)
    maximum_hole_cost = len(hole_vars)

    continuity_cost = 0
    maximum_continuity_cost = 0
    if problem.options.prioritize_continuity:
        latest_rank = model.NewIntVar(
            0, len(problem.sorted_slots) - 1, "latest_slot_rank"
        )
        for interview_time in problem.sorted_slots:
            model.Add(
                latest_rank
                >= slot_rank[interview_time] * session_active[interview_time]
            )
        sequences = [
            list(block.usable_slots)
            for block in problem.canonical_blocks
            if block.usable_slots
        ]
        covered = {
            interview_time for sequence in sequences for interview_time in sequence
        }
        if not sequences:
            sequences = [problem.sorted_slots]
        else:
            sequences.extend(
                [
                    [interview_time]
                    for interview_time in problem.sorted_slots
                    if interview_time not in covered
                ]
            )
        run_starts = []
        for sequence_index, sequence in enumerate(sequences):
            previous = None
            for position, interview_time in enumerate(sequence):
                current = session_active[interview_time]
                if previous is None:
                    run_starts.append(current)
                else:
                    run_start = model.NewBoolVar(
                        f"run_start_{sequence_index}_{position}"
                    )
                    model.Add(run_start >= current - previous)
                    model.Add(run_start <= current)
                    model.Add(run_start <= 1 - previous)
                    run_starts.append(run_start)
                previous = current
        continuity_cost = problem.options.continuity_weight * (
            len(problem.candidates) * latest_rank
            + len(problem.candidates) * _linear_sum(run_starts)
        )
        maximum_continuity_cost = problem.options.continuity_weight * (
            len(problem.candidates) * max(0, len(problem.sorted_slots) - 1)
            + len(problem.candidates) * len(problem.sorted_slots)
        )

    changed_times = len(previous_by_candidate) - _linear_sum(previous_time_vars)
    changed_rows = len(previous_by_candidate) - _linear_sum(unchanged_row_vars)
    changed_panel_members = previous_panel_member_count - _linear_sum(
        retained_member_vars
    )
    repair_cost = 0
    maximum_repair_cost = 0
    if problem.options.repair_mode and previous_by_candidate:
        profile = REPAIR_PROFILES.get(
            problem.options.repair_strategy,
            REPAIR_PROFILES["balanced"],
        )
        repair_cost = (
            profile["time"] * changed_times
            + profile["row"] * changed_rows
            + profile["member"] * changed_panel_members
            + profile["panel_break"] * _linear_sum(panel_break_vars)
        )
        maximum_repair_cost = (
            profile["time"] * len(previous_by_candidate)
            + profile["row"] * len(previous_by_candidate)
            + profile["member"] * previous_panel_member_count
            + profile["panel_break"] * len(panel_break_vars)
        )

    total_placed = _linear_sum(schedule.values())
    overtime_vars = [
        panel_var
        for (interviewer_id, interview_time), panel_var in panel.items()
        if interview_time not in problem.availability[interviewer_id]
    ]
    discouraged_vars = [
        panel_var
        for (interviewer_id, interview_time), panel_var in panel.items()
        if interview_time in problem.discouraged.get(interviewer_id, ())
    ]
    extra_experienced = 0
    maximum_extra_experienced = 0
    if problem.options.require_experienced_panel:
        extra_experienced = _linear_sum(experienced_panel_vars) - _linear_sum(
            session_active.values()
        )
        maximum_extra_experienced = max(
            0, (problem.panel_size - 1) * len(problem.sorted_slots)
        )
    discouraged_cost = problem.options.discouraged_weight * _linear_sum(
        discouraged_vars
    )
    maximum_discouraged_cost = problem.options.discouraged_weight * len(
        discouraged_vars
    )
    structure = (
        problem.options.load_balance_weight
        * (max_load + load_spread + experienced_load_spread)
        + continuity_cost
        + discouraged_cost
    )
    maximum_structure = (
        (2 + int(has_experienced_load_spread))
        * problem.options.load_balance_weight
        * len(problem.candidates)
        + maximum_continuity_cost
        + maximum_discouraged_cost
    )
    maximum_earliness = len(problem.candidates) * max(
        0, len(days_in_order) * slots_per_day - 1
    )
    panel_stability_cost = _linear_sum(panel_break_vars)
    previous_stability = (
        previous_panel_member_count + 1
    ) * changed_times + changed_panel_members
    candidate_rank = {
        candidate.id: rank for rank, candidate in enumerate(problem.candidates)
    }
    interviewer_rank = {
        interviewer.id: rank for rank, interviewer in enumerate(problem.interviewers)
    }
    canonical_tie = _linear_sum(
        candidate_rank[candidate_id]
        * (len(problem.sorted_slots) - 1 - slot_rank[interview_time])
        * schedule_var
        for (candidate_id, interview_time), schedule_var in schedule.items()
    ) + _linear_sum(
        interviewer_rank[interviewer_id]
        * (len(problem.sorted_slots) - slot_rank[interview_time])
        * panel_var
        for (interviewer_id, interview_time), panel_var in panel.items()
    )
    maximum_canonical_tie = max(0, len(problem.candidates) - 1) * max(
        0, len(problem.sorted_slots) - 1
    ) * len(problem.candidates) + max(0, len(problem.interviewers) - 1) * len(
        problem.sorted_slots
    ) * problem.panel_size * len(
        problem.candidates
    )
    stability_tie = (maximum_canonical_tie + 1) * previous_stability + canonical_tie
    maximum_previous_stability = (previous_panel_member_count + 1) * len(
        previous_by_candidate
    ) + previous_panel_member_count
    maximum_stability_tie = (
        maximum_canonical_tie + 1
    ) * maximum_previous_stability + maximum_canonical_tie

    tiers = [
        ObjectiveTier(
            "unplaced_candidates",
            len(problem.candidates) - total_placed,
            len(problem.candidates),
        ),
        ObjectiveTier("availability", _linear_sum(overtime_vars), len(overtime_vars)),
    ]
    if problem.options.repair_mode and previous_by_candidate:
        tiers.append(ObjectiveTier("repair_cost", repair_cost, maximum_repair_cost))
    elif problem.policy.prefers_stable_panel:
        tiers.append(
            ObjectiveTier(
                "panel_stability",
                panel_stability_cost,
                len(panel_break_vars),
            )
        )
    # With joint interviews the solver packs two candidates into one shared
    # panel whenever it can: fewer sessions means the panel does one joint
    # interview instead of two separate ones. Skipped in repair mode so a
    # minimal-change repair is never forced to pair candidates up.
    if problem.candidates_per_session > 1 and not (
        problem.options.repair_mode and previous_by_candidate
    ):
        tiers.append(
            ObjectiveTier(
                "joint_sessions",
                _linear_sum(session_active.values()),
                len(session_active),
            )
        )
    earliness_tier = ObjectiveTier("earliness", earliness, maximum_earliness)
    # Progressive publishing strands an early-published day's spare capacity
    # (the boundary is immutable), so an opted-in solve ranks day-major
    # earliness above the fairness terms: Monday saturates before Tuesday is
    # touched, keeping the unpublished tail whole for candidates that arrive
    # later. Repairs keep their minimal-change precedence over packing, and
    # by default earliness stays the final tie-breaker below load balancing
    # and continuity.
    promote_earliness = getattr(problem.options, "pack_early", False) and not (
        problem.options.repair_mode and previous_by_candidate
    )
    if promote_earliness:
        tiers.append(earliness_tier)
    tiers.extend(
        [
            ObjectiveTier(
                "adjacent_block_rest",
                _linear_sum(consecutive_block_vars),
                len(consecutive_block_vars),
            ),
            ObjectiveTier("block_fill", hole_cost, maximum_hole_cost),
            ObjectiveTier(
                "load_and_continuity",
                structure,
                maximum_structure,
            ),
            *(
                [
                    # How many experienced members sit in panels beyond the
                    # required one. Purely aesthetic - and when the committee
                    # has few non-experienced interviewers, driving it to
                    # zero means putting the same juniors in every panel.
                    # It must therefore rank below fair distribution, or a
                    # senior-heavy committee concentrates its whole load on
                    # the few juniors (three people at 30+ interviews while
                    # everyone else idles).
                    ObjectiveTier(
                        "extra_experienced",
                        extra_experienced,
                        maximum_extra_experienced,
                    )
                ]
                if problem.options.require_experienced_panel
                else []
            ),
        ]
    )
    if not promote_earliness:
        tiers.append(earliness_tier)
    if not (problem.options.repair_mode and previous_by_candidate):
        tiers.append(
            ObjectiveTier(
                "stability_tie_breaker",
                stability_tie,
                maximum_stability_tie,
            )
        )

    staged_lexicographic = (
        False if feasibility_only else _minimize_lexicographically(model, tiers)
    )
    variable_count = len(model.Proto().variables)
    constraint_count = len(model.Proto().constraints)
    if variable_count > constants.MAX_SOLVER_MODEL_VARS:
        raise ModelTooLarge
    if constraint_count > constants.MAX_SOLVER_MODEL_CONSTRAINTS:
        raise ModelTooLarge
    return BuiltModel(
        model=model,
        schedule=schedule,
        panel=panel,
        occupied=occupied,
        tiers=tiers,
        full_placement=full_placement,
        previous_panel_member_count=previous_panel_member_count,
        variable_count=variable_count,
        constraint_count=constraint_count,
        build_ms=int((time.monotonic() - build_started) * 1000),
        staged_lexicographic=staged_lexicographic,
    )


# Tiers whose only job is to canonicalise between plans that are already equal
# on every meaningful measure. Proving one optimal was measured eating a fifth
# of the budget, so they never get more than a sliver of what is left.
_TIE_BREAKER_TIERS = frozenset({"stability_tie_breaker"})


class _IncumbentCallback(cp_model.CpSolverSolutionCallback):
    """Times a phase's first solution and streams improving plans out.

    `publish` receives a reconstructed schedule and returns False to ask the
    search to stop - that is how a cancelled job stops burning CPU. It runs
    inside CP-SAT's search, so it is rate limited here (reconstruction walks
    every candidate/slot variable) and can never propagate an exception into
    the solver.
    """

    def __init__(self, phase_started, *, problem=None, built=None, publish=None):
        super().__init__()
        self._phase_started = phase_started
        self._problem = problem
        self._built = built
        self._publish = publish
        self._last_published = 0.0
        self.first_incumbent_ms = None

    def on_solution_callback(self):
        now = time.monotonic()
        if self.first_incumbent_ms is None:
            self.first_incumbent_ms = int((now - self._phase_started) * 1000)
        if self._publish is None or self._problem is None:
            return
        if (
            self._last_published
            and now - self._last_published < constants.SOLVER_INCUMBENT_PUBLISH_SECONDS
        ):
            return
        self._last_published = now
        try:
            keep_going = self._publish(_reconstruct(self._problem, self._built, self))
        except Exception:
            # A broken publisher must degrade to "no live preview", never to a
            # failed solve: the plan itself is still perfectly good.
            log.exception("solver_incumbent_publish_failed")
            self._publish = None
            return
        if keep_going is False:
            self.StopSearch()


def _model_variables(built: BuiltModel) -> list[Any]:
    """Every variable in the model, in proto order.

    Hinting the whole assignment - not just the candidate/panel booleans - is
    what lets CP-SAT accept a previous solution outright instead of
    re-deriving the auxiliary block, run and break variables that define it.
    """

    return [
        built.model.GetIntVarFromProtoIndex(index)
        for index in range(len(built.model.Proto().variables))
    ]


def _full_assignment(built: BuiltModel, solver: cp_model.CpSolver) -> list[int]:
    """Snapshot a solution so a later phase can be warm-started from it."""

    return [solver.Value(variable) for variable in _model_variables(built)]


def _solve_model(
    built: BuiltModel,
    *,
    deadline: float,
    problem: SolverProblem | None = None,
    publish_incumbent=None,
    warm_start: Sequence[int] | None = None,
) -> tuple[int, cp_model.CpSolver, int]:
    """Run the model until the deadline, staging the tiers when needed.

    Staged mode solves one tier at a time and freezes each tier's value before
    moving down. Three properties keep that from throwing budget away:

    * every tier is warm-started from the previous tier's solution, which is
      feasible by construction once the tier above it is pinned. Without the
      hint CP-SAT re-derives a first solution from scratch on an ever more
      constrained model, and frequently spends the whole slice doing it;
    * a tier that returns nothing is skipped, not fatal. The tiers below it
      are still worth optimising and the incumbent above is untouched, so
      abandoning the sweep would forfeit both the remaining tiers and the
      remaining budget;
    * whatever budget survives the sweep goes back into the tiers that were
      never proven. Every other tier stays pinned during that pass, so a
      better value there is a strict lexicographic improvement, never a trade.
    """

    def configured_solver():
        configured = cp_model.CpSolver()
        configured.parameters.num_workers = constants.SOLVER_NUM_WORKERS
        configured.parameters.random_seed = constants.SOLVER_RANDOM_SEED
        configured.parameters.linearization_level = constants.SOLVER_LINEARIZATION_LEVEL
        # NB: `repair_hint` looks made for the reclaim pass (which can tighten a
        # tier below the incumbent that seeded the hint) but crashes CP-SAT
        # inside MinimizeL1DistanceWithHint on this model. An unusable hint is
        # discarded silently instead, which is the behaviour we want anyway.
        return configured

    def make_callback(phase_started):
        return _IncumbentCallback(
            phase_started,
            problem=problem,
            built=built,
            publish=publish_incumbent,
        )

    solver = configured_solver()
    started = time.monotonic()
    if not built.staged_lexicographic:
        solver.parameters.max_time_in_seconds = max(0.001, deadline - time.monotonic())
        callback = make_callback(started)
        status = solver.Solve(built.model, callback)
        solver._phase_first_incumbent_ms = callback.first_incumbent_ms
        return status, solver, int((time.monotonic() - started) * 1000)

    hint_variables = _model_variables(built)
    # A warm start from the phase before is already a solution of this model:
    # the strict-feasibility phase solves the very same constraints.
    incumbent: list[int] | None = list(warm_start) if warm_start else None
    best_solver = None
    status = cp_model.UNKNOWN
    first_incumbent_ms = None
    proven_tiers: set[int] = set()
    tier_values: dict[int, int] = {}

    def run_tier(tier, cap):
        """Minimise one tier from the current incumbent. Returns (status, value)."""

        nonlocal status, best_solver, first_incumbent_ms, incumbent
        if incumbent is not None:
            # Only clear once there is something better to put in their place:
            # before the first solution the build-time hints (the previous
            # published schedule) are the best guess available.
            built.model.ClearHints()
            for variable, value in zip(hint_variables, incumbent):
                built.model.AddHint(variable, value)
        built.model.Minimize(tier.expression)
        tier_solver = configured_solver()
        tier_solver.parameters.max_time_in_seconds = max(0.001, cap)
        callback = make_callback(started)
        tier_status = tier_solver.Solve(built.model, callback)
        if callback.first_incumbent_ms is not None:
            first_incumbent_ms = (
                callback.first_incumbent_ms
                if first_incumbent_ms is None
                else min(first_incumbent_ms, callback.first_incumbent_ms)
            )
        status = tier_status
        if tier_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return tier_status, None
        best_solver = tier_solver
        incumbent = [tier_solver.Value(variable) for variable in hint_variables]
        return tier_status, int(tier_solver.Value(tier.expression))

    def tier_cap(tier, remaining, *, share):
        cap = remaining * share
        if tier.name in _TIE_BREAKER_TIERS:
            cap = min(cap, remaining * constants.SOLVER_TIE_BREAKER_BUDGET_SHARE)
        return cap

    unproven: list[int] = []
    for index, tier in enumerate(built.tiers):
        remaining = deadline - time.monotonic()
        if remaining <= 0.001:
            break
        tiers_left = len(built.tiers) - index
        # Cap the slice of the remaining budget each tier may spend, so a tier
        # that finds good solutions but cannot prove them optimal leaves time
        # for the tiers after it. Without the cap, a large admission can burn
        # the entire budget proving the first tier (minimising unplaced
        # candidates) and return a plan whose quality tiers - rest between
        # blocks, balanced load - were never optimised at all.
        share = 1.0 if tiers_left == 1 else 2 / (tiers_left + 1)
        if unproven:
            # Reclaim work is already queued, so no single tier may swallow
            # more than half of what is left.
            share = min(share, constants.SOLVER_TIER_BUDGET_SHARE)
        tier_status, tier_value = run_tier(tier, tier_cap(tier, remaining, share=share))
        if tier_value is None:
            unproven.append(index)
            continue
        tier_values[index] = tier_value
        if index < len(built.tiers) - 1:
            if tier_status == cp_model.OPTIMAL:
                built.model.Add(tier.expression == tier_value)
            else:
                # Only an upper bound is proven, so pin the bound and keep
                # going: the remaining tiers then search for solutions at
                # least this good instead of the run ending on an arbitrary
                # point of this tier.
                built.model.Add(tier.expression <= tier_value)
        if tier_status == cp_model.OPTIMAL:
            proven_tiers.add(index)
        else:
            unproven.append(index)

    # Reclaim: spend what is left on the tiers that never proved out. Each
    # round is bounded and only re-queues a tier that strictly improved, so
    # this cannot spin on a tier that has stopped making progress.
    rounds_left = 2 * len(built.tiers)
    while unproven and rounds_left > 0:
        rounds_left -= 1
        remaining = deadline - time.monotonic()
        if remaining <= 1.0:
            break
        index = unproven.pop(0)
        tier = built.tiers[index]
        share = 1.0 if not unproven else constants.SOLVER_TIER_BUDGET_SHARE
        tier_status, tier_value = run_tier(tier, tier_cap(tier, remaining, share=share))
        if tier_value is None:
            continue
        # A tier that produced nothing during the sweep has no value to beat,
        # so its first result counts as progress and earns another round.
        previous_value = tier_values.get(index)
        improved = previous_value is None or tier_value < previous_value
        tier_values[index] = tier_value
        if tier_status == cp_model.OPTIMAL:
            # Deliberately NOT credited to `proven_tiers`. This proves the
            # tier optimal only *within* the region the later tiers were
            # pinned to, and those pins were chosen while this tier was
            # merely bounded - so the lexicographic optimum is still
            # unproven. The plan gets better; the verdict does not.
            built.model.Add(tier.expression == tier_value)
            continue
        built.model.Add(tier.expression <= tier_value)
        if improved:
            unproven.append(index)

    if best_solver is None:
        return status, solver, int((time.monotonic() - started) * 1000)
    best_solver._phase_first_incumbent_ms = first_incumbent_ms
    # Every tier ran and every tier proved its own optimum: only then is the
    # lexicographic optimum itself proven.
    resolved = (
        cp_model.OPTIMAL if len(proven_tiers) == len(built.tiers) else cp_model.FEASIBLE
    )
    return resolved, best_solver, int((time.monotonic() - started) * 1000)


def _reconstruct(
    problem: SolverProblem,
    built: BuiltModel,
    solver: cp_model.CpSolver,
) -> list[dict]:
    rows = []
    for candidate in problem.candidates:
        for interview_time in problem.feasible_slots_by_candidate[candidate.id]:
            schedule_var = built.schedule.get((candidate.id, interview_time))
            if schedule_var is None or not solver.BooleanValue(schedule_var):
                continue
            members = [
                interviewer
                for interviewer in problem.interviewers
                if (interviewer.id, interview_time) in built.panel
                and solver.BooleanValue(built.panel[(interviewer.id, interview_time)])
            ]
            rows.append(
                {
                    "candidate_id": candidate.id,
                    "candidate": candidate.name,
                    "time": interview_time,
                    "panel": [
                        {
                            "id": interviewer.id,
                            "name": interviewer.name,
                            "is_overtime": (
                                interview_time
                                not in problem.availability[interviewer.id]
                            ),
                            "experience_level": interviewer.experience_level,
                        }
                        for interviewer in members
                    ],
                    "locked": candidate.id in problem.locked_by_candidate,
                }
            )
            break
    return rows


def _evaluate_phase(
    *,
    name: str,
    status: int,
    solver: cp_model.CpSolver,
    built: BuiltModel,
    solve_ms: int,
    problem: SolverProblem,
) -> PhaseResult:
    status_name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return PhaseResult(
            name=name,
            status=status,
            status_name=status_name,
            solver=solver,
            built=built,
            schedule=None,
            objective_vector=None,
            objective_key=None,
            validation_issues=[],
            solve_ms=solve_ms,
            validation_ms=0,
        )
    validation_started = time.monotonic()
    schedule = _reconstruct(problem, built, solver)
    issues = validate_schedule_result(
        schedule=schedule,
        candidates=problem.candidates,
        interviewers=problem.interviewers,
        panel_size=problem.panel_size,
        all_slots=problem.sorted_slots,
        allow_overtime=problem.options.allow_overtime,
        enforce_same_gender=problem.options.enforce_same_gender,
        require_experienced_panel=problem.options.require_experienced_panel,
        requires_stable_panel=problem.policy.requires_stable_panel,
        blocks=problem.canonical_blocks,
        locked_assignments=problem.locked_assignments,
        require_all_candidates=built.full_placement,
        candidates_per_session=problem.options.candidates_per_session,
    )
    vector = None
    key = None
    if not issues:
        vector = evaluate_objective_vector(
            schedule=schedule,
            candidates=problem.candidates,
            interviewers=problem.interviewers,
            sorted_slots=problem.sorted_slots,
            blocks=problem.canonical_blocks,
            previous_schedule=problem.previous_schedule,
            panel_size=problem.panel_size,
            require_experienced_panel=problem.options.require_experienced_panel,
            candidates_per_session=problem.options.candidates_per_session,
        )
        key = objective_key(
            vector,
            candidate_count=len(problem.candidates),
            repair_mode=problem.options.repair_mode,
            repair_strategy=problem.options.repair_strategy,
            prefers_stable_panel=problem.policy.prefers_stable_panel,
            load_balance_weight=problem.options.load_balance_weight,
            continuity_weight=problem.options.continuity_weight,
            previous_panel_member_count=built.previous_panel_member_count,
            candidates_per_session=problem.options.candidates_per_session,
            has_previous_schedule=bool(problem.previous_schedule),
        )
    return PhaseResult(
        name=name,
        status=status,
        status_name=status_name,
        solver=solver,
        built=built,
        schedule=schedule if not issues else None,
        objective_vector=vector,
        objective_key=key,
        validation_issues=[issue.as_dict() for issue in issues],
        solve_ms=solve_ms,
        validation_ms=int((time.monotonic() - validation_started) * 1000),
    )


def _phase_metrics(phase: PhaseResult):
    return {
        "name": phase.name,
        "status": phase.status_name,
        "build_ms": phase.built.build_ms,
        "solve_ms": phase.solve_ms,
        "validation_ms": phase.validation_ms,
        "first_incumbent_ms": getattr(
            phase.solver,
            "_phase_first_incumbent_ms",
            None,
        ),
        "variables": phase.built.variable_count,
        "constraints": phase.built.constraint_count,
        "candidate_slot_variables": len(phase.built.schedule),
        "panel_slot_variables": len(phase.built.panel),
        "primary_assignment_variables": (
            len(phase.built.schedule) + len(phase.built.panel)
        ),
        "staged_lexicographic": phase.built.staged_lexicographic,
        "branches": _solver_counter(phase.solver, "NumBranches"),
        "conflicts": _solver_counter(phase.solver, "NumConflicts"),
        "validated": phase.schedule is not None,
        "validation_issue_codes": sorted(
            {issue["code"] for issue in phase.validation_issues}
        )[:20],
    }


def _solver_counter(solver, name: str) -> int | None:
    """A search counter from a solver that may never have run.

    In staged mode every tier solves with its own solver, so a phase where no
    tier produced a solution hands back the untouched one it started with -
    and ortools raises "solve() has not been called." rather than reporting
    zero. Metrics are diagnostic, and the worker asks for them on every run:
    a missing counter must never turn a solve into a RuntimeError.
    """

    try:
        return getattr(solver, name)()
    except (RuntimeError, AttributeError):
        return None


def _first_incumbent_ms(phases: Sequence[PhaseResult], preprocess_ms: int):
    elapsed = preprocess_ms
    for phase in phases:
        elapsed += phase.built.build_ms
        if phase.schedule is not None:
            return elapsed + (
                getattr(phase.solver, "_phase_first_incumbent_ms", None)
                or phase.solve_ms
            )
        elapsed += phase.solve_ms + phase.validation_ms
    return None


def _unplaceable(problem: SolverProblem, placed_ids: set[str]):
    entries = []
    for candidate in problem.candidates:
        if candidate.id in placed_ids:
            continue
        reason_code, reason = problem.unplaceable_reason[candidate.id]
        entries.append(
            {
                "candidate_id": candidate.id,
                "candidate": candidate.name,
                "reason_code": reason_code,
                "reason": reason,
            }
        )
    return entries


def _repair_neighborhood_problem(problem: SolverProblem) -> SolverProblem | None:
    """Freeze unaffected previous rows and leave only damaged rows movable."""

    if not problem.options.repair_mode or not problem.previous_schedule:
        return None
    candidate_id_by_name = {
        candidate.name: candidate.id for candidate in problem.candidates
    }
    explicit_locked_times = {
        locked["time"]: candidate_id
        for candidate_id, locked in problem.locked_by_candidate.items()
    }
    previous_rows: dict[str, tuple[int, frozenset[str], dict]] = {}
    duplicate_candidates: set[str] = set()
    rows_by_time: dict[int, list[tuple[frozenset[str], str]]] = {}
    for row in problem.previous_schedule:
        candidate_id = row.get("candidate_id") or candidate_id_by_name.get(
            row.get("candidate")
        )
        interview_time = row.get("time")
        panel_ids = frozenset(
            str(member.get("id") or "")
            for member in (row.get("panel") or [])
            if isinstance(member, dict)
        )
        if candidate_id in previous_rows:
            duplicate_candidates.add(candidate_id)
        if isinstance(interview_time, int):
            rows_by_time.setdefault(interview_time, []).append(
                (panel_ids, candidate_id)
            )
        if candidate_id in problem.candidate_map and isinstance(interview_time, int):
            previous_rows[candidate_id] = (interview_time, panel_ids, row)

    # A joint session (two candidates, one shared panel) is not a duplicate
    # time: both rows may be frozen together. Anything else sharing a time is
    # ambiguous and stays movable.
    duplicate_times: set[int] = set()
    for interview_time, entries in rows_by_time.items():
        if len(entries) > problem.candidates_per_session:
            duplicate_times.add(interview_time)
            continue
        if len(entries) == 1:
            continue
        panels = {panel_ids for panel_ids, _candidate_id in entries}
        if problem.candidates_per_session <= 1 or len(panels) > 1:
            duplicate_times.add(interview_time)

    invalid_required_blocks: set[int] = set()
    if problem.policy.requires_stable_panel:
        for block in problem.canonical_blocks:
            block_slot_set = frozenset(block.usable_slots)
            block_panels = {
                panel_ids
                for interview_time, panel_ids, _row in previous_rows.values()
                if interview_time in block_slot_set
            }
            if len(block_panels) > 1:
                invalid_required_blocks.add(block.index)

    block_slot_sets = {
        block.index: frozenset(block.usable_slots) for block in problem.canonical_blocks
    }
    frozen_by_candidate = dict(problem.locked_by_candidate)
    frozen_assignments = list(problem.locked_assignments)
    for candidate_id, (interview_time, panel_ids, row) in previous_rows.items():
        if candidate_id in duplicate_candidates or interview_time in duplicate_times:
            continue
        if len(panel_ids) != problem.panel_size:
            continue
        if (candidate_id, interview_time) not in problem.eligibility:
            continue
        if not panel_ids.issubset(problem.eligibility[(candidate_id, interview_time)]):
            continue
        explicit_owner = explicit_locked_times.get(interview_time)
        if explicit_owner is not None and explicit_owner != candidate_id:
            continue
        explicit = problem.locked_by_candidate.get(candidate_id)
        if explicit is not None and (
            explicit["time"] != interview_time or explicit["panel_ids"] != panel_ids
        ):
            continue
        candidate = problem.candidate_map[candidate_id]
        required_mask = _requirements_for_candidate(
            candidate,
            options=problem.options,
            gender_data_available=any(
                interviewer.gender in {"M", "F"} for interviewer in problem.interviewers
            ),
        )
        if not _panel_covers_requirements(
            tuple(panel_ids),
            candidate,
            problem.interviewer_map,
            required_mask,
        ):
            continue
        if any(
            block.index in invalid_required_blocks
            and interview_time in block_slot_sets[block.index]
            for block in problem.canonical_blocks
        ):
            continue
        if explicit is None:
            frozen_by_candidate[candidate_id] = {
                "time": interview_time,
                "panel_ids": panel_ids,
            }
            frozen_assignments.append(
                {
                    "candidate_id": candidate_id,
                    "time": interview_time,
                    "panel": [
                        {"id": interviewer_id} for interviewer_id in sorted(panel_ids)
                    ],
                }
            )

    if len(frozen_by_candidate) == len(problem.locked_by_candidate):
        return None
    return replace(
        problem,
        locked_by_candidate=frozen_by_candidate,
        locked_assignments=frozen_assignments,
    )


def solve_schedule_v2(
    candidates_data: List[dict],
    interviewers_data: List[dict],
    panel_size: int,
    options_data: Dict[str, Any] | None = None,
    locked_assignments_data: List[dict] | None = None,
    all_slots_data: List[int] | None = None,
    blocks_data: List[List[int]] | None = None,
    block_metadata_data: List[dict] | None = None,
    previous_schedule_data: List[dict] | None = None,
    *,
    include_metrics: bool = False,
    on_incumbent=None,
) -> Dict[str, Any]:
    """Solve the interview schedule.

    `on_incumbent`, when given, receives every improving plan as it is found -
    already validated, so a caller may show or adopt it directly. Returning
    False from it asks the solver to stop early and keep what it has, which is
    how a cancelled job stops burning CPU without losing its work.
    """

    started = time.monotonic()
    configured_budget = float(
        (options_data or {}).get("max_solver_seconds", constants.DEFAULT_SOLVER_SECONDS)
    )
    budget = max(1.0, min(configured_budget, constants.MAX_SOLVER_SECONDS))
    deadline = started + budget
    problem, early_result = _normalize_problem(
        candidates_data=candidates_data,
        interviewers_data=interviewers_data,
        panel_size=panel_size,
        options_data=options_data,
        locked_assignments_data=locked_assignments_data,
        all_slots_data=all_slots_data,
        blocks_data=blocks_data,
        block_metadata_data=block_metadata_data,
        previous_schedule_data=previous_schedule_data,
    )
    if early_result is not None:
        return early_result
    preprocess_ms = int((time.monotonic() - started) * 1000)

    def make_publisher(phase_problem: SolverProblem, *, full_placement: bool):
        """Wrap the caller's hook so only *valid* plans ever escape early.

        A live incumbent may be adopted straight from the browser, so it has
        to clear the same validator as a finished result; an invalid one is
        simply not published and the search carries on.
        """

        if on_incumbent is None:
            return None

        def publish(schedule: list[dict]):
            issues = validate_schedule_result(
                schedule=schedule,
                candidates=phase_problem.candidates,
                interviewers=phase_problem.interviewers,
                panel_size=phase_problem.panel_size,
                all_slots=phase_problem.sorted_slots,
                allow_overtime=phase_problem.options.allow_overtime,
                enforce_same_gender=phase_problem.options.enforce_same_gender,
                require_experienced_panel=(
                    phase_problem.options.require_experienced_panel
                ),
                requires_stable_panel=phase_problem.policy.requires_stable_panel,
                blocks=phase_problem.canonical_blocks,
                locked_assignments=phase_problem.locked_assignments,
                require_all_candidates=full_placement,
                candidates_per_session=phase_problem.options.candidates_per_session,
            )
            if issues:
                return True
            placed_ids = {str(row.get("candidate_id") or "") for row in schedule}
            unplaceable = _unplaceable(phase_problem, placed_ids)
            return on_incumbent(
                {
                    "status": "SUCCESS" if not unplaceable else "PARTIAL",
                    "schedule": schedule,
                    "unplaceable": unplaceable,
                    "locked_conflicts": [],
                    "optimal": False,
                    "objective_vector": evaluate_objective_vector(
                        schedule=schedule,
                        candidates=phase_problem.candidates,
                        interviewers=phase_problem.interviewers,
                        sorted_slots=phase_problem.sorted_slots,
                        blocks=phase_problem.canonical_blocks,
                        previous_schedule=phase_problem.previous_schedule,
                        panel_size=phase_problem.panel_size,
                        require_experienced_panel=(
                            phase_problem.options.require_experienced_panel
                        ),
                        candidates_per_session=(
                            phase_problem.options.candidates_per_session
                        ),
                    ).as_dict(),
                    "elapsed_ms": int((time.monotonic() - started) * 1000),
                }
            )

        return publish

    publish = make_publisher(problem, full_placement=True)
    publish_partial = make_publisher(problem, full_placement=False)

    phases: list[PhaseResult] = []
    incumbents: list[PhaseResult] = []
    neighborhood_problem = _repair_neighborhood_problem(problem)
    if neighborhood_problem is not None and time.monotonic() < deadline:
        repair_deadline = min(deadline, time.monotonic() + 2.0)
        try:
            repair_model = _build_model(
                neighborhood_problem,
                full_placement=True,
            )
        except ModelTooLarge:
            repair_model = None
        if repair_model is not None and time.monotonic() < repair_deadline:
            status, solver, solve_ms = _solve_model(
                repair_model,
                deadline=repair_deadline,
                problem=neighborhood_problem,
                publish_incumbent=make_publisher(
                    neighborhood_problem, full_placement=True
                ),
            )
            repair_phase = _evaluate_phase(
                name="repair_neighborhood",
                status=status,
                solver=solver,
                built=repair_model,
                solve_ms=solve_ms,
                problem=neighborhood_problem,
            )
            phases.append(repair_phase)
            if repair_phase.schedule is not None:
                incumbents.append(repair_phase)

    strict_slice = min(5.0, 0.2 * budget)
    strict_deadline = min(deadline, time.monotonic() + strict_slice)
    try:
        strict_model = _build_model(
            problem,
            full_placement=True,
            hint_schedule=incumbents[-1].schedule if incumbents else None,
            feasibility_only=True,
        )
    except ModelTooLarge:
        return _error("Probleminstansen overskrider modellgrensen.")
    if time.monotonic() < strict_deadline:
        status, solver, solve_ms = _solve_model(
            strict_model,
            deadline=strict_deadline,
            problem=problem,
            publish_incumbent=publish,
        )
        strict_phase = _evaluate_phase(
            name="strict_feasibility",
            status=status,
            solver=solver,
            built=strict_model,
            solve_ms=solve_ms,
            problem=problem,
        )
        phases.append(strict_phase)
        if strict_phase.schedule is not None:
            incumbents.append(strict_phase)
        if status == cp_model.MODEL_INVALID and not incumbents:
            result = _error("Solvermodellen er ugyldig.")
            if include_metrics:
                result["_solver_metrics"] = {
                    "solver_engine_version": SOLVER_ENGINE_VERSION,
                    "preprocess_ms": preprocess_ms,
                    "phases": [_phase_metrics(phase) for phase in phases],
                }
            return result

    strict_phase_with_incumbent = next(
        (
            phase
            for phase in phases
            if phase.name == "strict_feasibility" and phase.schedule is not None
        ),
        None,
    )
    strict_has_incumbent = strict_phase_with_incumbent is not None
    if strict_has_incumbent and time.monotonic() < deadline:
        # Same constraints, only the objective differs, so arm the model that
        # already exists rather than building a second copy of it - and carry
        # the strict solution over as the starting point.
        optimized_model = _arm_objective(strict_model)
        warm_start = _full_assignment(
            optimized_model, strict_phase_with_incumbent.solver
        )
        if time.monotonic() < deadline:
            status, solver, solve_ms = _solve_model(
                optimized_model,
                deadline=deadline,
                problem=problem,
                publish_incumbent=publish,
                warm_start=warm_start,
            )
            phase = _evaluate_phase(
                name="full_optimization",
                status=status,
                solver=solver,
                built=optimized_model,
                solve_ms=solve_ms,
                problem=problem,
            )
            phases.append(phase)
            if phase.schedule is not None:
                incumbents.append(phase)
    elif not strict_has_incumbent and time.monotonic() < deadline:
        try:
            partial_model = _build_model(problem, full_placement=False)
        except ModelTooLarge:
            return _error("Probleminstansen overskrider modellgrensen.")
        if time.monotonic() < deadline:
            status, solver, solve_ms = _solve_model(
                partial_model,
                deadline=deadline,
                problem=problem,
                publish_incumbent=publish_partial,
            )
            phase = _evaluate_phase(
                name="partial_optimization",
                status=status,
                solver=solver,
                built=partial_model,
                solve_ms=solve_ms,
                problem=problem,
            )
            phases.append(phase)
            if phase.schedule is not None:
                incumbents.append(phase)

    if not incumbents:
        invalid_results = [phase for phase in phases if phase.validation_issues]
        if invalid_results:
            result = _error("Solveren produserte et ugyldig resultat som ble avvist.")
        elif any(phase.status == cp_model.MODEL_INVALID for phase in phases):
            result = _error("Solvermodellen er ugyldig.")
        elif any(
            phase.name == "partial_optimization" and phase.status == cp_model.INFEASIBLE
            for phase in phases
        ):
            result = {
                "status": "INFEASIBLE",
                "schedule": [],
                "unplaceable": _unplaceable(problem, set()),
                "locked_conflicts": [],
            }
        else:
            # Every phase returned UNKNOWN — CP-SAT could not find any
            # feasible placement within the budget. This is distinct from
            # INFEASIBLE (the model is provably unsolvable) and from ERROR
            # (a solution was found but failed validation). The
            # `timeout_reason` lets the frontend suggest planning fewer
            # days at a time instead of blindly retrying the same scope.
            result = {
                "status": "TIMEOUT",
                "schedule": [],
                "unplaceable": [],
                "locked_conflicts": [],
                "timeout_reason": "no_incumbent",
            }
        if include_metrics:
            result["_solver_metrics"] = {
                "solver_engine_version": SOLVER_ENGINE_VERSION,
                "total_ms": int((time.monotonic() - started) * 1000),
                "preprocess_ms": preprocess_ms,
                "phases": [_phase_metrics(phase) for phase in phases],
                "placed_count": 0,
                "optimal": False,
            }
        return result

    best = min(
        incumbents,
        key=lambda phase: (
            phase.objective_key,
            phase.status != cp_model.OPTIMAL,
            phase.name != "full_optimization",
        ),
    )
    placed_ids = {str(row.get("candidate_id") or "") for row in best.schedule or []}
    unplaceable = _unplaceable(problem, placed_ids)
    optimal = bool(
        best.status == cp_model.OPTIMAL
        and best.name in {"full_optimization", "partial_optimization"}
    )
    result = {
        "status": "SUCCESS" if not unplaceable else "PARTIAL",
        "schedule": best.schedule,
        "unplaceable": unplaceable,
        "locked_conflicts": [],
        "optimal": optimal,
        "objective_vector": best.objective_vector.as_dict(),
    }
    if include_metrics:
        result["_solver_metrics"] = {
            "solver_engine_version": SOLVER_ENGINE_VERSION,
            "total_ms": int((time.monotonic() - started) * 1000),
            "preprocess_ms": preprocess_ms,
            "first_incumbent_ms": _first_incumbent_ms(phases, preprocess_ms),
            "phases": [_phase_metrics(phase) for phase in phases],
            "placed_count": len(placed_ids),
            "objective_vector": best.objective_vector.as_dict(),
            "optimal": optimal,
        }
    return result
