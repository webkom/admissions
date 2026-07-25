from django.test import SimpleTestCase

from admissions.admissions.schedule_policy import (
    build_deviation_review,
    normalize_schedule_policy,
    normalize_solver_options,
    solver_options_for_storage,
)
from admissions.admissions.solve_schedule import solve_schedule


class SchedulePolicyTestCase(SimpleTestCase):
    def test_new_policy_uses_runtime_permissions_and_fail_safe_storage_shadows(self):
        options = {
            "policy_version": 2,
            "panel_stability": "preferred",
            "availability_fallback": "propose",
        }

        runtime, policy = normalize_solver_options(options)
        stored = solver_options_for_storage(options)

        self.assertTrue(runtime["allow_overtime"])
        self.assertFalse(runtime["same_panel_per_block"])
        self.assertTrue(policy.requires_deviation_approval)
        self.assertFalse(stored["allow_overtime"])
        self.assertFalse(stored["same_panel_per_block"])

    def test_legacy_repair_maps_hard_panel_toggle_to_preference(self):
        policy = normalize_schedule_policy(
            {
                "same_panel_per_block": True,
                "repair_mode": True,
                "allow_overtime": False,
            }
        )

        self.assertEqual(policy.panel_stability, "preferred")
        self.assertEqual(policy.availability_fallback, "stop")

    def test_empty_persisted_policy_keeps_legacy_publication_semantics(self):
        policy = normalize_schedule_policy({}, persisted=True)

        self.assertEqual(policy.panel_stability, "flexible")
        self.assertEqual(policy.availability_fallback, "automatic")

    def test_deviation_approval_is_bound_to_schedule_and_generation(self):
        policy = normalize_schedule_policy(
            {
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "propose",
            }
        )
        schedule = [
            {
                "candidate_id": "candidate",
                "time": 540,
                "panel": [{"id": "interviewer", "name": "Ada", "is_overtime": True}],
            }
        ]

        first = build_deviation_review(
            schedule=schedule,
            policy=policy,
            availability_generation=1,
            layout_version=2,
        )
        changed = build_deviation_review(
            schedule=schedule,
            policy=policy,
            availability_generation=2,
            layout_version=2,
        )

        self.assertTrue(first["requires_approval"])
        self.assertEqual(first["deviation_count"], 1)
        self.assertNotEqual(
            first["deviation_fingerprint"], changed["deviation_fingerprint"]
        )

    def test_preferred_panel_stays_stable_across_an_empty_slot(self):
        base = {
            "candidates_data": [
                {"id": "c1", "name": "Candidate 1"},
                {"id": "c2", "name": "Candidate 2"},
            ],
            "interviewers_data": [
                {
                    "id": "i1",
                    "name": "Interviewer 1",
                    "availability": [0, 2],
                },
                {
                    "id": "i2",
                    "name": "Interviewer 2",
                    "availability": [0, 2],
                },
                {
                    "id": "i3",
                    "name": "Interviewer 3",
                    "availability": [0],
                },
                {
                    "id": "i4",
                    "name": "Interviewer 4",
                    "availability": [2],
                },
            ],
            "panel_size": 2,
            "all_slots_data": [0, 2],
            "blocks_data": [[0, 1, 2]],
        }

        preferred = solve_schedule(
            **base,
            options_data={
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "stop",
                "prioritize_continuity": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
        )
        flexible = solve_schedule(
            **base,
            options_data={
                "policy_version": 2,
                "panel_stability": "flexible",
                "availability_fallback": "stop",
                "prioritize_continuity": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
        )

        preferred_panels = [
            {member["id"] for member in row["panel"]} for row in preferred["schedule"]
        ]
        flexible_panels = [
            {member["id"] for member in row["panel"]} for row in flexible["schedule"]
        ]
        self.assertEqual(preferred["status"], "SUCCESS")
        self.assertEqual(preferred_panels[0], preferred_panels[1])
        self.assertNotEqual(flexible_panels[0], flexible_panels[1])

    def test_required_panel_is_hard_while_preferred_may_change_panel(self):
        base = {
            "candidates_data": [
                {"id": "c1", "name": "Candidate 1"},
                {"id": "c2", "name": "Candidate 2"},
            ],
            "interviewers_data": [
                {"id": "i1", "name": "Interviewer 1", "availability": [0]},
                {"id": "i2", "name": "Interviewer 2", "availability": [1]},
            ],
            "panel_size": 1,
            "all_slots_data": [0, 1],
            "blocks_data": [[0, 1]],
        }

        required = solve_schedule(
            **base,
            options_data={
                "policy_version": 2,
                "panel_stability": "required",
                "availability_fallback": "stop",
                "prioritize_continuity": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
        )
        preferred = solve_schedule(
            **base,
            options_data={
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "stop",
                "prioritize_continuity": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
        )

        self.assertEqual(required["status"], "PARTIAL")
        self.assertEqual(len(required["schedule"]), 1)
        self.assertEqual(preferred["status"], "SUCCESS")
        self.assertEqual(
            [row["panel"][0]["id"] for row in preferred["schedule"]],
            ["i1", "i2"],
        )

    def test_repair_never_uses_availability_deviation_for_panel_preference(self):
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Candidate 1"},
                {"id": "c2", "name": "Candidate 2"},
            ],
            interviewers_data=[
                {"id": "i1", "name": "Interviewer 1", "availability": []},
                {
                    "id": "i2",
                    "name": "Interviewer 2",
                    "availability": [0, 1],
                },
            ],
            panel_size=1,
            options_data={
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "propose",
                "repair_mode": True,
                "repair_strategy": "preserve_panels",
                "prioritize_continuity": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
            all_slots_data=[0, 1],
            blocks_data=[[0, 1]],
            previous_schedule_data=[
                {
                    "candidate_id": "c1",
                    "candidate": "Candidate 1",
                    "time": 0,
                    "panel": [{"id": "i1", "name": "Interviewer 1"}],
                },
                {
                    "candidate_id": "c2",
                    "candidate": "Candidate 2",
                    "time": 1,
                    "panel": [{"id": "i1", "name": "Interviewer 1"}],
                },
            ],
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertTrue(
            all(
                member["id"] == "i2" and not member["is_overtime"]
                for row in result["schedule"]
                for member in row["panel"]
            )
        )
