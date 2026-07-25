import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Sequence

from ortools.sat.python import cp_model

from admissions.admissions import constants

MINUTES_PER_DAY = 24 * 60
INT64_MAX = (1 << 63) - 1


@dataclass
class Candidate:
    id: str
    name: str
    gender: str | None = None


@dataclass
class Interviewer(Candidate):
    availability: List[int] = field(default_factory=list)
    biased: List[str] = field(default_factory=list)


@dataclass
class SolveOptions:
    enforce_same_gender: bool = False
    allow_overtime: bool = True
    prioritize_continuity: bool = True
    same_panel_per_block: bool = True
    avoid_consecutive_interviewer_blocks: bool = True
    initial_strategy: str = "balanced"
    repair_strategy: str = "balanced"
    repair_mode: bool = False
    overtime_weight: int = 40
    load_balance_weight: int = 4
    continuity_weight: int = 12
    max_solver_seconds: float = constants.MAX_SOLVER_SECONDS


@dataclass(frozen=True)
class CanonicalBlock:
    index: int
    day: int
    start_time: int
    canonical_slots: tuple[int, ...]
    usable_slots: tuple[int, ...]
    has_zero_usable_slots: bool


@dataclass(frozen=True)
class ObjectiveTier:
    name: str
    expression: Any
    maximum: int


def _canonicalize_blocks(
    blocks_data: Sequence[Sequence[int]] | None,
    block_metadata_data: Sequence[dict] | None,
    sorted_slots: Sequence[int],
) -> list[CanonicalBlock]:
    slot_set = set(sorted_slots)
    canonical_blocks = []
    if block_metadata_data:
        for index, block in enumerate(block_metadata_data):
            canonical_slots = tuple(int(t) for t in block.get("canonical_slots", []))
            if not canonical_slots and index < len(blocks_data or []):
                canonical_slots = tuple(int(t) for t in (blocks_data or [])[index])
            usable_slots = tuple(
                int(t) for t in block.get("usable_slots", []) if int(t) in slot_set
            )
            if not usable_slots and canonical_slots:
                usable_slots = tuple(t for t in canonical_slots if t in slot_set)
            day = block.get("day")
            if day is None:
                day = canonical_slots[0] // MINUTES_PER_DAY if canonical_slots else 0
            start_time = block.get("start_time")
            if start_time is None:
                start_time = canonical_slots[0] if canonical_slots else 0
            canonical_blocks.append(
                CanonicalBlock(
                    index=int(block.get("index", index)),
                    day=int(day),
                    start_time=int(start_time),
                    canonical_slots=canonical_slots,
                    usable_slots=usable_slots,
                    has_zero_usable_slots=bool(
                        block.get("has_zero_usable_slots", not usable_slots)
                    ),
                )
            )
    else:
        for index, block in enumerate(blocks_data or []):
            canonical_slots = tuple(int(t) for t in block)
            usable_slots = tuple(t for t in canonical_slots if t in slot_set)
            canonical_blocks.append(
                CanonicalBlock(
                    index=index,
                    day=canonical_slots[0] // MINUTES_PER_DAY if canonical_slots else 0,
                    start_time=canonical_slots[0] if canonical_slots else 0,
                    canonical_slots=canonical_slots,
                    usable_slots=usable_slots,
                    has_zero_usable_slots=not usable_slots,
                )
            )
    canonical_blocks.sort(key=lambda block: (block.day, block.start_time, block.index))
    return canonical_blocks


def _build_lexicographic_objective(tiers: Sequence[ObjectiveTier]):
    """
    Scale each tier so improving one unit in a higher tier dominates the full
    possible range of every lower-priority tier.

    The tiers are ordered from highest priority to lowest priority. Each tier
    must be a nonnegative bounded integer expression with a proven maximum.
    """

    if not tiers:
        return 0

    weights = [0] * len(tiers)
    suffix_max = 0
    for index in range(len(tiers) - 1, -1, -1):
        tier = tiers[index]
        if tier.maximum < 0:
            raise ValueError(f"Objective tier {tier.name} has a negative maximum.")
        weight = suffix_max + 1
        contribution_max = weight * tier.maximum
        if weight > INT64_MAX or contribution_max > INT64_MAX:
            raise OverflowError(
                f"Objective tier {tier.name} cannot be safely scaled into 64 bits."
            )
        suffix_max += contribution_max
        if suffix_max > INT64_MAX:
            raise OverflowError(
                "The combined objective bound exceeds CP-SAT's 64-bit range."
            )
        weights[index] = weight

    return sum(weight * tier.expression for weight, tier in zip(weights, tiers))


def solve_schedule(
    candidates_data: List[dict],
    interviewers_data: List[dict],
    panel_size: int,
    options_data: Dict[str, Any] | None = None,
    locked_assignments_data: List[dict] | None = None,
    all_slots_data: List[int] | None = None,
    blocks_data: List[List[int]] | None = None,
    block_metadata_data: List[dict] | None = None,
    previous_schedule_data: List[dict] | None = None,
) -> Dict[str, Any]:
    candidates = [Candidate(**c) for c in candidates_data]
    interviewers = [Interviewer(**i) for i in interviewers_data]
    options = SolveOptions(**(options_data or {}))
    initial_strategy_weights = {
        "minimize_overtime": (100, 1),
        "balanced": (40, 4),
        "balance_workload": (12, 8),
    }
    if (
        "initial_strategy" in (options_data or {})
        and options.initial_strategy in initial_strategy_weights
    ):
        options.overtime_weight, options.load_balance_weight = initial_strategy_weights[
            options.initial_strategy
        ]
    locked_assignments_data = locked_assignments_data or []
    restrict_to_grid = all_slots_data is not None
    all_slots_data = all_slots_data or []
    blocks_data = blocks_data or []
    block_metadata_data = block_metadata_data or []
    previous_schedule_data = previous_schedule_data or []

    model = cp_model.CpModel()

    avail_set = {i.id: set(i.availability) for i in interviewers}
    bias_set = {i.id: set(i.biased) for i in interviewers}
    iview_map = {i.id: i for i in interviewers}
    candidate_map = {c.id: c for c in candidates}
    candidate_id_by_name = {c.name: c.id for c in candidates}
    interviewer_id_by_name = {i.name: i.id for i in interviewers}
    male_iids = frozenset(i.id for i in interviewers if i.gender == "M")
    female_iids = frozenset(i.id for i in interviewers if i.gender == "F")
    # Whether any interviewer has usable gender data. Without it the same-gender
    # constraint is meaningless and must be skipped entirely — otherwise it
    # would force every M/F candidate's slots to 0 and make them all unplaceable.
    gender_data_available = bool(male_iids or female_iids)
    all_slots_set = set(all_slots_data)
    if restrict_to_grid:
        avail_set = {iid: slots & all_slots_set for iid, slots in avail_set.items()}

    def locked_conflict(message: str, assignment: dict | None = None):
        return {
            "status": "LOCKED_CONFLICT",
            "schedule": [],
            "unplaceable": [],
            "locked_conflicts": [
                {
                    "message": message,
                    "assignment": assignment,
                }
            ],
        }

    locked_by_candidate = {}
    locked_times = set()
    for assignment in locked_assignments_data:
        candidate_id = assignment.get("candidate_id") or candidate_id_by_name.get(
            assignment.get("candidate")
        )
        if candidate_id not in candidate_map:
            return locked_conflict("Locked candidate was not found.", assignment)
        if candidate_id in locked_by_candidate:
            return locked_conflict(
                "Candidate has multiple locked interviews.", assignment
            )

        locked_time = int(assignment["time"])
        if locked_time < 0 or (restrict_to_grid and locked_time not in all_slots_set):
            return locked_conflict(
                f"Locked time {locked_time} for "
                f"{candidate_map[candidate_id].name} is not an open slot.",
                assignment,
            )
        panel_ids = []
        for member in assignment.get("panel", []):
            interviewer_id = member.get("id") or interviewer_id_by_name.get(
                member.get("name")
            )
            if interviewer_id not in iview_map:
                return locked_conflict("Locked panel member was not found.", assignment)
            panel_ids.append(interviewer_id)

        if len(panel_ids) != panel_size or len(set(panel_ids)) != len(panel_ids):
            return locked_conflict(
                "Locked panel does not match panel size.", assignment
            )
        if locked_time in locked_times:
            return locked_conflict(
                "Multiple locked interviews share one time.", assignment
            )

        candidate = candidate_map[candidate_id]
        for interviewer_id in panel_ids:
            if candidate_id in bias_set[interviewer_id]:
                return locked_conflict(
                    "Locked interview has interest conflict.", assignment
                )
            if (
                not options.allow_overtime
                and locked_time not in avail_set[interviewer_id]
            ):
                return locked_conflict(
                    "Locked interview requires overtime while overtime is disabled.",
                    assignment,
                )

        # Gated on gender_data_available like the model constraint below, so a
        # lock produced by a solve without gender data is never rejected here.
        if (
            options.enforce_same_gender
            and gender_data_available
            and candidate.gender in {"M", "F"}
        ):
            same_gender_ids = male_iids if candidate.gender == "M" else female_iids
            if not any(
                interviewer_id in same_gender_ids for interviewer_id in panel_ids
            ):
                return locked_conflict(
                    "Locked panel violates the gender constraint.", assignment
                )

        locked_by_candidate[candidate_id] = {
            "time": locked_time,
            "panel_ids": set(panel_ids),
        }
        locked_times.add(locked_time)

    all_available = set().union(*(avail_set[i.id] for i in interviewers))
    all_available.update(locked_times)
    if options.allow_overtime and restrict_to_grid:
        all_available.update(all_slots_data)

    sorted_slots = sorted(all_available)
    if not sorted_slots:
        return {
            "status": "INFEASIBLE",
            "schedule": [],
            "unplaceable": [
                {
                    "candidate_id": c.id,
                    "candidate": c.name,
                    "reason": "Ingen aktive tidsluker er åpnet.",
                }
                for c in candidates
            ],
            "locked_conflicts": [],
        }

    canonical_blocks = _canonicalize_blocks(
        blocks_data=blocks_data,
        block_metadata_data=block_metadata_data,
        sorted_slots=sorted_slots,
    )

    # Two locked interviews inside one block with different panels can never
    # satisfy the same-panel-per-block constraint; report the pair instead of
    # letting the solver return an opaque INFEASIBLE.
    if (
        options.same_panel_per_block
        and not options.repair_mode
        and len(locked_by_candidate) > 1
    ):
        for block in canonical_blocks:
            block_set = set(block.usable_slots)
            in_block = [
                (cid, info)
                for cid, info in locked_by_candidate.items()
                if info["time"] in block_set
            ]
            for cid, info in in_block[1:]:
                if info["panel_ids"] != in_block[0][1]["panel_ids"]:
                    return locked_conflict(
                        f"Locked interviews for {candidate_map[in_block[0][0]].name} "
                        f"and {candidate_map[cid].name} are in the same block "
                        "with different panels."
                    )

    # Fail fast when the model would be too large to even build: the solver's
    # time limit only covers the search, not variable creation, so an oversized
    # instance would OOM/hang the worker instead of timing out.
    model_var_bound = len(candidates) * len(sorted_slots) * (len(interviewers) + 1)
    block_constraint_bound = sum(
        len(block.usable_slots) for block in canonical_blocks
    ) * len(interviewers)
    continuity_var_bound = len(sorted_slots) if options.prioritize_continuity else 0
    consecutive_block_var_bound = (
        2 * len(interviewers) * len(canonical_blocks)
        if options.avoid_consecutive_interviewer_blocks and canonical_blocks
        else 0
    )
    if (
        model_var_bound
        + block_constraint_bound
        + continuity_var_bound
        + consecutive_block_var_bound
        > constants.MAX_SOLVER_MODEL_VARS
    ):
        return {
            "status": "ERROR",
            "schedule": [],
            "unplaceable": [],
            "locked_conflicts": [],
            "error": (
                "Probleminstansen er for stor til å løses: "
                f"{len(candidates)} kandidater × {len(sorted_slots)} tidsluker × "
                f"{len(interviewers)} intervjuere. Åpne færre tidsluker."
            ),
        }

    schedule = {}
    assign = {}

    valid_for = {}
    iview_time_vars = {}
    iview_all_vars = {i.id: [] for i in interviewers}
    overtime_vars = []

    for c in candidates:
        for t in sorted_slots:
            schedule[(c.id, t)] = model.NewBoolVar(f"s_{c.id}_{t}")

            v_ids = []
            for i in interviewers:
                if c.id in bias_set[i.id]:
                    continue
                if not options.allow_overtime and t not in avail_set[i.id]:
                    continue

                var = model.NewBoolVar(f"a_{i.id}_{c.id}_{t}")
                key = (i.id, c.id, t)
                assign[key] = var
                v_ids.append(i.id)

                iview_time_vars.setdefault((i.id, t), []).append(var)

                iview_all_vars[i.id].append(var)

                if t not in avail_set[i.id]:
                    overtime_vars.append(var)

            valid_for[(c.id, t)] = v_ids

    # Warm-start: hint the previous published plan so re-solves converge faster
    # and stay close to what the committee already saw. Hints are advisory — the
    # solver repairs or ignores any that no longer fit.
    prev_time_by_candidate = {}
    prev_time_vars = []
    prev_panel_vars = []
    prev_unchanged_row_vars = []
    previous_panel_member_count = 0
    slot_set_for_hint = set(sorted_slots)
    for entry in previous_schedule_data:
        cid = entry.get("candidate_id") or candidate_id_by_name.get(
            entry.get("candidate")
        )
        if cid not in candidate_map:
            continue
        t = entry.get("time")
        if not isinstance(t, int) or t not in slot_set_for_hint:
            continue
        prev_time_by_candidate[cid] = t
        previous_time_var = schedule[(cid, t)]
        prev_time_vars.append(previous_time_var)
        model.AddHint(previous_time_var, 1)
        row_panel_vars = []
        for member in entry.get("panel", []):
            previous_panel_member_count += 1
            if (member.get("id"), cid, t) in assign:
                previous_panel_var = assign[(member["id"], cid, t)]
                model.AddHint(previous_panel_var, 1)
                prev_panel_vars.append(previous_panel_var)
                row_panel_vars.append(previous_panel_var)

        if len(row_panel_vars) == panel_size:
            unchanged_row = model.NewBoolVar(f"unchanged_{cid}")
            retained_parts = [previous_time_var, *row_panel_vars]
            for part in retained_parts:
                model.Add(unchanged_row <= part)
            model.Add(unchanged_row >= sum(retained_parts) - panel_size)
            prev_unchanged_row_vars.append(unchanged_row)

    def unplaceable_entry(c):
        unbiased = [i for i in interviewers if c.id not in bias_set[i.id]]
        if len(unbiased) < panel_size:
            if len(unbiased) < len(interviewers):
                reason = "For mange i komiteen har meldt inhabilitet."
            else:
                reason = "Ikke nok intervjukapasitet i de åpne tidslukene."
            return {"candidate_id": c.id, "candidate": c.name, "reason": reason}

        staffable = [t for t in sorted_slots if len(valid_for[(c.id, t)]) >= panel_size]
        if not staffable:
            reason = "Ingen ledige tidsluker igjen."
        elif (
            options.enforce_same_gender
            and gender_data_available
            and c.gender in {"M", "F"}
            and not any(
                iid in (male_iids if c.gender == "M" else female_iids)
                for t in staffable
                for iid in valid_for[(c.id, t)]
            )
        ):
            reason = "Ingen tilgjengelige intervjuere med samme kjønn."
        else:
            reason = "Ikke nok intervjukapasitet i de åpne tidslukene."
        return {"candidate_id": c.id, "candidate": c.name, "reason": reason}

    # Each candidate gets at most one interview. Placement is maximized in the
    # objective instead of forced here, so an over-constrained run yields a
    # partial schedule plus a list of unplaceable candidates rather than no
    # schedule at all. Locked candidates are still pinned to exactly one slot.
    for c in candidates:
        model.AddAtMostOne(schedule[(c.id, t)] for t in sorted_slots)
        locked = locked_by_candidate.get(c.id)
        if locked:
            for t in sorted_slots:
                model.Add(schedule[(c.id, t)] == (1 if t == locked["time"] else 0))

    for t in sorted_slots:
        model.AddAtMostOne(schedule[(c.id, t)] for c in candidates)

    for c in candidates:
        for t in sorted_slots:
            sv = schedule[(c.id, t)]
            v_ids = valid_for[(c.id, t)]
            a_vars = [assign[(iid, c.id, t)] for iid in v_ids]

            # Too few valid interviewers to staff a full panel: pin the slot
            # closed, otherwise the soft placement objective would mark the
            # candidate as placed with an empty or undersized panel.
            if len(v_ids) < panel_size:
                model.Add(sv == 0)
                if a_vars:
                    model.Add(sum(a_vars) == 0)
                continue

            model.Add(sum(a_vars) == panel_size).OnlyEnforceIf(sv)
            model.Add(sum(a_vars) == 0).OnlyEnforceIf(sv.Not())

            locked = locked_by_candidate.get(c.id)
            if locked and t == locked["time"]:
                for iid in v_ids:
                    model.Add(
                        assign[(iid, c.id, t)]
                        == (1 if iid in locked["panel_ids"] else 0)
                    )

            if (
                options.enforce_same_gender
                and gender_data_available
                and c.gender in {"M", "F"}
            ):
                if c.gender == "M":
                    same_gender_vars = [
                        assign[(iid, c.id, t)] for iid in v_ids if iid in male_iids
                    ]
                else:
                    same_gender_vars = [
                        assign[(iid, c.id, t)] for iid in v_ids if iid in female_iids
                    ]

                if same_gender_vars:
                    model.Add(sum(same_gender_vars) >= 1).OnlyEnforceIf(sv)
                else:
                    model.Add(sv == 0)

    for var_list in iview_time_vars.values():
        if len(var_list) > 1:
            model.AddAtMostOne(var_list)

    occupied_vars = {}

    def occupied_var(t):
        if t not in occupied_vars:
            ov = model.NewBoolVar(f"occ_{t}")
            model.Add(ov == sum(schedule[(c.id, t)] for c in candidates))
            occupied_vars[t] = ov
        return occupied_vars[t]

    blocks_by_day = []
    current_day = None
    current_day_blocks = []
    for block in canonical_blocks:
        if current_day is None or block.day != current_day:
            if current_day_blocks:
                blocks_by_day.append(current_day_blocks)
            current_day = block.day
            current_day_blocks = []
        current_day_blocks.append(block)
    if current_day_blocks:
        blocks_by_day.append(current_day_blocks)

    # Same panel per block: every filled slot within a canonical block is
    # staffed by the identical set of interviewers, so one panel sits the whole
    # block of back-to-back interviews. A slot left empty imposes no constraint.
    if options.same_panel_per_block and not options.repair_mode and canonical_blocks:
        for block in canonical_blocks:
            block_slots = list(block.usable_slots)
            if len(block_slots) < 2:
                continue
            for interviewer in interviewers:
                works = model.NewBoolVar(f"works_{block.index}_{interviewer.id}")
                for t in block_slots:
                    busy = iview_time_vars.get((interviewer.id, t), [])
                    model.Add(sum(busy) == works).OnlyEnforceIf(occupied_var(t))

    consecutive_block_violation_vars = []
    if options.avoid_consecutive_interviewer_blocks and canonical_blocks:
        block_occupancy_vars = {}
        for interviewer in interviewers:
            for day_blocks in blocks_by_day:
                for block in day_blocks:
                    block_assignments = [
                        var
                        for t in block.usable_slots
                        for var in iview_time_vars.get((interviewer.id, t), [])
                    ]
                    works_block = model.NewBoolVar(
                        f"works_block_{interviewer.id}_{block.index}"
                    )
                    if block_assignments:
                        model.AddMaxEquality(works_block, block_assignments)
                    else:
                        model.Add(works_block == 0)
                    block_occupancy_vars[(interviewer.id, block.index)] = works_block

                for left, right in zip(day_blocks, day_blocks[1:]):
                    consecutive_block = model.NewBoolVar(
                        f"consecutive_block_{interviewer.id}_{left.index}_{right.index}"
                    )
                    left_work = block_occupancy_vars[(interviewer.id, left.index)]
                    right_work = block_occupancy_vars[(interviewer.id, right.index)]
                    model.Add(consecutive_block >= left_work + right_work - 1)
                    model.Add(consecutive_block <= left_work)
                    model.Add(consecutive_block <= right_work)
                    consecutive_block_violation_vars.append(consecutive_block)

    # Repairs may use a one-interview substitute. Count panel membership
    # transitions inside occupied neighbouring slots so each strategy can
    # decide whether that small exception is better than replacing a whole
    # block member. This is a preference only; conflicts and capacity remain
    # hard constraints.
    panel_break_vars = []
    if options.repair_mode and canonical_blocks:
        for block in canonical_blocks:
            for position, (left, right) in enumerate(
                zip(block.usable_slots, block.usable_slots[1:])
            ):
                both_occupied = model.NewBoolVar(
                    f"both_occupied_{block.index}_{position}"
                )
                left_occupied = occupied_var(left)
                right_occupied = occupied_var(right)
                model.Add(both_occupied <= left_occupied)
                model.Add(both_occupied <= right_occupied)
                model.Add(both_occupied >= left_occupied + right_occupied - 1)
                for interviewer in interviewers:
                    left_busy = sum(iview_time_vars.get((interviewer.id, left), []))
                    right_busy = sum(iview_time_vars.get((interviewer.id, right), []))
                    panel_break = model.NewBoolVar(
                        f"panel_break_{block.index}_{position}_{interviewer.id}"
                    )
                    model.Add(panel_break <= both_occupied)
                    model.Add(panel_break >= left_busy - right_busy + both_occupied - 1)
                    model.Add(panel_break >= right_busy - left_busy + both_occupied - 1)
                    model.Add(panel_break <= left_busy + right_busy)
                    model.Add(panel_break <= 2 - left_busy - right_busy)
                    panel_break_vars.append(panel_break)

    max_load = model.NewIntVar(0, len(candidates), "max_load")
    loads = []
    available_loads = []
    for i in interviewers:
        my = iview_all_vars[i.id]
        load_var = model.NewIntVar(0, len(candidates), f"ld_{i.id}")
        model.Add(load_var == sum(my) if my else load_var == 0)
        loads.append(load_var)
        # Only count interviewers who can actually take a candidate; a fully
        # biased one has load pinned to 0 and would skew the load-spread min.
        if my:
            available_loads.append(load_var)

    if loads:
        model.AddMaxEquality(max_load, loads)
    else:
        model.Add(max_load == 0)

    # Spread the work between interviewers that opened any availability; the
    # max-load term alone is indifferent to how evenly work sits below the max.
    load_spread = 0
    if len(available_loads) > 1:
        max_available_load = model.NewIntVar(0, len(candidates), "max_avail_load")
        min_available_load = model.NewIntVar(0, len(candidates), "min_avail_load")
        model.AddMaxEquality(max_available_load, available_loads)
        model.AddMinEquality(min_available_load, available_loads)
        load_spread = max_available_load - min_available_load

    slot_rank = {t: r for r, t in enumerate(sorted_slots)}
    earliness_sum = sum(
        slot_rank[t] * schedule[(c.id, t)]
        for c in candidates
        for t in sorted_slots
        if slot_rank[t] > 0
    )

    continuity_cost = 0
    continuity_run_count = 0
    max_continuity_cost = 0
    if options.prioritize_continuity:
        latest_rank = model.NewIntVar(0, len(sorted_slots) - 1, "latest_slot_rank")
        for t in sorted_slots:
            used_slot = occupied_var(t)
            model.Add(latest_rank >= slot_rank[t] * used_slot)

        # Minimise separate occupied runs inside the canonical interview
        # blocks. The backend preserves empty blocks in their canonical order,
        # so a closed block still counts as explicit rest instead of vanishing
        # during solver setup.
        continuity_sequences = [list(block.usable_slots) for block in canonical_blocks]
        continuity_sequences = [
            sequence for sequence in continuity_sequences if sequence
        ]
        covered_slots = {t for sequence in continuity_sequences for t in sequence}
        if not continuity_sequences:
            continuity_sequences = [sorted_slots]
            covered_slots.update(sorted_slots)
        else:
            continuity_sequences.extend(
                [[t] for t in sorted_slots if t not in covered_slots]
            )

        run_starts = []
        for sequence_index, sequence in enumerate(continuity_sequences):
            previous_occupied = None
            for position, t in enumerate(sequence):
                current_occupied = occupied_var(t)
                if previous_occupied is None:
                    run_starts.append(current_occupied)
                else:
                    run_start = model.NewBoolVar(
                        f"run_start_{sequence_index}_{position}"
                    )
                    model.Add(run_start >= current_occupied - previous_occupied)
                    model.Add(run_start <= current_occupied)
                    model.Add(run_start <= 1 - previous_occupied)
                    run_starts.append(run_start)
                previous_occupied = current_occupied
        continuity_run_count = sum(run_starts)
        continuity_cost = options.continuity_weight * (
            len(candidates) * latest_rank + len(candidates) * continuity_run_count
        )
        max_continuity_cost = options.continuity_weight * (
            len(candidates) * max(0, len(sorted_slots) - 1)
            + len(candidates) * len(sorted_slots)
        )

    changed_rows = len(prev_time_by_candidate) - sum(prev_unchanged_row_vars)
    changed_times = len(prev_time_by_candidate) - sum(prev_time_vars)
    changed_panel_members = previous_panel_member_count - sum(prev_panel_vars)

    repair_cost = 0
    max_repair_cost = 0
    if options.repair_mode and prev_time_by_candidate:
        repair_profiles = {
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
                "panel_break": 30_000,
            },
            "balanced": {
                "time": 100_000,
                "row": 20_000,
                "member": 2_000,
                "panel_break": 3_000,
            },
        }
        profile = repair_profiles.get(
            options.repair_strategy, repair_profiles["balanced"]
        )
        repair_cost = (
            profile["time"] * changed_times
            + profile["row"] * changed_rows
            + profile["member"] * changed_panel_members
            + profile["panel_break"] * sum(panel_break_vars)
        )
        max_repair_cost = (
            profile["time"] * len(prev_time_by_candidate)
            + profile["row"] * len(prev_time_by_candidate)
            + profile["member"] * previous_panel_member_count
            + profile["panel_break"] * len(panel_break_vars)
        )

    total_placed = sum(schedule[(c.id, t)] for c in candidates for t in sorted_slots)
    consecutive_block_penalty = sum(consecutive_block_violation_vars)
    max_consecutive_block_penalties = len(consecutive_block_violation_vars)
    max_earliness = len(candidates) * max(0, len(sorted_slots) - 1)
    max_load_objective = 2 * options.load_balance_weight * len(candidates)
    max_structure_objective = max_load_objective + max_continuity_cost
    max_stability_tie_cost = (previous_panel_member_count + 1) * len(
        prev_time_by_candidate
    ) + previous_panel_member_count

    if options.repair_mode and prev_time_by_candidate:
        objective_tiers = [
            ObjectiveTier(
                "unplaced_candidates",
                len(candidates) - total_placed,
                len(candidates),
            ),
            ObjectiveTier("repair_cost", repair_cost, max_repair_cost),
            ObjectiveTier("availability", sum(overtime_vars), len(overtime_vars)),
            ObjectiveTier(
                "adjacent_block_rest",
                consecutive_block_penalty,
                max_consecutive_block_penalties,
            ),
            ObjectiveTier(
                "load_and_continuity",
                options.load_balance_weight * (max_load + load_spread)
                + continuity_cost,
                max_structure_objective,
            ),
            ObjectiveTier("earliness", earliness_sum, max_earliness),
        ]
    else:
        # Initial planning optimizes the selected planning strategy freely.
        # The old plan is only a final tie-breaker, preventing arbitrary churn
        # between otherwise equally good solutions without weakening the
        # initial overtime/load/continuity priorities.
        stability_tie_cost = (
            previous_panel_member_count + 1
        ) * changed_times + changed_panel_members
        objective_tiers = [
            ObjectiveTier(
                "unplaced_candidates",
                len(candidates) - total_placed,
                len(candidates),
            ),
            ObjectiveTier("availability", sum(overtime_vars), len(overtime_vars)),
            ObjectiveTier(
                "adjacent_block_rest",
                consecutive_block_penalty,
                max_consecutive_block_penalties,
            ),
            ObjectiveTier(
                "load_and_continuity",
                options.load_balance_weight * (max_load + load_spread)
                + continuity_cost,
                max_structure_objective,
            ),
            ObjectiveTier("earliness", earliness_sum, max_earliness),
            ObjectiveTier(
                "stability_tie_breaker",
                stability_tie_cost,
                max_stability_tie_cost,
            ),
        ]

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = options.max_solver_seconds
    solver.parameters.num_search_workers = constants.SOLVER_NUM_WORKERS
    # Parallel portfolio search returns whichever tied optimum a worker reached
    # first, so the fixed seed alone does not make re-solves reproducible;
    # interleaved search keeps the workers but makes the search deterministic.
    solver.parameters.interleave_search = True
    solver.parameters.random_seed = constants.SOLVER_RANDOM_SEED

    try:
        model.Minimize(_build_lexicographic_objective(objective_tiers))
        status = solver.Solve(model)
    except OverflowError:
        status = cp_model.UNKNOWN
        deadline = time.monotonic() + options.max_solver_seconds
        for index, tier in enumerate(objective_tiers):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            model.Minimize(tier.expression)
            solver.parameters.max_time_in_seconds = remaining
            status = solver.Solve(model)
            if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                break
            if status != cp_model.OPTIMAL:
                break
            if index < len(objective_tiers) - 1:
                model.Add(tier.expression == int(round(solver.ObjectiveValue())))

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = []
        placed_ids = set()
        for c in candidates:
            for t in sorted_slots:
                if solver.BooleanValue(schedule[(c.id, t)]):
                    panel = [
                        {
                            "id": iid,
                            "name": iview_map[iid].name,
                            "is_overtime": t not in avail_set[iid],
                        }
                        for iid in valid_for[(c.id, t)]
                        if solver.BooleanValue(assign[(iid, c.id, t)])
                    ]
                    results.append(
                        {
                            "candidate_id": c.id,
                            "candidate": c.name,
                            "time": t,
                            "panel": panel,
                            "locked": c.id in locked_by_candidate,
                        }
                    )
                    placed_ids.add(c.id)
                    break
        unplaceable = [
            unplaceable_entry(c) for c in candidates if c.id not in placed_ids
        ]
        return {
            "status": "SUCCESS" if not unplaceable else "PARTIAL",
            "schedule": results,
            "unplaceable": unplaceable,
            "locked_conflicts": [],
            "optimal": status == cp_model.OPTIMAL,
        }

    if status == cp_model.INFEASIBLE:
        return {
            "status": "INFEASIBLE",
            "schedule": [],
            "unplaceable": [unplaceable_entry(c) for c in candidates],
            "locked_conflicts": [],
        }

    if status == cp_model.MODEL_INVALID:
        return {
            "status": "ERROR",
            "schedule": [],
            "unplaceable": [],
            "locked_conflicts": [],
        }

    return {
        "status": "TIMEOUT",
        "schedule": [],
        "unplaceable": [],
        "locked_conflicts": [],
    }
