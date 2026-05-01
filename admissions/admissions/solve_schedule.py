from dataclasses import dataclass, field
from typing import List, Dict, Any
from ortools.sat.python import cp_model


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
    enforce_same_gender: bool = True
    allow_overtime: bool = True
    prioritize_continuity: bool = True
    overtime_weight: int = 100
    load_balance_weight: int = 1
    continuity_weight: int = 12
    max_solver_seconds: float = 10.0


def solve_schedule(
    candidates_data: List[dict],
    interviewers_data: List[dict],
    panel_size: int,
    options_data: Dict[str, Any] | None = None,
    locked_assignments_data: List[dict] | None = None,
) -> Dict[str, Any]:
    candidates = [Candidate(**c) for c in candidates_data]
    interviewers = [Interviewer(**i) for i in interviewers_data]
    options = SolveOptions(**(options_data or {}))
    locked_assignments_data = locked_assignments_data or []

    model = cp_model.CpModel()

    avail_set = {i.id: set(i.availability) for i in interviewers}
    bias_set = {i.id: set(i.biased) for i in interviewers}
    iview_map = {i.id: i for i in interviewers}
    candidate_map = {c.id: c for c in candidates}
    candidate_id_by_name = {c.name: c.id for c in candidates}
    interviewer_id_by_name = {i.name: i.id for i in interviewers}
    male_iids = frozenset(i.id for i in interviewers if i.gender == "M")
    female_iids = frozenset(i.id for i in interviewers if i.gender == "F")

    def locked_conflict(message: str, assignment: dict | None = None):
        return {
            "status": "LOCKED_CONFLICT",
            "schedule": [],
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

        if options.enforce_same_gender and candidate.gender in {"M", "F"}:
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

    all_available = set().union(*(i.availability for i in interviewers))
    all_available.update(locked_times)
    sorted_slots = (
        sorted(all_available)
        if all_available
        else [d + h for d in (0, 24, 48, 72, 96) for h in range(8, 17)]
    )

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

    # CONSTRAINTS

    # Each candidate gets exactly one interview
    for c in candidates:
        model.AddExactlyOne(schedule[(c.id, t)] for t in sorted_slots)
        locked = locked_by_candidate.get(c.id)
        if locked:
            for t in sorted_slots:
                model.Add(schedule[(c.id, t)] == (1 if t == locked["time"] else 0))

    # Each timeslot can at most have 1 interview
    for t in sorted_slots:
        model.AddAtMostOne(schedule[(c.id, t)] for c in candidates)

    for c in candidates:
        for t in sorted_slots:
            sv = schedule[(c.id, t)]
            v_ids = valid_for[(c.id, t)]
            if not v_ids:
                continue

            a_vars = [assign[(iid, c.id, t)] for iid in v_ids]

            model.Add(sum(a_vars) == panel_size).OnlyEnforceIf(sv)
            model.Add(sum(a_vars) == 0).OnlyEnforceIf(sv.Not())

            locked = locked_by_candidate.get(c.id)
            if locked and t == locked["time"]:
                for iid in v_ids:
                    model.Add(
                        assign[(iid, c.id, t)]
                        == (1 if iid in locked["panel_ids"] else 0)
                    )

            # Gender parameter
            if options.enforce_same_gender and c.gender in {"M", "F"}:
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

    # objective function
    max_load = model.NewIntVar(0, len(candidates), "max_load")
    loads = []
    for i in interviewers:
        my = iview_all_vars[i.id]
        load_var = model.NewIntVar(0, len(candidates), f"ld_{i.id}")
        model.Add(load_var == sum(my) if my else load_var == 0)
        loads.append(load_var)

    model.AddMaxEquality(max_load, loads)

    slot_rank = {t: r for r, t in enumerate(sorted_slots)}
    earliness_sum = sum(
        slot_rank[t] * schedule[(c.id, t)]
        for c in candidates
        for t in sorted_slots
        if slot_rank[t] > 0
    )

    continuity_cost = 0
    if options.prioritize_continuity and sorted_slots:
        latest_rank = model.NewIntVar(0, len(sorted_slots) - 1, "latest_slot_rank")
        for t in sorted_slots:
            used_slot = model.NewBoolVar(f"used_{t}")
            model.Add(used_slot == sum(schedule[(c.id, t)] for c in candidates))
            model.Add(latest_rank >= slot_rank[t] * used_slot)

        continuity_cost = options.continuity_weight * (
            len(candidates) * latest_rank + earliness_sum
        )

    model.Minimize(
        options.overtime_weight * sum(overtime_vars)
        + options.load_balance_weight * max_load
        + continuity_cost
    )

    # SOLVE
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = options.max_solver_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = []
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
                    break
        return {"status": "SUCCESS", "schedule": results}

    return {"status": "INFEASIBLE", "schedule": []}
