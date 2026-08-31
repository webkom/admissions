import itertools
import random
import time
import types
from copy import deepcopy
from dataclasses import replace
from itertools import combinations
from unittest import mock

from django.test import SimpleTestCase, override_settings

from ortools.sat.python import cp_model

from admissions.admissions import constants
from admissions.admissions import solve_schedule_v2 as solver_v2_module
from admissions.admissions.solve_schedule import Candidate, Interviewer, solve_schedule
from admissions.admissions.solver_result import (
    evaluate_objective_vector,
    objective_key,
    validate_schedule_result,
)


def interviewer(
    interviewer_id,
    slots,
    *,
    gender="",
    experience_level="unknown",
    biased=None,
):
    return {
        "id": interviewer_id,
        "name": interviewer_id,
        "gender": gender,
        "experience_level": experience_level,
        "availability": list(slots),
        "biased": list(biased or []),
    }


@override_settings(ADMISSIONS_SOLVER_ENGINE_VERSION="v2")
class FactorizedSolverV2TestCase(SimpleTestCase):
    def solve(
        self,
        *,
        candidates,
        interviewers,
        panel_size,
        slots,
        options=None,
        blocks=None,
        locked=None,
        previous=None,
        include_metrics=False,
    ):
        return solve_schedule(
            candidates_data=candidates,
            interviewers_data=interviewers,
            panel_size=panel_size,
            options_data={
                "max_solver_seconds": 2,
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                **(options or {}),
            },
            all_slots_data=slots,
            blocks_data=blocks or [],
            locked_assignments_data=locked or [],
            previous_schedule_data=previous or [],
            include_metrics=include_metrics,
        )

    def test_every_supported_panel_size_has_exact_distinct_members(self):
        slots = [0]
        interviewers = [
            interviewer(
                f"i{index}",
                slots,
                experience_level="experienced" if index == 0 else "inexperienced",
            )
            for index in range(10)
        ]
        for panel_size in range(1, 11):
            with self.subTest(panel_size=panel_size):
                result = self.solve(
                    candidates=[{"id": "c1", "name": "Candidate"}],
                    interviewers=interviewers,
                    panel_size=panel_size,
                    slots=slots,
                    options={"require_experienced_panel": True},
                )
                self.assertEqual(result["status"], "SUCCESS")
                panel_ids = [member["id"] for member in result["schedule"][0]["panel"]]
                self.assertEqual(len(panel_ids), panel_size)
                self.assertEqual(len(set(panel_ids)), panel_size)
                self.assertIn("i0", panel_ids)

    def test_capability_pruning_requires_one_member_to_cover_both_bits(self):
        candidates = [{"id": "c1", "name": "Candidate", "gender": "F"}]
        result = self.solve(
            candidates=candidates,
            interviewers=[
                interviewer(
                    "same-gender",
                    [0],
                    gender="F",
                    experience_level="inexperienced",
                ),
                interviewer(
                    "experienced",
                    [0],
                    gender="M",
                    experience_level="experienced",
                ),
            ],
            panel_size=1,
            slots=[0],
            options={
                "enforce_same_gender": True,
                "require_experienced_panel": True,
            },
        )
        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(
            result["unplaceable"][0]["reason_code"],
            "experienced_interviewer_missing",
        )

        result = self.solve(
            candidates=candidates,
            interviewers=[
                interviewer(
                    "covers-both",
                    [0],
                    gender="F",
                    experience_level="experienced",
                )
            ],
            panel_size=1,
            slots=[0],
            options={
                "enforce_same_gender": True,
                "require_experienced_panel": True,
            },
        )
        self.assertEqual(result["status"], "SUCCESS")

    def test_candidate_user_id_excludes_self_interviews_before_solving(self):
        result = self.solve(
            candidates=[
                {
                    "id": "c1",
                    "name": "Candidate",
                    "user_id": "same-user",
                }
            ],
            interviewers=[
                interviewer("same-user", [0]),
                interviewer("other-user", [0]),
            ],
            panel_size=1,
            slots=[0],
        )
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["schedule"][0]["panel"][0]["id"], "other-user")

    def test_required_block_panel_is_shared_across_occupied_slots_with_gap(self):
        result = self.solve(
            candidates=[
                {"id": "c1", "name": "One"},
                {"id": "c2", "name": "Two"},
            ],
            interviewers=[
                interviewer("i1", [0, 2]),
                interviewer("i2", [0, 2]),
                interviewer("i3", [0, 2]),
            ],
            panel_size=2,
            slots=[0, 1, 2],
            blocks=[[0, 1, 2]],
            options={"panel_stability": "required"},
        )
        self.assertEqual(result["status"], "SUCCESS")
        panels = {
            frozenset(member["id"] for member in row["panel"])
            for row in result["schedule"]
        }
        self.assertEqual(len(panels), 1)

    def test_locked_panel_without_experience_is_rejected_pre_build(self):
        result = self.solve(
            candidates=[{"id": "c1", "name": "Candidate"}],
            interviewers=[
                interviewer("new", [0], experience_level="inexperienced"),
                interviewer("experienced", [0], experience_level="experienced"),
            ],
            panel_size=1,
            slots=[0],
            options={"require_experienced_panel": True},
            locked=[
                {
                    "candidate_id": "c1",
                    "time": 0,
                    "panel": [{"id": "new", "name": "new"}],
                }
            ],
        )
        self.assertEqual(result["status"], "LOCKED_CONFLICT")
        self.assertEqual(
            result["locked_conflicts"][0]["code"],
            "experienced_interviewer_missing",
        )

    def test_unknown_experience_never_satisfies_required_coverage(self):
        arguments = {
            "candidates_data": [{"id": "c1", "name": "Candidate"}],
            "interviewers_data": [interviewer("unknown", [0])],
            "panel_size": 1,
            "options_data": {
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                "require_experienced_panel": True,
                "max_solver_seconds": 2,
            },
            "all_slots_data": [0],
        }

        v2 = solve_schedule(**arguments, model_version="v2")
        v1 = solve_schedule(**arguments, model_version="v1")

        self.assertEqual(v2["status"], "PARTIAL")
        self.assertEqual(v2["schedule"], [])
        self.assertEqual(
            v2["unplaceable"][0]["reason_code"],
            "experienced_interviewer_missing",
        )
        self.assertEqual(v1["status"], "PARTIAL")
        self.assertEqual(v1["schedule"], [])

    def test_repair_retention_is_candidate_specific(self):
        previous = [
            {
                "candidate_id": "c1",
                "candidate": "One",
                "time": 0,
                "panel": [{"id": "i1", "name": "i1"}],
            },
            {
                "candidate_id": "c2",
                "candidate": "Two",
                "time": 1,
                "panel": [{"id": "i2", "name": "i2"}],
            },
        ]
        result = self.solve(
            candidates=[
                {"id": "c1", "name": "One"},
                {"id": "c2", "name": "Two"},
            ],
            interviewers=[
                interviewer("i1", [0, 1]),
                interviewer("i2", [0, 1]),
            ],
            panel_size=1,
            slots=[0, 1],
            previous=previous,
            options={"repair_mode": True, "repair_strategy": "minimum_change"},
        )
        self.assertEqual(result["status"], "SUCCESS")
        by_candidate = {
            row["candidate_id"]: (
                row["time"],
                row["panel"][0]["id"],
            )
            for row in result["schedule"]
        }
        self.assertEqual(by_candidate, {"c1": (0, "i1"), "c2": (1, "i2")})
        self.assertEqual(result["objective_vector"]["changed_rows"], 0)

    def test_metrics_are_private_and_report_sparse_counts(self):
        result = self.solve(
            candidates=[
                {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(4)
            ],
            interviewers=[interviewer(f"i{index}", range(8)) for index in range(5)],
            panel_size=2,
            slots=list(range(8)),
            include_metrics=True,
        )
        self.assertEqual(result["status"], "SUCCESS")
        metrics = result.pop("_solver_metrics")
        self.assertNotIn("solver_metrics", result)
        self.assertEqual(metrics["solver_engine_version"], "v2")
        self.assertEqual(metrics["placed_count"], 4)
        self.assertGreater(metrics["phases"][0]["variables"], 0)
        self.assertGreater(metrics["phases"][0]["constraints"], 0)

    def test_strict_infeasibility_falls_back_to_a_valid_partial_model(self):
        result = self.solve(
            candidates=[
                {"id": "c1", "name": "One"},
                {"id": "c2", "name": "Two"},
            ],
            interviewers=[interviewer("i1", [0])],
            panel_size=1,
            slots=[0],
            include_metrics=True,
        )

        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(len(result["schedule"]), 1)
        self.assertEqual(
            [phase["name"] for phase in result["_solver_metrics"]["phases"]],
            ["strict_feasibility", "partial_optimization"],
        )

    def test_load_spread_excludes_zero_availability_interviewers(self):
        """An interviewer with no availability pins min(load) = 0, which
        collapses the load-spread term to max(load) and effectively
        removes the spread objective from the model. The fix filters
        such interviewers out of `active_loads` (and the
        `experienced_loads` for the experienced-spread term), so the
        spread is measured only over the people who can actually work.
        """
        result = self.solve(
            candidates=[{"id": f"c{i}", "name": f"C{i}"} for i in range(4)],
            interviewers=[
                interviewer("i1", [0, 1, 2, 3]),
                interviewer("i2", [0, 1, 2, 3]),
                # No availability — should NOT count toward min(load).
                interviewer("webkom", []),
            ],
            panel_size=1,
            slots=[0, 1, 2, 3],
            include_metrics=True,
        )

        self.assertEqual(result["status"], "SUCCESS")
        # All 4 candidates placed, webkom contributes 0.
        placed_count = sum(1 for _ in result["schedule"])
        self.assertEqual(placed_count, 4)
        # Without the fix, load_spread would be 4 - 0 = 4 (max pinning).
        # With the fix, webkom is excluded from active_loads so the
        # spread is 2 - 2 = 0 (the two real workers share equally).
        load_spread = result["_solver_metrics"]["objective_vector"]["load_spread"]
        self.assertEqual(
            load_spread,
            0,
            f"load_spread should be 0 (both real workers share equally) "
            f"but got {load_spread}. The zero-availability interviewer "
            f"is being included in active_loads and pinning min(load) = 0.",
        )

    def test_invalid_phase_incumbents_are_discarded(self):
        invalid_row = {
            "candidate_id": "c1",
            "candidate": "Candidate",
            "time": 0,
            "panel": [],
        }
        with mock.patch(
            "admissions.admissions.solve_schedule_v2._reconstruct",
            return_value=[invalid_row],
        ):
            result = self.solve(
                candidates=[{"id": "c1", "name": "Candidate"}],
                interviewers=[interviewer("i1", [0])],
                panel_size=1,
                slots=[0],
                include_metrics=True,
            )

        self.assertEqual(result["status"], "ERROR")
        self.assertEqual(result["schedule"], [])
        self.assertIn(
            "panel_size",
            result["_solver_metrics"]["phases"][0]["validation_issue_codes"],
        )

    def test_valid_strict_incumbent_survives_global_optimization_timeout(self):
        real_solve_model = solver_v2_module._solve_model
        calls = []
        timeout_solver = mock.Mock()
        timeout_solver.StatusName.return_value = "UNKNOWN"
        timeout_solver.NumBranches.return_value = 0
        timeout_solver.NumConflicts.return_value = 0

        def solve_then_timeout(built, *, deadline, **_kwargs):
            calls.append(built.full_placement)
            if len(calls) == 1:
                return real_solve_model(built, deadline=deadline)
            return cp_model.UNKNOWN, timeout_solver, 0

        with mock.patch.object(
            solver_v2_module,
            "_solve_model",
            side_effect=solve_then_timeout,
        ):
            result = self.solve(
                candidates=[{"id": "c1", "name": "Candidate"}],
                interviewers=[interviewer("i1", [0])],
                panel_size=1,
                slots=[0],
                include_metrics=True,
            )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(len(result["schedule"]), 1)
        self.assertFalse(result["optimal"])
        self.assertEqual(
            [phase["status"] for phase in result["_solver_metrics"]["phases"]],
            ["OPTIMAL", "UNKNOWN"],
        )

    def test_timeout_without_any_valid_incumbent_returns_no_schedule(self):
        timeout_solver = mock.Mock()
        timeout_solver.StatusName.return_value = "UNKNOWN"
        timeout_solver.NumBranches.return_value = 0
        timeout_solver.NumConflicts.return_value = 0
        with mock.patch.object(
            solver_v2_module,
            "_solve_model",
            return_value=(cp_model.UNKNOWN, timeout_solver, 0),
        ):
            result = self.solve(
                candidates=[{"id": "c1", "name": "Candidate"}],
                interviewers=[interviewer("i1", [0])],
                panel_size=1,
                slots=[0],
                include_metrics=True,
            )

        self.assertEqual(result["status"], "TIMEOUT")
        self.assertEqual(result["schedule"], [])
        self.assertEqual(result["timeout_reason"], "no_incumbent")
        self.assertFalse(result["_solver_metrics"]["optimal"])
        self.assertEqual(
            [phase["name"] for phase in result["_solver_metrics"]["phases"]],
            ["strict_feasibility", "partial_optimization"],
        )

    def test_strict_infeasible_then_partial_unknown_is_timeout(self):
        infeasible_solver = mock.Mock()
        infeasible_solver.StatusName.return_value = "INFEASIBLE"
        infeasible_solver.NumBranches.return_value = 0
        infeasible_solver.NumConflicts.return_value = 0
        timeout_solver = mock.Mock()
        timeout_solver.StatusName.return_value = "UNKNOWN"
        timeout_solver.NumBranches.return_value = 0
        timeout_solver.NumConflicts.return_value = 0

        def infeasible_then_timeout(built, *, deadline, **_kwargs):
            if built.full_placement:
                return cp_model.INFEASIBLE, infeasible_solver, 0
            return cp_model.UNKNOWN, timeout_solver, 0

        with mock.patch.object(
            solver_v2_module,
            "_solve_model",
            side_effect=infeasible_then_timeout,
        ):
            result = self.solve(
                candidates=[
                    {"id": "c1", "name": "One"},
                    {"id": "c2", "name": "Two"},
                ],
                interviewers=[interviewer("i1", [0])],
                panel_size=1,
                slots=[0],
                include_metrics=True,
            )

        self.assertEqual(result["status"], "TIMEOUT")
        self.assertEqual(result["schedule"], [])
        self.assertEqual(result["timeout_reason"], "no_incumbent")

    def test_partial_model_invalid_is_an_error_not_a_timeout(self):
        infeasible_solver = mock.Mock()
        infeasible_solver.StatusName.return_value = "INFEASIBLE"
        infeasible_solver.NumBranches.return_value = 0
        infeasible_solver.NumConflicts.return_value = 0
        invalid_solver = mock.Mock()
        invalid_solver.StatusName.return_value = "MODEL_INVALID"
        invalid_solver.NumBranches.return_value = 0
        invalid_solver.NumConflicts.return_value = 0

        def infeasible_then_invalid(built, *, deadline, **_kwargs):
            if built.full_placement:
                return cp_model.INFEASIBLE, infeasible_solver, 0
            return cp_model.MODEL_INVALID, invalid_solver, 0

        with mock.patch.object(
            solver_v2_module,
            "_solve_model",
            side_effect=infeasible_then_invalid,
        ):
            result = self.solve(
                candidates=[
                    {"id": "c1", "name": "One"},
                    {"id": "c2", "name": "Two"},
                ],
                interviewers=[interviewer("i1", [0])],
                panel_size=1,
                slots=[0],
            )

        self.assertEqual(result["status"], "ERROR")
        self.assertEqual(result["schedule"], [])

    def test_staged_prefix_proof_is_not_global_optimality(self):
        problem, early_result = solver_v2_module._normalize_problem(
            candidates_data=[{"id": "c1", "name": "Candidate"}],
            interviewers_data=[interviewer("i1", [0])],
            panel_size=1,
            options_data={
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
            },
            locked_assignments_data=[],
            all_slots_data=[0],
            blocks_data=[],
            block_metadata_data=[],
            previous_schedule_data=[],
        )
        self.assertIsNone(early_result)
        built = solver_v2_module._build_model(
            problem,
            full_placement=False,
        )
        built.staged_lexicographic = True
        clock = iter([0.0, 0.0, 2.0, 2.0])

        with mock.patch.object(
            solver_v2_module.time,
            "monotonic",
            side_effect=lambda: next(clock, 2.0),
        ):
            status, _solver, _solve_ms = solver_v2_module._solve_model(
                built,
                deadline=1.0,
            )

        self.assertEqual(status, cp_model.FEASIBLE)

    def test_staged_lexicographic_solver_freezes_each_proven_prefix(self):
        model = cp_model.CpModel()
        first = model.NewBoolVar("first")
        second = model.NewBoolVar("second")
        model.Add(first + second >= 1)
        built = solver_v2_module.BuiltModel(
            model=model,
            schedule={},
            panel={},
            occupied={},
            tiers=[
                solver_v2_module.ObjectiveTier("first", first, 1),
                solver_v2_module.ObjectiveTier("second", second, 1),
            ],
            full_placement=False,
            previous_panel_member_count=0,
            variable_count=2,
            constraint_count=1,
            build_ms=0,
            staged_lexicographic=True,
        )

        status, solver, _solve_ms = solver_v2_module._solve_model(
            built,
            deadline=solver_v2_module.time.monotonic() + 2,
        )

        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(solver.Value(first), 0)
        self.assertEqual(solver.Value(second), 1)

    @override_settings(ADMISSIONS_SOLVER_ENGINE_VERSION="v1")
    def test_internal_setting_routes_to_v1_rollback_engine(self):
        result = self.solve(
            candidates=[{"id": "c1", "name": "Candidate"}],
            interviewers=[
                interviewer(
                    "i1",
                    [0],
                    experience_level="experienced",
                )
            ],
            panel_size=1,
            slots=[0],
            options={"require_experienced_panel": True},
            include_metrics=True,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            result["schedule"][0]["panel"][0]["experience_level"],
            "experienced",
        )
        self.assertEqual(
            result["_solver_metrics"]["solver_engine_version"],
            "v1",
        )

    def test_unknown_internal_engine_version_fails_closed(self):
        result = solve_schedule(
            candidates_data=[{"id": "c1", "name": "Candidate"}],
            interviewers_data=[interviewer("i1", [0])],
            panel_size=1,
            all_slots_data=[0],
            model_version="unexpected",
        )

        self.assertEqual(result["status"], "ERROR")
        self.assertEqual(result["schedule"], [])

    def test_observed_shape_meets_variable_reduction_gates(self):
        slots = list(range(88))
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(24)
        ]
        interviewers = []
        for index in range(12):
            availability_count = 40 if index < 4 else 39
            availability = [
                slots[(index * 7 + offset) % len(slots)]
                for offset in range(availability_count)
            ]
            interviewers.append(interviewer(f"i{index}", availability))
        options = {
            "policy_version": 2,
            "panel_stability": "preferred",
            "availability_fallback": "stop",
            "require_experienced_panel": False,
            "max_solver_seconds": 5,
        }
        arguments = {
            "candidates_data": candidates,
            "interviewers_data": interviewers,
            "panel_size": 1,
            "options_data": options,
            "all_slots_data": slots,
            "blocks_data": [
                slots[index : index + 4] for index in range(0, len(slots), 4)
            ],
            "include_metrics": True,
        }

        v1 = solve_schedule(**arguments, model_version="v1")
        v2 = solve_schedule(**arguments, model_version="v2")
        v1_phase = v1["_solver_metrics"]["phases"][0]
        v2_phase = v2["_solver_metrics"]["phases"][0]
        primary_reduction = 1 - (
            v2_phase["primary_assignment_variables"]
            / v1_phase["primary_assignment_variables"]
        )
        total_reduction = 1 - (v2_phase["variables"] / v1_phase["variables"])

        self.assertGreaterEqual(primary_reduction, 0.80)
        self.assertGreaterEqual(total_reduction, 0.60)

    def test_joint_interviews_packs_two_candidates_per_slot(self):
        slots = list(range(6))
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}", "gender": "M"}
            for index in range(4)
        ]
        # Panel of 3 available for every slot. With joint, the solver
        # can place 2 candidates in one slot with that shared panel.
        interviewers = [interviewer(f"i{index}", slots) for index in range(3)]
        options = {
            "policy_version": 2,
            "panel_stability": "flexible",
            "availability_fallback": "stop",
            "require_experienced_panel": False,
            "candidates_per_session": 2,
            "max_solver_seconds": 5,
        }
        common = {
            "candidates_data": candidates,
            "interviewers_data": interviewers,
            "panel_size": 3,
            "all_slots_data": slots,
            "options_data": options,
            "include_metrics": True,
        }

        result = solve_schedule(**common)
        self.assertIn(result["status"], ("SUCCESS", "PARTIAL"))
        schedule = result["schedule"]
        # All 4 candidates placed.
        candidate_ids = {row["candidate_id"] for row in schedule}
        self.assertEqual(candidate_ids, {c["id"] for c in candidates})

        # With 3 interviewers and panel_size=3, only one panel can sit at
        # a time. Joint mode is exact: 4 candidates form 2 sessions of 2.
        times = {row["time"] for row in schedule}
        self.assertEqual(len(times), 2, f"Joint packed into {len(times)} slots")
        for interview_time in times:
            self.assertEqual(
                sum(1 for row in schedule if row["time"] == interview_time),
                2,
            )

        # Both rows at a shared time carry the identical panel.
        for interview_time in times:
            rows = [row for row in schedule if row["time"] == interview_time]
            panels = {frozenset(m["id"] for m in row["panel"]) for row in rows}
            self.assertEqual(len(panels), 1, f"Mismatched panels at {interview_time}")
            self.assertLessEqual(len(rows), 2)

        # Validation accepts the joint result.
        problem, early = solver_v2_module._normalize_problem(
            candidates_data=common["candidates_data"],
            interviewers_data=common["interviewers_data"],
            panel_size=common["panel_size"],
            options_data=common["options_data"],
            locked_assignments_data=None,
            all_slots_data=common["all_slots_data"],
            blocks_data=None,
            block_metadata_data=None,
            previous_schedule_data=None,
        )
        self.assertIsNone(early)
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
            require_all_candidates=True,
            candidates_per_session=2,
        )
        self.assertEqual(issues, [])

        # With joint disabled the same schedule would be rejected.
        issues_no_joint = validate_schedule_result(
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
            require_all_candidates=True,
            candidates_per_session=1,
        )
        duplicate_issues = [
            issue for issue in issues_no_joint if issue.code == "duplicate_time"
        ]
        self.assertTrue(duplicate_issues)

    def test_joint_interviews_leave_an_odd_candidate_unplaced(self):
        slots = list(range(6))
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}", "gender": "M"}
            for index in range(5)
        ]
        interviewers = [interviewer(f"i{index}", slots) for index in range(3)]
        options = {
            "policy_version": 2,
            "panel_stability": "flexible",
            "availability_fallback": "stop",
            "require_experienced_panel": False,
            "candidates_per_session": 2,
            "max_solver_seconds": 5,
        }
        result = solve_schedule(
            candidates_data=candidates,
            interviewers_data=interviewers,
            panel_size=3,
            all_slots_data=slots,
            options_data=options,
        )
        # 5 candidates cannot form complete pairs: 4 are placed across two
        # full sessions, one is left unplaced.
        self.assertEqual(result["status"], "PARTIAL")
        schedule = result["schedule"]
        times = {row["time"] for row in schedule}
        self.assertEqual(len(times), 2)
        self.assertEqual(len(schedule), 4)
        self.assertEqual(len(result["unplaceable"]), 1)

    def test_incomplete_block_has_stable_panel(self):
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(7)
        ]
        interviewers = [
            interviewer(
                f"i{index}",
                list(range(8)),
                experience_level="experienced" if index % 2 == 0 else "unknown",
            )
            for index in range(12)
        ]
        options = {
            "policy_version": 2,
            "panel_stability": "preferred",
            "availability_fallback": "stop",
            "require_experienced_panel": True,
            "initial_strategy": "balanced",
            "max_solver_seconds": 3,
        }
        result = solve_schedule(
            candidates,
            interviewers,
            4,
            options,
            all_slots_data=list(range(8)),
            blocks_data=[[0, 1, 2, 3], [4, 5, 6, 7]],
            model_version="v2",
        )
        self.assertEqual(result["status"], "SUCCESS")
        schedule_by_time = {row["time"]: row for row in result["schedule"]}

        # Block 2 has 3 candidates (time 4, 5, 6) and 1 empty slot (time 7).
        block_2_panels = [
            tuple(sorted(member["id"] for member in schedule_by_time[time]["panel"]))
            for time in [4, 5, 6]
            if time in schedule_by_time
        ]
        self.assertEqual(len(block_2_panels), 3)
        # All 3 slots must share the identical panel.
        self.assertEqual(len(set(block_2_panels)), 1)


class IndependentSolverResultTestCase(SimpleTestCase):
    def setUp(self):
        self.candidates = [
            Candidate(id="c1", name="One", gender="F", user_id="candidate-user"),
            Candidate(id="c2", name="Two", gender="M"),
        ]
        self.interviewers = [
            Interviewer(
                id="i1",
                name="Experienced",
                gender="F",
                experience_level="experienced",
                availability=[0, 1],
                biased=[],
            ),
            Interviewer(
                id="i2",
                name="Other",
                gender="M",
                experience_level="inexperienced",
                availability=[0, 1],
                biased=[],
            ),
        ]
        self.schedule = [
            {
                "candidate_id": "c1",
                "candidate": "One",
                "time": 0,
                "panel": [
                    {
                        "id": "i1",
                        "name": "Experienced",
                        "is_overtime": False,
                    }
                ],
            },
            {
                "candidate_id": "c2",
                "candidate": "Two",
                "time": 1,
                "panel": [
                    {
                        "id": "i1",
                        "name": "Experienced",
                        "is_overtime": False,
                    }
                ],
            },
        ]

    def validate(self, schedule, **overrides):
        options = {
            "panel_size": 1,
            "allow_overtime": False,
            "enforce_same_gender": False,
            "require_experienced_panel": True,
            "requires_stable_panel": True,
            "locked_assignments": [],
            **overrides,
        }
        return validate_schedule_result(
            schedule=schedule,
            candidates=self.candidates,
            interviewers=self.interviewers,
            all_slots=[0, 1],
            blocks=[{"usable_slots": [0, 1]}],
            **options,
        )

    def test_each_mutation_is_rejected_by_the_pure_validator(self):
        mutations = {
            "unknown_candidate": lambda rows: rows[0].update(candidate_id="missing"),
            "duplicate_candidate": lambda rows: rows[1].update(candidate_id="c1"),
            "invalid_time": lambda rows: rows[0].update(time=99),
            "duplicate_time": lambda rows: rows[1].update(time=0),
            "panel_size": lambda rows: rows[0].update(panel=[]),
            "duplicate_panel_member": lambda rows: rows[0]["panel"].append(
                deepcopy(rows[0]["panel"][0])
            ),
            "unknown_interviewer": lambda rows: rows[0]["panel"][0].update(id="x"),
            "self_interview": lambda rows: rows[0]["panel"][0].update(
                id="candidate-user"
            ),
            "experienced_interviewer_missing": lambda rows: rows[0]["panel"][0].update(
                id="i2"
            ),
            "stable_panel_violation": lambda rows: rows[1]["panel"][0].update(id="i2"),
        }
        self.interviewers.append(
            Interviewer(
                id="candidate-user",
                name="Candidate",
                gender="F",
                experience_level="experienced",
                availability=[0, 1],
                biased=[],
            )
        )
        for expected_code, mutate in mutations.items():
            with self.subTest(expected_code=expected_code):
                schedule = deepcopy(self.schedule)
                mutate(schedule)
                issue_codes = {issue.code for issue in self.validate(schedule)}
                self.assertIn(expected_code, issue_codes)

        self.interviewers[0].biased = ["c1"]
        conflict_codes = {issue.code for issue in self.validate(self.schedule)}
        self.interviewers[0].biased = []
        self.assertIn("interviewer_conflict", conflict_codes)

        self.interviewers[0].availability = []
        overtime_codes = {issue.code for issue in self.validate(self.schedule)}
        self.interviewers[0].availability = [0, 1]
        self.assertIn("overtime_disabled", overtime_codes)

        gender_codes = {
            issue.code
            for issue in self.validate(self.schedule, enforce_same_gender=True)
        }
        self.assertIn("same_gender_missing", gender_codes)

        missing_lock_codes = {
            issue.code
            for issue in self.validate(
                self.schedule[:1],
                locked_assignments=[
                    {
                        "candidate_id": "c2",
                        "time": 1,
                        "panel": [{"id": "i1"}],
                    }
                ],
            )
        }
        self.assertIn("locked_candidate_missing", missing_lock_codes)

        changed_lock_codes = {
            issue.code
            for issue in self.validate(
                self.schedule,
                locked_assignments=[
                    {
                        "candidate_id": "c1",
                        "time": 1,
                        "panel": [{"id": "i1"}],
                    }
                ],
            )
        }
        self.assertIn("locked_assignment_changed", changed_lock_codes)

        missing_candidate_codes = {
            issue.code
            for issue in self.validate(
                self.schedule[:1],
                require_all_candidates=True,
            )
        }
        self.assertIn("missing_candidate", missing_candidate_codes)

    def test_objective_vector_is_raw_and_semantically_comparable(self):
        vector = evaluate_objective_vector(
            schedule=self.schedule,
            candidates=self.candidates,
            interviewers=self.interviewers,
            sorted_slots=[0, 1],
            blocks=[{"usable_slots": [0, 1], "day": 0, "start_time": 0}],
            previous_schedule=self.schedule,
            panel_size=1,
            require_experienced_panel=True,
        )
        self.assertEqual(vector.unplaced, 0)
        self.assertEqual(vector.changed_rows, 0)
        self.assertEqual(vector.extra_experienced, 0)
        self.assertGreaterEqual(vector.canonical_tie, 0)
        key = objective_key(
            vector,
            candidate_count=2,
            repair_mode=True,
            repair_strategy="minimum_change",
            prefers_stable_panel=False,
            load_balance_weight=4,
            continuity_weight=1,
            previous_panel_member_count=2,
        )
        self.assertEqual(key[0], 0)
        self.assertEqual(key[1], 0)


@override_settings(ADMISSIONS_SOLVER_ENGINE_VERSION="v2")
class SolverDifferentialTestCase(SimpleTestCase):
    def test_bruteforce_oracle_for_every_panel_size_through_eight(self):
        generator = random.Random(7)

        def brute_force_maximum(candidates, interviewers, panel_size, slots):
            feasible = {}
            for candidate in candidates:
                candidate_id = candidate["id"]
                possible_times = set()
                for interview_time in slots:
                    eligible = [
                        item
                        for item in interviewers
                        if interview_time in item["availability"]
                        and candidate_id not in item["biased"]
                        and item["id"] != candidate.get("user_id")
                    ]
                    for panel in combinations(eligible, panel_size):
                        if not any(
                            member["gender"] == candidate["gender"] for member in panel
                        ):
                            continue
                        if not any(
                            member["experience_level"] == "experienced"
                            for member in panel
                        ):
                            continue
                        possible_times.add(interview_time)
                        break
                feasible[candidate_id] = possible_times

            best = 0

            def search(index, occupied, placed):
                nonlocal best
                if index == len(candidates):
                    best = max(best, placed)
                    return
                if placed + len(candidates) - index <= best:
                    return
                search(index + 1, occupied, placed)
                candidate_id = candidates[index]["id"]
                for interview_time in feasible[candidate_id] - occupied:
                    search(
                        index + 1,
                        occupied | {interview_time},
                        placed + 1,
                    )

            search(0, set(), 0)
            return best

        slots = list(range(5))
        for interviewer_count in range(1, 9):
            interviewers = [
                interviewer(
                    f"i{index}",
                    [slot for slot in slots if generator.random() < 0.8 or index == 0],
                    gender="F" if index % 2 == 0 else "M",
                    experience_level=(
                        "experienced" if index in {0, 3} else "inexperienced"
                    ),
                    biased=(["c1"] if interviewer_count > 2 and index == 2 else []),
                )
                for index in range(interviewer_count)
            ]
            candidates = [
                {
                    "id": f"c{index}",
                    "name": f"Candidate {index}",
                    "gender": "F" if index % 2 == 0 else "M",
                    "user_id": "i7" if index == 0 else None,
                }
                for index in range(4)
            ]
            for panel_size in range(1, interviewer_count + 1):
                expected = brute_force_maximum(
                    candidates,
                    interviewers,
                    panel_size,
                    slots,
                )
                result = solve_schedule(
                    candidates,
                    interviewers,
                    panel_size,
                    {
                        "policy_version": 2,
                        "panel_stability": "flexible",
                        "availability_fallback": "stop",
                        "enforce_same_gender": True,
                        "require_experienced_panel": True,
                        "max_solver_seconds": 2,
                    },
                    all_slots_data=slots,
                    model_version="v2",
                )
                with self.subTest(
                    interviewer_count=interviewer_count,
                    panel_size=panel_size,
                ):
                    self.assertEqual(len(result.get("schedule") or []), expected)

    def test_200_seeded_v1_v2_cases_preserve_validity_and_semantics(self):
        def reason_class(entry):
            code = entry.get("reason_code")
            if code:
                return code
            reason = entry.get("reason") or ""
            if "inhabilitet" in reason:
                return "interviewer_conflict"
            if "samme kjønn" in reason:
                return "same_gender_missing"
            if "aktiv" in reason:
                return "no_open_slots"
            return "panel_capacity"

        generator = random.Random(42)
        semantic_comparisons = 0
        for seed in range(200):
            candidate_count = generator.randint(1, 4)
            slot_count = generator.randint(1, 5)
            interviewer_count = generator.randint(1, 8)
            panel_size = generator.randint(1, interviewer_count)
            slots = list(range(slot_count))
            candidates = [
                {
                    "id": f"c{index}",
                    "name": f"Candidate {index}",
                    "gender": "F" if index % 2 == 0 else "M",
                }
                for index in range(candidate_count)
            ]
            interviewers = []
            for index in range(interviewer_count):
                availability = [slot for slot in slots if generator.random() < 0.72]
                biased = [
                    candidate["id"]
                    for candidate in candidates
                    if generator.random() < 0.12
                ]
                interviewers.append(
                    interviewer(
                        f"i{index}",
                        availability,
                        gender="F" if index % 2 == 0 else "M",
                        biased=biased,
                    )
                )
            panel_stability = generator.choice(["required", "preferred", "flexible"])
            options = {
                "policy_version": 2,
                "panel_stability": panel_stability,
                "availability_fallback": "stop",
                "enforce_same_gender": generator.choice([False, True]),
                "require_experienced_panel": False,
                # Pinned to the weights the semantic key below measures, so
                # the comparison never shifts with application defaults.
                "load_balance_weight": 1,
                "continuity_weight": 12,
                # Give these tiny oracle cases ample room to prove an optimum.
                # The semantic comparison below still checks the solver's
                # explicit `optimal` contract before comparing objective keys.
                "max_solver_seconds": 5,
            }
            arguments = {
                "candidates_data": candidates,
                "interviewers_data": interviewers,
                "panel_size": panel_size,
                "options_data": options,
                "all_slots_data": slots,
                "blocks_data": [slots],
                "include_metrics": True,
            }

            v1 = solve_schedule(**arguments, model_version="v1")
            v2 = solve_schedule(**arguments, model_version="v2")
            candidate_models = [Candidate(**candidate) for candidate in candidates]
            interviewer_models = [Interviewer(**item) for item in interviewers]
            validator_arguments = {
                "candidates": candidate_models,
                "interviewers": interviewer_models,
                "panel_size": panel_size,
                "all_slots": slots,
                "allow_overtime": False,
                "enforce_same_gender": options["enforce_same_gender"],
                "require_experienced_panel": False,
                "requires_stable_panel": panel_stability == "required",
                "blocks": [{"usable_slots": slots}],
                "locked_assignments": [],
            }
            with self.subTest(seed=seed):
                self.assertFalse(
                    validate_schedule_result(
                        schedule=v1.get("schedule") or [],
                        **validator_arguments,
                    )
                )
                self.assertFalse(
                    validate_schedule_result(
                        schedule=v2.get("schedule") or [],
                        **validator_arguments,
                    )
                )
                self.assertEqual(
                    len(v2.get("schedule") or []),
                    len(v1.get("schedule") or []),
                )
                self.assertEqual(
                    sorted(reason_class(item) for item in v2.get("unplaceable") or []),
                    sorted(reason_class(item) for item in v1.get("unplaceable") or []),
                )

                if v2.get("optimal"):
                    vectors = []
                    for result in (v1, v2):
                        vector = evaluate_objective_vector(
                            schedule=result.get("schedule") or [],
                            candidates=candidate_models,
                            interviewers=interviewer_models,
                            sorted_slots=slots,
                            blocks=[
                                {
                                    "index": 0,
                                    "day": 0,
                                    "start_time": 0,
                                    "usable_slots": slots,
                                }
                            ],
                            previous_schedule=[],
                            panel_size=panel_size,
                            require_experienced_panel=False,
                        )
                        vectors.append(
                            objective_key(
                                vector,
                                candidate_count=candidate_count,
                                repair_mode=False,
                                repair_strategy="minimum_change",
                                prefers_stable_panel=panel_stability == "preferred",
                                load_balance_weight=1,
                                continuity_weight=12,
                                previous_panel_member_count=0,
                            )
                        )
                    semantic_comparisons += 1
                    self.assertLessEqual(vectors[1], vectors[0])

        self.assertGreater(semantic_comparisons, 0)

    def test_input_permutations_preserve_the_semantic_objective(self):
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(3)
        ]
        interviewers = [interviewer(f"i{index}", [0, 1, 2, 3]) for index in range(4)]
        options = {
            "policy_version": 2,
            "panel_stability": "preferred",
            "availability_fallback": "stop",
            "max_solver_seconds": 2,
        }
        baseline = solve_schedule(
            candidates,
            interviewers,
            2,
            options,
            all_slots_data=[0, 1, 2, 3],
            blocks_data=[[0, 1, 2, 3]],
            model_version="v2",
        )
        permuted = solve_schedule(
            list(reversed(candidates)),
            list(reversed(interviewers)),
            2,
            options,
            all_slots_data=[3, 1, 0, 2],
            blocks_data=[[3, 2, 1, 0]],
            model_version="v2",
        )

        self.assertEqual(
            baseline["objective_vector"],
            permuted["objective_vector"],
        )


class StagedTierBudgetingTestCase(SimpleTestCase):
    """The staged lexicographic loop must give every objective tier a slice
    of the budget and pin an unproven tier with an upper bound, instead of
    stopping at the first tier whose optimum it cannot prove - otherwise a
    large admission spends the whole budget on "minimise unplaced" and the
    plan comes back with rest violations and lopsided workload.
    """

    def _built_staged(self):
        problem, error = solver_v2_module._normalize_problem(
            candidates_data=[
                {"id": "c1", "name": "One"},
                {"id": "c2", "name": "Two"},
            ],
            interviewers_data=[
                interviewer("i1", [0, 1]),
                interviewer("i2", [0, 1]),
            ],
            panel_size=1,
            options_data={
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
            },
            all_slots_data=[0, 1],
            locked_assignments_data=[],
            blocks_data=[],
            block_metadata_data=[],
            previous_schedule_data=[],
        )
        self.assertIsNone(error)
        built = solver_v2_module._build_model(problem, full_placement=False)
        return replace(built, staged_lexicographic=True)

    def _scripted_solver_type(self, statuses, values):
        statuses = iter(statuses)
        values = iter(values)
        calls = []

        class ScriptedSolver:
            def __init__(self):
                self.parameters = types.SimpleNamespace()

            def Solve(self, model, callback):
                calls.append(self.parameters.max_time_in_seconds)
                return next(statuses)

            def Value(self, expression):
                return next(values)

            def StatusName(self, status):
                return "SCRIPTED"

            def NumBranches(self):
                return 0

            def NumConflicts(self):
                return 0

        return ScriptedSolver, calls

    def test_unproven_tier_does_not_starve_the_remaining_tiers(self):
        built = self._built_staged()
        constraints_before = len(built.model.Proto().constraints)
        solver_type, calls = self._scripted_solver_type(
            statuses=itertools.chain(
                [cp_model.FEASIBLE], itertools.repeat(cp_model.OPTIMAL)
            ),
            values=itertools.repeat(1),
        )

        with mock.patch.object(solver_v2_module.cp_model, "CpSolver", solver_type):
            status, _solver, _ms = solver_v2_module._solve_model(
                built,
                deadline=time.monotonic() + 120,
            )

        # The unproven first tier only earns a FEASIBLE verdict, but every
        # later tier is still solved and the bound is pinned in the model.
        self.assertEqual(status, cp_model.FEASIBLE)
        self.assertLess(calls[0], 120)
        self.assertGreater(len(built.model.Proto().constraints), constraints_before)
        # Every tier in the sweep, plus one reclaim attempt on the tier that
        # was left unproven - the leftover budget is not thrown away.
        self.assertEqual(len(calls), len(built.tiers) + 1)

    def test_reclaiming_an_unproven_tier_never_reports_optimal(self):
        """A reclaim proves a tier optimal only inside the pinned region.

        The later tiers were pinned while this one was merely bounded, so
        their pins may exclude the true lexicographic optimum. Improving the
        plan afterwards is sound; claiming the optimum is proven is not.
        """

        built = self._built_staged()
        solver_type, calls = self._scripted_solver_type(
            statuses=itertools.chain(
                [cp_model.FEASIBLE], itertools.repeat(cp_model.OPTIMAL)
            ),
            values=itertools.repeat(1),
        )

        with mock.patch.object(solver_v2_module.cp_model, "CpSolver", solver_type):
            status, _solver, _ms = solver_v2_module._solve_model(
                built,
                deadline=time.monotonic() + 120,
            )

        # The reclaim call answered OPTIMAL for the first tier and the sweep
        # answered OPTIMAL for all the rest, yet the verdict stays FEASIBLE.
        self.assertEqual(len(calls), len(built.tiers) + 1)
        self.assertEqual(status, cp_model.FEASIBLE)

    def test_a_tier_with_no_solution_does_not_abandon_the_tiers_below_it(self):
        """UNKNOWN on one tier used to `break` and forfeit the rest.

        It cost both the remaining tiers and the remaining budget, even though
        the incumbent found above was untouched and perfectly usable.
        """

        built = self._built_staged()
        solver_type, calls = self._scripted_solver_type(
            statuses=itertools.chain(
                [cp_model.OPTIMAL, cp_model.UNKNOWN],
                itertools.repeat(cp_model.OPTIMAL),
            ),
            values=itertools.repeat(1),
        )

        with mock.patch.object(solver_v2_module.cp_model, "CpSolver", solver_type):
            status, _solver, _ms = solver_v2_module._solve_model(
                built,
                deadline=time.monotonic() + 120,
            )

        self.assertEqual(status, cp_model.FEASIBLE)
        # Sweep over every tier, then a reclaim attempt on the one that
        # returned nothing.
        self.assertEqual(len(calls), len(built.tiers) + 1)

    def test_each_tier_is_warm_started_from_the_previous_solution(self):
        """Without the hint every tier re-derives a first solution by hand.

        The previous tier's plan is feasible by construction once that tier is
        pinned, so handing it over is what keeps the later tiers from spending
        their whole slice rediscovering it.
        """

        built = self._built_staged()
        hints_per_call = []
        solver_type, _calls = self._scripted_solver_type(
            statuses=itertools.repeat(cp_model.OPTIMAL),
            values=itertools.repeat(1),
        )

        class RecordingSolver(solver_type):
            def Solve(self, model, callback):
                hints_per_call.append(len(model.Proto().solution_hint.vars))
                return super().Solve(model, callback)

        with mock.patch.object(solver_v2_module.cp_model, "CpSolver", RecordingSolver):
            solver_v2_module._solve_model(built, deadline=time.monotonic() + 120)

        variable_count = len(built.model.Proto().variables)
        # The first tier keeps whatever the build hinted; every tier after it
        # is handed the full assignment from the tier above.
        self.assertEqual(hints_per_call[1:], [variable_count] * (len(built.tiers) - 1))

    def test_proving_every_tier_reports_optimal(self):
        built = self._built_staged()
        solver_type, calls = self._scripted_solver_type(
            statuses=itertools.repeat(cp_model.OPTIMAL),
            values=itertools.repeat(0),
        )

        with mock.patch.object(solver_v2_module.cp_model, "CpSolver", solver_type):
            status, _solver, _ms = solver_v2_module._solve_model(
                built,
                deadline=time.monotonic() + 120,
            )

        self.assertEqual(status, cp_model.OPTIMAL)
        self.assertEqual(len(calls), len(built.tiers))


class PackEarlyObjectiveOrderingTestCase(SimpleTestCase):
    """pack_early promotes the day-major earliness tier above the fairness
    terms: progressive publishing strands an early-published day's spare
    capacity, so an opted-in solve saturates Monday before touching Tuesday.
    Repairs keep their minimal-change precedence, and by default earliness
    stays the final tie-breaker below load balancing and continuity.
    """

    def _built(self, options, previous=None):
        problem, error = solver_v2_module._normalize_problem(
            candidates_data=[
                {"id": "c1", "name": "One"},
                {"id": "c2", "name": "Two"},
            ],
            interviewers_data=[
                interviewer("i1", [0, 1]),
                interviewer("i2", [0, 1]),
            ],
            panel_size=1,
            options_data={
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                **options,
            },
            all_slots_data=[0, 1],
            locked_assignments_data=[],
            blocks_data=[],
            block_metadata_data=[],
            previous_schedule_data=previous or [],
        )
        self.assertIsNone(error)
        return solver_v2_module._build_model(problem, full_placement=False)

    def _tier_names(self, built):
        return [tier.name for tier in built.tiers]

    def test_default_keeps_earliness_as_the_final_tie_breaker(self):
        built = self._built({})

        names = self._tier_names(built)
        self.assertLess(names.index("load_and_continuity"), names.index("earliness"))

    def test_pack_early_promotes_earliness_above_the_fairness_terms(self):
        built = self._built({"pack_early": True})

        names = self._tier_names(built)
        self.assertEqual(names.count("earliness"), 1)
        self.assertLess(names.index("earliness"), names.index("block_fill"))
        self.assertLess(names.index("earliness"), names.index("load_and_continuity"))

    def test_repair_mode_keeps_minimal_change_precedence_over_packing(self):
        previous = [
            {
                "candidate_id": "c1",
                "time": 0,
                "panel": [{"id": "i1", "name": "i1"}],
            }
        ]
        built = self._built({"pack_early": True, "repair_mode": True}, previous)

        names = self._tier_names(built)
        self.assertLess(names.index("repair_cost"), names.index("earliness"))
        self.assertGreater(names.index("earliness"), names.index("load_and_continuity"))

    def test_packed_solve_fills_the_earlier_day_first(self):
        slots = [540, 600, 24 * 60 + 540, 24 * 60 + 600]
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(3)
        ]
        # One interviewer, panel of one: a single session per slot, so the
        # solver chooses which day carries the load.
        interviewers = [interviewer("i1", slots)]

        packed = solve_schedule(
            candidates_data=candidates,
            interviewers_data=interviewers,
            panel_size=1,
            options_data={
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                "pack_early": True,
                "max_solver_seconds": 5,
            },
            all_slots_data=slots,
        )
        self.assertEqual(packed["status"], "SUCCESS")
        day_counts = {}
        for row in packed["schedule"]:
            day = row["time"] // (24 * 60)
            day_counts[day] = day_counts.get(day, 0) + 1
        # Three candidates, two sessions per day: packing fills day 0 to its
        # two-session capacity before day 1 is touched.
        self.assertEqual(day_counts.get(0, 0), 2)
        self.assertEqual(day_counts.get(1, 0), 1)


@override_settings(ADMISSIONS_SOLVER_ENGINE_VERSION="v2")
class LiveIncumbentTestCase(SimpleTestCase):
    """The solver reaches a usable plan in seconds and then polishes it.

    Streaming those incumbents out is what lets an administrator see - and
    adopt - a plan instead of watching a progress bar for the whole budget.
    """

    def _case(self, **overrides):
        slots = list(range(6))
        return {
            "candidates_data": [
                {"id": f"c{index}", "name": f"Candidate {index}"} for index in range(4)
            ],
            "interviewers_data": [
                interviewer("i1", slots),
                interviewer("i2", slots),
            ],
            "panel_size": 1,
            "options_data": {
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                "max_solver_seconds": 5,
                **overrides,
            },
            "all_slots_data": slots,
        }

    def test_incumbents_are_published_before_the_solve_finishes(self):
        published = []
        result = solve_schedule(
            **self._case(),
            on_incumbent=lambda payload: published.append(payload) is None,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertTrue(published)
        for payload in published:
            # A preview may be adopted straight from the browser, so it has to
            # be a complete, usable result - not a bag of raw solver values.
            self.assertIn(payload["status"], {"SUCCESS", "PARTIAL"})
            self.assertTrue(payload["schedule"])
            self.assertIn("objective_vector", payload)
            self.assertFalse(payload["optimal"])
            self.assertGreaterEqual(payload["elapsed_ms"], 0)

    def test_published_incumbents_pass_the_same_validator_as_the_result(self):
        published = []
        solve_schedule(
            **self._case(require_experienced_panel=False),
            on_incumbent=lambda payload: published.append(payload) is None,
        )

        self.assertTrue(published)
        for payload in published:
            issues = validate_schedule_result(
                schedule=payload["schedule"],
                candidates=[
                    Candidate(id=f"c{index}", name=f"Candidate {index}")
                    for index in range(4)
                ],
                interviewers=[
                    Interviewer(**interviewer("i1", list(range(6)))),
                    Interviewer(**interviewer("i2", list(range(6)))),
                ],
                panel_size=1,
                all_slots=list(range(6)),
                allow_overtime=False,
                enforce_same_gender=False,
                require_experienced_panel=False,
                requires_stable_panel=False,
                blocks=[],
                locked_assignments=[],
            )
            self.assertEqual(issues, [])

    def test_returning_false_stops_the_search_and_keeps_the_plan(self):
        """This is how a cancelled job stops burning CPU without losing work."""

        started = time.monotonic()
        seen = []

        def stop_immediately(payload):
            seen.append(payload)
            return False

        result = solve_schedule(
            **self._case(max_solver_seconds=60),
            on_incumbent=stop_immediately,
        )
        elapsed = time.monotonic() - started

        self.assertTrue(seen)
        self.assertIn(result["status"], {"SUCCESS", "PARTIAL"})
        self.assertTrue(result["schedule"])
        # It stopped on request rather than spending the 60s budget.
        self.assertLess(elapsed, 30)

    def test_a_broken_publisher_never_breaks_the_solve(self):
        def explode(payload):
            raise RuntimeError("preview storage is down")

        result = solve_schedule(**self._case(), on_incumbent=explode)

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(len(result["schedule"]), 4)


class SolverWorkerCountTestCase(SimpleTestCase):
    """The worker count decides CP-SAT's portfolio, so it decides the plan.

    Two properties matter beyond "reads the env var": the default must not
    vary with the host, or the same seed yields a different plan locally, in
    CI and in production; and a malformed value must not raise, because this
    module is imported by the whole service rather than only the solver.
    """

    def test_the_default_does_not_depend_on_the_host(self):
        self.assertEqual(
            constants.resolve_solver_num_workers(None),
            constants.DEFAULT_SOLVER_NUM_WORKERS,
        )
        self.assertEqual(
            constants.resolve_solver_num_workers("   "),
            constants.DEFAULT_SOLVER_NUM_WORKERS,
        )

    def test_a_smaller_container_can_actually_size_down(self):
        # The previous max(4, ...) floor silently ignored anything below 4,
        # which made the override useless for the case it was written for.
        self.assertEqual(constants.resolve_solver_num_workers("2"), 2)

    def test_values_outside_the_supported_range_are_clamped(self):
        self.assertEqual(
            constants.resolve_solver_num_workers("64"),
            constants.MAX_SOLVER_NUM_WORKERS,
        )
        self.assertEqual(
            constants.resolve_solver_num_workers("0"),
            constants.MIN_SOLVER_NUM_WORKERS,
        )
        self.assertEqual(
            constants.resolve_solver_num_workers("-3"),
            constants.MIN_SOLVER_NUM_WORKERS,
        )

    def test_a_malformed_value_degrades_the_solver_and_nothing_else(self):
        with self.assertLogs("admissions.admissions.constants", level="WARNING"):
            resolved = constants.resolve_solver_num_workers("eight")

        self.assertEqual(resolved, constants.DEFAULT_SOLVER_NUM_WORKERS)

    def test_the_module_level_value_is_within_range(self):
        self.assertGreaterEqual(
            constants.SOLVER_NUM_WORKERS, constants.MIN_SOLVER_NUM_WORKERS
        )
        self.assertLessEqual(
            constants.SOLVER_NUM_WORKERS, constants.MAX_SOLVER_NUM_WORKERS
        )


class PhaseMetricsOnUnsolvedSolverTestCase(SimpleTestCase):
    """Metrics must survive a phase whose solver never ran.

    In staged mode each tier solves with its own solver, so a phase where no
    tier produced a solution returns the untouched one it started with.
    ortools raises "solve() has not been called." for the search counters
    rather than reporting zero, and because the worker asks for metrics on
    every run this surfaced as a RuntimeError killing an otherwise finished
    solve - not only in tests.
    """

    def test_an_unsolved_solver_reports_no_counters_instead_of_raising(self):
        never_solved = cp_model.CpSolver()

        with self.assertRaises(RuntimeError):
            never_solved.NumBranches()

        self.assertIsNone(solver_v2_module._solver_counter(never_solved, "NumBranches"))
        self.assertIsNone(
            solver_v2_module._solver_counter(never_solved, "NumConflicts")
        )

    def test_a_solved_solver_still_reports_its_counters(self):
        model = cp_model.CpModel()
        model.NewBoolVar("x")
        solver = cp_model.CpSolver()
        solver.Solve(model)

        self.assertIsNotNone(solver_v2_module._solver_counter(solver, "NumBranches"))

    def test_an_unknown_counter_is_absent_rather_than_fatal(self):
        self.assertIsNone(
            solver_v2_module._solver_counter(cp_model.CpSolver(), "NoSuchCounter")
        )
