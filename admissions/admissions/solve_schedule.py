from dataclasses import dataclass, field
from typing import List, Dict, Any
from ortools.sat.python import cp_model


@dataclass
class Candidate:
    id: str
    name: str
    gender: str

@dataclass
class Interviewer(Candidate):
    availability: List[int] = field(default_factory=list)
    biased: List[str] = field(default_factory=list) # List of which candidates that the interviewer is biased against

def solve_schedule(
        candidates_data: List[dict],
        interviewers_data: List[dict],
        panel_size: int,
) -> Dict[str, Any]:
    candidates = [Candidate(**c) for c in candidates_data]
    interviewers = [Interviewer(**i) for i in interviewers_data]

    model = cp_model.CpModel()
    schedule = {}
    assign = {}

    # 1. DEFINE THE TIME UNIVERSE
    all_possible_slots = set()
    for i in interviewers:
        all_possible_slots.update(i.availability)

    if not all_possible_slots:
        for day_start in [0, 24, 48, 72, 96]:
            for hour in range(9, 17):
                all_possible_slots.add(day_start + hour)

    sorted_slots = sorted(list(all_possible_slots))

    # Pre-calculate lists of interviewer IDs by gender for easy lookup
    male_interviewers = [i.id for i in interviewers if i.gender == 'M']
    female_interviewers = [i.id for i in interviewers if i.gender == 'F']

    # --- 2. CREATE VARIABLES ---
    for candidate in candidates:
        for t in sorted_slots:
            # Main Schedule Variable
            schedule[(candidate.id, t)] = model.NewBoolVar(f"sched_{candidate.id}_{t}")

            for interviewer in interviewers:
                if candidate.id not in interviewer.biased:
                    assign[(interviewer.id, candidate.id, t)] = model.NewBoolVar(f"assign_{interviewer.id}_{candidate.id}_{t}")

                    # Soft Constraint: Overtime penalty
                    if t not in interviewer.availability:
                        model.AddImplication(assign[(interviewer.id, candidate.id, t)], True)

    # --- 3. HARD CONSTRAINTS ---

    # A. Each candidate = exactly 1 interview
    for candidate in candidates:
        model.Add(sum(schedule[(candidate.id, t)] for t in sorted_slots) == 1)

    # B. Panel Size & Linkage
    for candidate in candidates:
        for t in sorted_slots:
            valid_ids = [i.id for i in interviewers if (i.id, candidate.id, t) in assign]

            model.Add(sum(assign[(i_id, candidate.id, t)] for i_id in valid_ids) ==
                      schedule[(candidate.id, t)] * panel_size)

            # --- C. GENDER CONSTRAINT (UPDATED) ---
            # Logic: If Candidate is Male -> Require >= 1 Male interviewer.
            #        If Candidate is Female -> Require >= 1 Female interviewer.

            # Gather relevant assignment variables for this candidate/time
            male_vars = [assign[(mid, candidate.id, t)] for mid in male_interviewers if (mid, candidate.id, t) in assign]
            female_vars = [assign[(fid, candidate.id, t)] for fid in female_interviewers if (fid, candidate.id, t) in assign]

            # We use standard Python IF statements to decide which rule to enforce
            if candidate.gender == 'M':
                # Candidate is Male: Enforce at least one Male interviewer
                if male_vars:
                    model.Add(sum(male_vars) >= 1).OnlyEnforceIf(schedule[(candidate.id, t)])
                # We do NOT add a constraint for females here.

            elif candidate.gender == 'F':
                # Candidate is Female: Enforce at least one Female interviewer
                if female_vars:
                    model.Add(sum(female_vars) >= 1).OnlyEnforceIf(schedule[(candidate.id, t)])
                # We do NOT add a constraint for males here.

    # D. No Parallel Interviews
    for interviewer in interviewers:
        for t in sorted_slots:
            concurrent = []
            for c in candidates:
                if (interviewer.id, c.id, t) in assign:
                    concurrent.append(assign[(interviewer.id, c.id, t)])
            if concurrent:
                model.Add(sum(concurrent) <= 1)


    # --- OBJECTIVES (Unchanged) ---
    penalty_terms = []
    for t in sorted_slots:
        for i in interviewers:
            if t not in i.availability:
                for c in candidates:
                    if (i.id, c.id, t) in assign:
                        penalty_terms.append(assign[(i.id, c.id, t)] * 100)

    max_load = model.NewIntVar(0, len(candidates), "max_load")
    loads = []
    for i in interviewers:
        my_assignments = []
        for c in candidates:
            for t in sorted_slots:
                if (i.id, c.id, t) in assign:
                    my_assignments.append(assign[(i.id, c.id, t)])

        load_var = model.NewIntVar(0, len(candidates), f"load_{i.id}")
        model.Add(load_var == sum(my_assignments))
        loads.append(load_var)

    model.AddMaxEquality(max_load, loads)
    model.Minimize(sum(penalty_terms) + max_load)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = []
        for candidate in candidates:
            for t in sorted_slots:
                if solver.BooleanValue(schedule[(candidate.id, t)]):
                    panel_names = []
                    for i in interviewers:
                        if (i.id, candidate.id, t) in assign and solver.BooleanValue(assign[(i.id, candidate.id, t)]):
                            is_overtime = t not in i.availability
                            marker = " (Overtime)" if is_overtime else ""
                            panel_names.append(f"{i.name}{marker}")

                    results.append({
                        "candidate": candidate.name,
                        "time": t,
                        "panel": panel_names
                    })
        return {"status": "SUCCESS", "schedule": results}

    return {"status": "INFEASIBLE", "schedule": []}