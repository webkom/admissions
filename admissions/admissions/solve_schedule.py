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
    overtime_weight: int = 100
    load_balance_weight: int = 1
    max_solver_seconds: float = 10.0


def solve_schedule(
        candidates_data: List[dict],
        interviewers_data: List[dict],
        panel_size: int,
        options_data: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    candidates = [Candidate(**c) for c in candidates_data]
    interviewers = [Interviewer(**i) for i in interviewers_data]
    options = SolveOptions(**(options_data or {}))

    model = cp_model.CpModel()

    avail_set   = {i.id: set(i.availability) for i in interviewers}
    bias_set    = {i.id: set(i.biased) for i in interviewers}
    iview_map   = {i.id: i for i in interviewers}
    male_iids   = frozenset(i.id for i in interviewers if i.gender == 'M')
    female_iids = frozenset(i.id for i in interviewers if i.gender == 'F')

    all_available = set().union(*(i.availability for i in interviewers))
    sorted_slots = sorted(all_available) if all_available else [
        d + h for d in (0, 24, 48, 72, 96) for h in range(8, 17)
    ]

    schedule = {}
    assign   = {}

    valid_for        = {}
    iview_time_vars  = {}
    iview_all_vars   = {i.id: [] for i in interviewers}
    overtime_vars    = []

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


    # Each timeslot can at most have 1 interview
    for t in sorted_slots:
        model.AddAtMostOne(schedule[(c.id, t)] for c in candidates)

    for c in candidates:
        for t in sorted_slots:
            sv    = schedule[(c.id, t)]
            v_ids = valid_for[(c.id, t)]
            if not v_ids:
                continue

            a_vars = [assign[(iid, c.id, t)] for iid in v_ids]

            model.Add(sum(a_vars) == panel_size).OnlyEnforceIf(sv)
            model.Add(sum(a_vars) == 0).OnlyEnforceIf(sv.Not())

            # Gender parameter
            if options.enforce_same_gender and c.gender in {'M', 'F'}:
                if c.gender == 'M':
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
    model.Minimize(
        options.overtime_weight * sum(overtime_vars)
        + options.load_balance_weight * max_load
    )

    # ── SOLVE ─────────────────────────────────────────────────────────
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
                        {"name": iview_map[iid].name,
                         "is_overtime": t not in avail_set[iid]}
                        for iid in valid_for[(c.id, t)]
                        if solver.BooleanValue(assign[(iid, c.id, t)])
                    ]
                    results.append({"candidate": c.name, "time": t, "panel": panel})
                    break          # ← slot found; skip remaining times
        return {"status": "SUCCESS", "schedule": results}

    return {"status": "INFEASIBLE", "schedule": []}
