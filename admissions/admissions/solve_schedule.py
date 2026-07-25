from dataclasses import dataclass, field
from typing import Any, Dict, List

from ortools.sat.python import cp_model

from admissions.admissions import constants


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
    overtime_weight: int = 100
    load_balance_weight: int = 1
    continuity_weight: int = 12
    max_solver_seconds: float = constants.MAX_SOLVER_SECONDS


def solve_schedule(
    candidates_data: List[dict],
    interviewers_data: List[dict],
    panel_size: int,
    options_data: Dict[str, Any] | None = None,
    locked_assignments_data: List[dict] | None = None,
    all_slots_data: List[int] | None = None,
    blocks_data: List[List[int]] | None = None,
    previous_schedule_data: List[dict] | None = None,
) -> Dict[str, Any]:
    candidates = [Candidate(**c) for c in candidates_data]
    interviewers = [Interviewer(**i) for i in interviewers_data]
    options = SolveOptions(**(options_data or {}))
    locked_assignments_data = locked_assignments_data or []
    restrict_to_grid = all_slots_data is not None
    all_slots_data = all_slots_data or []
    blocks_data = blocks_data or []
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

    # Two locked interviews inside one block with different panels can never
    # satisfy the same-panel-per-block constraint; report the pair instead of
    # letting the solver return an opaque INFEASIBLE.
    if options.same_panel_per_block and len(locked_by_candidate) > 1:
        for block in blocks_data:
            block_set = set(block)
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

    # Fail fast when the model would be too large to even build: the solver's
    # time limit only covers the search, not variable creation, so an oversized
    # instance would OOM/hang the worker instead of timing out.
    model_var_bound = len(candidates) * len(sorted_slots) * (len(interviewers) + 1)
    block_constraint_bound = sum(len(set(block)) for block in blocks_data) * len(
        interviewers
    )
    if model_var_bound + block_constraint_bound > constants.MAX_SOLVER_MODEL_VARS:
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
    prev_panel_vars = []
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
        model.AddHint(schedule[(cid, t)], 1)
        for member in entry.get("panel", []):
            if (member.get("id"), cid, t) in assign:
                model.AddHint(assign[(member["id"], cid, t)], 1)
                prev_panel_vars.append(assign[(member["id"], cid, t)])

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

    # Same panel per block: every filled slot within a block is staffed by the
    # identical set of interviewers, so one panel sits the whole block of
    # back-to-back interviews. A slot left empty imposes no constraint.
    if options.same_panel_per_block and blocks_data:
        slot_set = set(sorted_slots)
        occupied_vars = {}

        def occupied_var(t):
            if t not in occupied_vars:
                ov = model.NewBoolVar(f"occ_{t}")
                model.Add(ov == sum(schedule[(c.id, t)] for c in candidates))
                occupied_vars[t] = ov
            return occupied_vars[t]

        for b_index, block in enumerate(blocks_data):
            block_slots = [t for t in block if t in slot_set]
            if len(block_slots) < 2:
                continue
            for i in interviewers:
                works = model.NewBoolVar(f"works_{b_index}_{i.id}")
                for t in block_slots:
                    busy = iview_time_vars.get((i.id, t), [])
                    model.Add(sum(busy) == works).OnlyEnforceIf(occupied_var(t))

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
    if options.prioritize_continuity:
        latest_rank = model.NewIntVar(0, len(sorted_slots) - 1, "latest_slot_rank")
        for t in sorted_slots:
            used_slot = model.NewBoolVar(f"used_{t}")
            model.Add(used_slot == sum(schedule[(c.id, t)] for c in candidates))
            model.Add(latest_rank >= slot_rank[t] * used_slot)

        continuity_cost = options.continuity_weight * (
            len(candidates) * latest_rank + earliness_sum
        )

    total_placed = sum(schedule[(c.id, t)] for c in candidates for t in sorted_slots)

    # Placement dominates every other objective: weight it above the maximum
    # possible value of the secondary terms so the solver never drops a
    # candidate to improve load balancing, continuity, earliness or overtime.
    max_rank = len(sorted_slots) - 1
    max_secondary = options.overtime_weight * len(overtime_vars)
    # max_load and load_spread are each at most len(candidates).
    max_secondary += 2 * options.load_balance_weight * len(candidates)
    # Unconditional earliness term has weight 1 and is at most rank * placed.
    max_secondary += len(candidates) * max_rank
    if options.prioritize_continuity:
        max_secondary += options.continuity_weight * 2 * len(candidates) * max_rank
    placement_weight = max_secondary + 1

    base_objective = (
        placement_weight * (len(candidates) - total_placed)
        + options.overtime_weight * sum(overtime_vars)
        + options.load_balance_weight * (max_load + load_spread)
        + earliness_sum
        + continuity_cost
    )

    # Lowest-priority tie-breaker: scaled below every real objective so it only
    # nudges otherwise-equal plans toward the previous one — same times and, at
    # a kept time, the same panel members — never trading off placement,
    # overtime, load or continuity to do it.
    stability_reward = [
        schedule[(cid, t)] for cid, t in prev_time_by_candidate.items()
    ] + prev_panel_vars
    if stability_reward:
        model.Minimize(
            base_objective * (len(stability_reward) + 1) - sum(stability_reward)
        )
    else:
        model.Minimize(base_objective)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = options.max_solver_seconds
    solver.parameters.num_search_workers = constants.SOLVER_NUM_WORKERS
    # Parallel portfolio search returns whichever tied optimum a worker reached
    # first, so the fixed seed alone does not make re-solves reproducible;
    # interleaved search keeps the workers but makes the search deterministic.
    solver.parameters.interleave_search = True
    solver.parameters.random_seed = constants.SOLVER_RANDOM_SEED
    status = solver.Solve(model)

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
