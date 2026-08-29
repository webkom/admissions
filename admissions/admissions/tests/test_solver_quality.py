from datetime import date
from types import SimpleNamespace
from unittest import mock

from django.core.management import call_command
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

import admissions.admissions.solve_schedule as solve_schedule_module
from admissions.admissions.constants import LEADER
from admissions.admissions.models import Group, LegoUser, Membership, SolveJob
from admissions.admissions.solve_schedule import build_solve_options, solve_schedule
from admissions.admissions.tests.utils import create_admission
from admissions.utils.management.commands.run_solver_worker import _demote_draft_locks

ENVELOPE_KEYS = ("schedule", "unplaceable", "locked_conflicts")


@override_settings(ALLOW_SYNTHETIC_SOLVER_INPUT=True)
class SolverQualityTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Kvalitetskom", lego_id=996)
        self.user = LegoUser.objects.create(username="quality-user", lego_id=995)
        Membership.objects.create(user=self.user, role=LEADER, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="quality-opptak")
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("solve-schedule")

    def _solve(self, payload):
        """Enqueue a solve, run the worker once, and return a response-like
        object whose .data is the solve result envelope. Validation/permission
        failures (non-202) are returned verbatim so those assertions still hold.
        """
        res = self.client.post(
            self.url,
            {
                **payload,
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
                "synthetic": True,
            },
            format="json",
        )
        if res.status_code != status.HTTP_202_ACCEPTED:
            return res
        call_command("run_solver_worker", once=True)
        job = SolveJob.objects.get(id=res.data["job_id"])
        return SimpleNamespace(status_code=status.HTTP_200_OK, data=job.result)

    def assertEnvelope(self, data):
        for key in ENVELOPE_KEYS:
            self.assertIn(key, data)
            self.assertIsInstance(data[key], list)

    def _block_times(self, block):
        if isinstance(block, dict):
            return set(block.get("usable_slots") or block.get("canonical_slots") or [])
        return set(block)

    def _worked_blocks(self, schedule, blocks):
        worked = {}
        for block_index, block in enumerate(blocks):
            block_times = self._block_times(block)
            if isinstance(block, dict):
                block_index = block["index"]
            for item in schedule:
                if item["time"] not in block_times:
                    continue
                for member in item["panel"]:
                    worked.setdefault(member["id"], set()).add(block_index)
        return worked

    def _day_block_groups(self, blocks):
        groups = []
        current_day = None
        current_group = []
        canonical_blocks = []
        for block_index, block in enumerate(blocks):
            if isinstance(block, dict):
                canonical_blocks.append(
                    (
                        block.get("day", 0),
                        block.get("start_time", 0),
                        block.get("index", block_index),
                        block_index,
                    )
                )
            elif block:
                canonical_blocks.append(
                    (block[0] // (24 * 60), block[0], block_index, block_index)
                )

        for block_day, _start_time, _canonical_index, block_index in sorted(
            canonical_blocks
        ):
            if current_day is None or block_day != current_day:
                if current_group:
                    groups.append(current_group)
                current_day = block_day
                current_group = []
            current_group.append(_canonical_index)
        if current_group:
            groups.append(current_group)
        return groups

    def _consecutive_block_penalties(self, schedule, blocks):
        worked = self._worked_blocks(schedule, blocks)
        penalty = 0
        for block_group in self._day_block_groups(blocks):
            for block_set in worked.values():
                for left, right in zip(block_group, block_group[1:]):
                    if left in block_set and right in block_set:
                        penalty += 1
        return penalty

    def test_fully_biased_candidate_is_unplaceable_without_empty_panel(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 1],
                    "biased": ["candidate-1"],
                },
            ],
            "panel_size": 1,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        self.assertEnvelope(res.data)
        self.assertNotIn(
            "candidate-1",
            [item["candidate_id"] for item in res.data["schedule"]],
        )
        for item in res.data["schedule"]:
            self.assertEqual(len(item["panel"]), 1)
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-1"],
        )
        self.assertEqual(
            res.data["unplaceable"][0]["reason"],
            "For mange i komiteen har meldt inhabilitet.",
        )

    def test_zero_interviewers_places_nobody(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [],
            "panel_size": 1,
            "all_slots": [0, 1],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        self.assertEnvelope(res.data)
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-1", "candidate-2"],
        )
        for entry in res.data["unplaceable"]:
            self.assertTrue(entry["reason"])

    def test_rebalance_locked_option_does_not_break_the_solve(self):
        # `rebalance_locked` is a worker-level policy the SolveOptionsSerializer
        # accepts (default False on every request) but the CP-SAT model must
        # never see. Regression: it used to splat straight into
        # SolveOptions(**...) and raise TypeError, failing every solve.
        payload = {
            "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 1],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "options": {"rebalance_locked": True},
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEnvelope(res.data)
        self.assertEqual(
            [row["candidate_id"] for row in res.data["schedule"]], ["candidate-1"]
        )

    def test_locked_time_outside_open_slots_is_rejected(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 5,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                }
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked_assignments", res.data)

    def test_no_open_slots_is_infeasible_with_reasons(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [],
                },
            ],
            "panel_size": 1,
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "INFEASIBLE")
        self.assertEnvelope(res.data)
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-1", "candidate-2"],
        )
        for entry in res.data["unplaceable"]:
            self.assertEqual(entry["reason"], "Ingen aktive tidsluker er åpnet.")

    def test_identical_solves_return_identical_schedules(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 1],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0],
                    "biased": ["candidate-2"],
                },
            ],
            "panel_size": 1,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
        }

        first = self._solve(payload)
        second = self._solve(payload)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["status"], "SUCCESS")
        self.assertEqual(first.data, second.data)
        by_candidate = {item["candidate_id"]: item for item in first.data["schedule"]}
        self.assertEqual(by_candidate["candidate-1"]["time"], 0)
        self.assertEqual(by_candidate["candidate-1"]["panel"][0]["id"], "interviewer-2")
        self.assertEqual(by_candidate["candidate-2"]["time"], 1)
        self.assertEqual(by_candidate["candidate-2"]["panel"][0]["id"], "interviewer-1")

    def test_every_status_returns_the_full_envelope(self):
        success_payload = {
            "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0],
                },
            ],
            "panel_size": 1,
        }
        partial_payload = {
            "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
            "interviewers": [],
            "panel_size": 1,
            "all_slots": [0],
        }
        infeasible_payload = {
            "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
            "interviewers": [],
            "panel_size": 1,
        }
        locked_conflict_payload = {
            "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0],
                    "biased": ["candidate-1"],
                },
            ],
            "panel_size": 1,
            "all_slots": [0],
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 0,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                }
            ],
        }
        expectations = [
            (success_payload, "SUCCESS"),
            (partial_payload, "PARTIAL"),
            (infeasible_payload, "INFEASIBLE"),
            (locked_conflict_payload, "LOCKED_CONFLICT"),
        ]

        for payload, expected_status in expectations:
            with self.subTest(expected_status=expected_status):
                res = self._solve(payload)

                self.assertEqual(res.status_code, status.HTTP_200_OK)
                self.assertEqual(res.data["status"], expected_status)
                self.assertEnvelope(res.data)

    def test_locked_panels_in_same_block_must_match(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 1],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0, 1],
                },
            ],
            "panel_size": 1,
            "blocks": [[0, 1]],
            "options": {
                "enforce_same_gender": False,
                "same_panel_per_block": True,
            },
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 0,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                },
                {
                    "candidate_id": "candidate-2",
                    "candidate": "Eirik",
                    "time": 1,
                    "panel": [{"id": "interviewer-2", "name": "Ida"}],
                },
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "LOCKED_CONFLICT")
        self.assertEnvelope(res.data)
        self.assertEqual(res.data["schedule"], [])
        message = res.data["locked_conflicts"][0]["message"]
        self.assertIn("Ada", message)
        self.assertIn("Eirik", message)

    def test_same_panel_per_block_uses_one_panel_for_the_whole_block(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 1],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0, 1],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "blocks": [[0, 1]],
            "options": {
                "enforce_same_gender": False,
                "same_panel_per_block": True,
                "allow_overtime": True,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        placed = {item["candidate_id"] for item in res.data["schedule"]}
        self.assertEqual(placed, {"candidate-1", "candidate-2"})
        panels = {
            tuple(sorted(member["id"] for member in item["panel"]))
            for item in res.data["schedule"]
        }
        self.assertEqual(len(panels), 1)

    def test_avoid_consecutive_interviewer_blocks_prefers_work_rest_work_when_rotation_is_possible(
        self,
    ):
        blocks = [[0, 1], [2, 3], [4, 5]]
        result = solve_schedule(
            candidates_data=[
                {"id": f"candidate-{index}", "name": f"Candidate {index}", "gender": ""}
                for index in range(6)
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2, 3, 4, 5],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(len(result["schedule"]), 6)
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 0
        )

    def test_avoid_consecutive_interviewer_blocks_can_be_disabled(self):
        blocks = [[0, 1], [2, 3], [4, 5]]
        result = solve_schedule(
            candidates_data=[
                {"id": f"candidate-{index}", "name": f"Candidate {index}", "gender": ""}
                for index in range(6)
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": True,
                "same_panel_per_block": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
            all_slots_data=[0, 1, 2, 3, 4, 5],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertGreater(
            self._consecutive_block_penalties(result["schedule"], blocks),
            0,
        )

    def test_avoid_consecutive_interviewer_blocks_allows_consecutive_blocks_when_capacity_is_tight(
        self,
    ):
        blocks = [[0], [1]]
        result = solve_schedule(
            candidates_data=[
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(len(result["schedule"]), 2)
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 1
        )
        self.assertEqual(
            self._worked_blocks(result["schedule"], blocks)["interviewer-1"], {0, 1}
        )

    def test_avoid_consecutive_interviewer_blocks_yields_to_candidate_placement(self):
        blocks = [[0], [1], [2]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
                {"id": "c3", "name": "Liv", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1],
                    "biased": ["c3"],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [2],
                    "biased": ["c1", "c2"],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            locked_assignments_data=[
                {
                    "candidate_id": "c1",
                    "candidate": "Ada",
                    "time": 0,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                }
            ],
            all_slots_data=[0, 1, 2],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            [item["candidate_id"] for item in result["schedule"]],
            ["c1", "c2", "c3"],
        )
        worked = self._worked_blocks(result["schedule"], blocks)
        self.assertEqual(worked["interviewer-1"], {0, 1})
        self.assertEqual(worked["interviewer-2"], {2})
        self.assertTrue(
            next(item for item in result["schedule"] if item["candidate_id"] == "c1")[
                "locked"
            ]
        )
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 1
        )

    def test_three_block_run_counts_two_adjacent_pair_penalties(self):
        blocks = [[0], [1], [2]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
                {"id": "c3", "name": "Liv", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            self._worked_blocks(result["schedule"], blocks)["interviewer-1"], {0, 1, 2}
        )
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 2
        )

    def test_avoid_consecutive_interviewer_blocks_ignores_day_boundaries(self):
        blocks = [[0], [24 * 60]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 24 * 60],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 24 * 60],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 0
        )

    def test_intervening_block_breaks_consecutiveness(self):
        blocks = [[0], [1], [2]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
                {"id": "c3", "name": "Liv", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2],
                    "biased": ["c2"],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2],
                    "biased": ["c1", "c3"],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        worked = self._worked_blocks(result["schedule"], blocks)
        self.assertEqual(worked["interviewer-1"], {0, 2})
        self.assertEqual(worked["interviewer-2"], {1})
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 0
        )

    def test_partial_block_occupancy_still_counts_as_consecutive_work(self):
        blocks = [[0, 1], [2, 3]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 2],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2, 3],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            self._worked_blocks(result["schedule"], blocks)["interviewer-1"], {0, 1}
        )
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 1
        )

    def test_same_panel_per_block_can_rotate_panels_between_adjacent_blocks(self):
        blocks = [[0, 1], [2, 3]]
        result = solve_schedule(
            candidates_data=[
                {"id": f"c{index}", "name": f"Candidate {index}", "gender": ""}
                for index in range(4)
            ],
            interviewers_data=[
                {
                    "id": "i1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2, 3],
                },
                {
                    "id": "i2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2, 3],
                },
                {
                    "id": "i3",
                    "name": "Liv",
                    "gender": "",
                    "availability": [0, 1, 2, 3],
                },
                {
                    "id": "i4",
                    "name": "Mia",
                    "gender": "",
                    "availability": [0, 1, 2, 3],
                },
            ],
            panel_size=2,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": True,
            },
            all_slots_data=[0, 1, 2, 3],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        panels_by_block = []
        for block in blocks:
            block_times = set(block)
            block_panels = {
                frozenset(member["id"] for member in item["panel"])
                for item in result["schedule"]
                if item["time"] in block_times
            }
            self.assertEqual(len(block_panels), 1)
            panels_by_block.append(next(iter(block_panels)))
        self.assertTrue(panels_by_block[0].isdisjoint(panels_by_block[1]))

    def test_empty_middle_block_does_not_create_a_false_consecutive_penalty(self):
        blocks = [
            {
                "index": 0,
                "day": 0,
                "start_time": 0,
                "canonical_slots": [0],
                "usable_slots": [0],
                "has_zero_usable_slots": False,
            },
            {
                "index": 2,
                "day": 0,
                "start_time": 2,
                "canonical_slots": [2],
                "usable_slots": [2],
                "has_zero_usable_slots": False,
            },
            {
                "index": 1,
                "day": 0,
                "start_time": 1,
                "canonical_slots": [1],
                "usable_slots": [],
                "has_zero_usable_slots": True,
            },
        ]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 2],
                }
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2],
            blocks_data=[[0], [2], []],
            block_metadata_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(sorted(item["time"] for item in result["schedule"]), [0, 2])
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 0
        )

    def test_compact_days_does_not_override_block_rest_preference(self):
        blocks = [[0, 1], [2, 3], [4, 5]]
        result = solve_schedule(
            candidates_data=[
                {"id": f"candidate-{index}", "name": f"Candidate {index}", "gender": ""}
                for index in range(6)
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2, 3, 4, 5],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": True,
                "same_panel_per_block": False,
            },
            all_slots_data=[0, 1, 2, 3, 4, 5],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 0
        )

    def test_strategy_presets_have_observable_compact_and_workload_outcomes(self):
        candidates = [
            {"id": "c1", "name": "Ada", "gender": ""},
            {"id": "c2", "name": "Eirik", "gender": ""},
        ]
        interviewers = [
            {
                "id": "early",
                "name": "Early",
                "gender": "",
                "availability": [0, 1],
            },
            {
                "id": "late",
                "name": "Late",
                "gender": "",
                "availability": [4, 5],
            },
        ]

        def run(strategy):
            return solve_schedule(
                candidates_data=candidates,
                interviewers_data=interviewers,
                panel_size=1,
                options_data={
                    "initial_strategy": strategy,
                    "allow_overtime": False,
                    "same_panel_per_block": False,
                    "avoid_consecutive_interviewer_blocks": False,
                },
                all_slots_data=[0, 1, 2, 3, 4, 5],
                blocks_data=[[0, 1, 2, 3, 4, 5]],
            )

        balanced = run("balanced")
        compact = run("compact_days")
        workload = run("balance_workload")

        self.assertEqual(compact["status"], "SUCCESS")
        compact_times = sorted(item["time"] for item in compact["schedule"])
        balanced_times = sorted(item["time"] for item in balanced["schedule"])
        workload_times = sorted(item["time"] for item in workload["schedule"])
        # Block fill and day-major earliness are tiers above load spread, so
        # every initial strategy now packs candidates into the earliest slots
        # and lets trailing capacity fall empty ("fyll fra venstre, kutt på
        # slutten"). On an input this small the strategies therefore converge
        # on the same packed shape; the assertion pins that no strategy may
        # reintroduce interior gaps in order to spread load. The strategies
        # still differentiate within the load/continuity tier on larger
        # admissions where holes are unavoidable, and
        # test_block_fill_ranks_above_load_spread_when_they_conflict /
        # test_load_still_spreads_when_blocks_are_already_full pin the tier
        # ordering itself.
        self.assertEqual(compact_times, [0, 1])
        self.assertEqual(balanced_times, [0, 1])
        self.assertEqual(workload_times, [0, 1])

    def test_block_fill_ranks_above_load_spread_when_they_conflict(self):
        # Two interviewers with disjoint availability (early: slots 0-1,
        # late: slots 4-5) and a single 6-slot block. Spreading the load
        # across both interviewers would put one candidate at slot 0 and
        # one at slot 4 - leaving four empty slots in the middle of the
        # block (holes). Block fill is a tier above load spread, so the
        # solver packs both candidates together at the front instead and
        # lets the trailing slots fall empty ("fyll fra venstre, kutt på
        # slutten").
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "early",
                    "name": "Early",
                    "gender": "",
                    "availability": [0, 1],
                },
                {
                    "id": "late",
                    "name": "Late",
                    "gender": "",
                    "availability": [4, 5],
                },
            ],
            panel_size=1,
            options_data={
                "initial_strategy": "balance_workload",
                "allow_overtime": False,
                "same_panel_per_block": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
            all_slots_data=[0, 1, 2, 3, 4, 5],
            blocks_data=[[0, 1, 2, 3, 4, 5]],
        )

        self.assertEqual(result["status"], "SUCCESS")
        times = sorted(item["time"] for item in result["schedule"])
        # Packed at the front, no interior gap: the used slots are the
        # block's first two, and everything after them is empty.
        self.assertEqual(times, [0, 1])

    def test_load_still_spreads_when_blocks_are_already_full(self):
        # The opposite shape: two separate single-slot blocks. Placing both
        # candidates leaves no holes regardless of assignment, so the load
        # spread tier wins and each interviewer takes one block.
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "early",
                    "name": "Early",
                    "gender": "",
                    "availability": [0],
                },
                {
                    "id": "late",
                    "name": "Late",
                    "gender": "",
                    "availability": [4],
                },
            ],
            panel_size=1,
            options_data={
                "initial_strategy": "balance_workload",
                "allow_overtime": False,
                "same_panel_per_block": False,
                "avoid_consecutive_interviewer_blocks": False,
            },
            all_slots_data=[0, 4],
            blocks_data=[[0], [4]],
        )

        self.assertEqual(result["status"], "SUCCESS")
        counts = {}
        for item in result["schedule"]:
            interviewer_id = item["panel"][0]["id"]
            counts[interviewer_id] = counts.get(interviewer_id, 0) + 1
        for interviewer in (
            {"id": "early", "name": "Early"},
            {"id": "late", "name": "Late"},
        ):
            counts.setdefault(interviewer["id"], 0)
        self.assertEqual(max(counts.values()) - min(counts.values()), 0)

    def test_locked_adjacent_block_assignments_survive_and_unlockeds_still_prefer_rest(
        self,
    ):
        blocks = [[0], [1], [2]]
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
                {"id": "c3", "name": "Liv", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1, 2],
                },
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": False,
                "same_panel_per_block": False,
            },
            locked_assignments_data=[
                {
                    "candidate_id": "c1",
                    "candidate": "Ada",
                    "time": 0,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                },
                {
                    "candidate_id": "c2",
                    "candidate": "Eirik",
                    "time": 1,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                },
            ],
            all_slots_data=[0, 1, 2],
            blocks_data=blocks,
        )

        self.assertEqual(result["status"], "SUCCESS")
        schedule_by_candidate = {
            item["candidate_id"]: item for item in result["schedule"]
        }
        self.assertTrue(schedule_by_candidate["c1"]["locked"])
        self.assertTrue(schedule_by_candidate["c2"]["locked"])
        self.assertEqual(schedule_by_candidate["c3"]["panel"][0]["id"], "interviewer-2")
        self.assertEqual(
            self._consecutive_block_penalties(result["schedule"], blocks), 1
        )

    def test_continuity_keeps_new_interview_adjacent_to_locked_slot(self):
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "i1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1, 2, 3],
                }
            ],
            panel_size=1,
            options_data={
                "allow_overtime": False,
                "prioritize_continuity": True,
                "same_panel_per_block": True,
            },
            locked_assignments_data=[
                {
                    "candidate_id": "c1",
                    "candidate": "Ada",
                    "time": 2,
                    "panel": [{"id": "i1", "name": "Ola"}],
                }
            ],
            all_slots_data=[0, 1, 2, 3],
            blocks_data=[[0, 1, 2, 3]],
        )

        self.assertEqual(result["status"], "SUCCESS")
        placed = {item["candidate_id"]: item["time"] for item in result["schedule"]}
        self.assertEqual(placed["c1"], 2)
        self.assertEqual(placed["c2"], 1)

    def test_continuity_keeps_earliness_in_its_own_tier(self):
        captured = {}
        original_builder = solve_schedule_module._build_lexicographic_objective

        def capture_objective_tiers(tiers):
            captured["tiers"] = tiers
            return original_builder(tiers)

        with mock.patch.object(
            solve_schedule_module,
            "_build_lexicographic_objective",
            side_effect=capture_objective_tiers,
        ):
            res = solve_schedule(
                candidates_data=[
                    {"id": "c1", "name": "Ada", "gender": ""},
                    {"id": "c2", "name": "Eirik", "gender": ""},
                ],
                interviewers_data=[
                    {
                        "id": "interviewer-1",
                        "name": "Ola",
                        "gender": "",
                        "availability": [0, 1],
                    }
                ],
                panel_size=1,
                options_data={
                    "allow_overtime": False,
                    "prioritize_continuity": True,
                    "same_panel_per_block": False,
                    # Pinned so the captured tier maximum stays independent
                    # of the application-default load-balance weight.
                    "load_balance_weight": 4,
                },
                all_slots_data=[0, 1],
                blocks_data=[[0, 1]],
            )

        self.assertEqual(res["status"], "SUCCESS")
        tier_names = [tier.name for tier in captured["tiers"]]
        self.assertEqual(
            tier_names,
            [
                "unplaced_candidates",
                "availability",
                "adjacent_block_rest",
                "block_fill",
                "load_and_continuity",
                "earliness",
                "stability_tie_breaker",
            ],
        )
        continuity_tier = next(
            tier for tier in captured["tiers"] if tier.name == "load_and_continuity"
        )
        self.assertEqual(continuity_tier.maximum, 88)
        self.assertEqual(tier_names.count("earliness"), 1)

    def test_enforce_same_gender_matches_panel_to_candidate(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Adam", "gender": "M"},
                {"id": "candidate-2", "name": "Ida", "gender": "F"},
            ],
            "interviewers": [
                {"id": "int-m", "name": "Ola", "gender": "M", "availability": [0, 1]},
                {"id": "int-f", "name": "Kari", "gender": "F", "availability": [0, 1]},
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "options": {"enforce_same_gender": True, "allow_overtime": False},
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        panels = {
            item["candidate_id"]: [member["id"] for member in item["panel"]]
            for item in res.data["schedule"]
        }
        self.assertEqual(panels["candidate-1"], ["int-m"])
        self.assertEqual(panels["candidate-2"], ["int-f"])

    def test_result_reports_optimality(self):
        res = self._solve(
            {
                "candidates": [{"id": "c1", "name": "Ada", "gender": ""}],
                "interviewers": [
                    {"id": "i1", "name": "Ola", "gender": "M", "availability": [0]}
                ],
                "panel_size": 1,
            }
        )

        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertTrue(res.data["optimal"])

    def test_stale_availability_outside_open_slots_is_never_scheduled(self):
        for allow_overtime in (True, False):
            with self.subTest(allow_overtime=allow_overtime):
                payload = {
                    "candidates": [{"id": "candidate-1", "name": "Ada", "gender": ""}],
                    "interviewers": [
                        {
                            "id": "interviewer-1",
                            "name": "Ola",
                            "gender": "M",
                            "availability": [0, 2],
                        },
                    ],
                    "panel_size": 1,
                    "all_slots": [2, 3],
                    "options": {"allow_overtime": allow_overtime},
                }

                res = self._solve(payload)

                self.assertEqual(res.status_code, status.HTTP_200_OK)
                self.assertEqual(res.data["status"], "SUCCESS")
                self.assertEqual(res.data["schedule"][0]["time"], 2)

    def test_oversized_instance_fails_fast_with_a_clear_error(self):
        result = solve_schedule(
            candidates_data=[
                {"id": f"c{i}", "name": f"Kandidat {i}", "gender": ""}
                for i in range(100)
            ],
            interviewers_data=[
                {
                    "id": f"i{j}",
                    "name": f"Intervjuer {j}",
                    "gender": "",
                    "availability": list(range(1000)),
                }
                for j in range(30)
            ],
            panel_size=2,
        )

        self.assertEqual(result["status"], "ERROR")
        self.assertEqual(result["schedule"], [])
        self.assertIn("for stor", result["error"])

    def test_lock_without_gender_data_survives_a_resolve(self):
        base = dict(
            candidates_data=[{"id": "c1", "name": "Adam", "gender": "M"}],
            interviewers_data=[
                {"id": "i1", "name": "Ola", "gender": "", "availability": [0]},
            ],
            panel_size=1,
            options_data={"enforce_same_gender": True, "allow_overtime": False},
            all_slots_data=[0],
        )

        first = solve_schedule(**base)
        self.assertEqual(first["status"], "SUCCESS")

        second = solve_schedule(
            **base,
            locked_assignments_data=[
                {
                    "candidate_id": "c1",
                    "candidate": "Adam",
                    "time": first["schedule"][0]["time"],
                    "panel": [
                        {"id": member["id"], "name": member["name"]}
                        for member in first["schedule"][0]["panel"]
                    ],
                }
            ],
        )

        self.assertEqual(second["status"], "SUCCESS")
        self.assertEqual(second["locked_conflicts"], [])

    def test_capacity_shortage_is_not_blamed_on_gender_without_gender_data(self):
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Adam", "gender": "M"},
                {"id": "c2", "name": "Jon", "gender": "M"},
            ],
            interviewers_data=[
                {"id": "i1", "name": "Ola", "gender": "", "availability": [0]},
            ],
            panel_size=1,
            options_data={"enforce_same_gender": True, "allow_overtime": False},
            all_slots_data=[0],
        )

        self.assertEqual(result["status"], "PARTIAL")
        self.assertEqual(len(result["unplaceable"]), 1)
        self.assertEqual(
            result["unplaceable"][0]["reason"],
            "Ikke nok intervjukapasitet i de åpne tidslukene.",
        )

    def test_identical_solves_are_reproducible_on_ties(self):
        payload = dict(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {"id": "i1", "name": "Ola", "gender": "", "availability": [0, 1]},
                {"id": "i2", "name": "Ida", "gender": "", "availability": [0, 1]},
            ],
            panel_size=1,
            all_slots_data=[0, 1],
        )

        first = solve_schedule(**payload)

        self.assertEqual(first["status"], "SUCCESS")
        for _ in range(3):
            self.assertEqual(solve_schedule(**payload), first)

    def test_warm_start_keeps_previous_panel_on_a_tie(self):
        result = solve_schedule(
            candidates_data=[{"id": "c1", "name": "Ada", "gender": ""}],
            interviewers_data=[
                {"id": "i1", "name": "Ola", "gender": "", "availability": [0, 1]},
                {"id": "i2", "name": "Ida", "gender": "", "availability": [0, 1]},
            ],
            panel_size=1,
            all_slots_data=[0, 1],
            previous_schedule_data=[
                {"candidate_id": "c1", "time": 0, "panel": [{"id": "i2"}]},
            ],
        )

        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual(result["schedule"][0]["time"], 0)
        self.assertEqual(
            [member["id"] for member in result["schedule"][0]["panel"]], ["i2"]
        )

    def test_warm_start_keeps_previous_slots_on_a_tie(self):
        candidates = [
            {"id": "c1", "name": "Ada", "gender": ""},
            {"id": "c2", "name": "Eirik", "gender": ""},
        ]
        interviewers = [
            {"id": "i1", "name": "Ola", "gender": "M", "availability": [0, 1]},
            {"id": "i2", "name": "Ida", "gender": "F", "availability": [0, 1]},
        ]
        previous = [
            {"candidate_id": "c2", "time": 0, "panel": [{"id": "i1"}]},
            {"candidate_id": "c1", "time": 1, "panel": [{"id": "i2"}]},
        ]

        result = solve_schedule(
            candidates_data=candidates,
            interviewers_data=interviewers,
            panel_size=1,
            all_slots_data=[0, 1],
            previous_schedule_data=previous,
        )

        self.assertEqual(result["status"], "SUCCESS")
        placed = {item["candidate_id"]: item["time"] for item in result["schedule"]}
        self.assertEqual(placed["c2"], 0)
        self.assertEqual(placed["c1"], 1)

    def test_repair_preserves_unaffected_row_before_rebalancing_load(self):
        result = solve_schedule(
            candidates_data=[
                {"id": "c1", "name": "Ada", "gender": ""},
                {"id": "c2", "name": "Eirik", "gender": ""},
            ],
            interviewers_data=[
                {
                    "id": "i1",
                    "name": "Ola",
                    "gender": "",
                    "availability": [0, 1],
                    "biased": ["c1"],
                },
                {
                    "id": "i2",
                    "name": "Ida",
                    "gender": "",
                    "availability": [0, 1],
                    "biased": [],
                },
                {
                    "id": "i3",
                    "name": "Emil",
                    "gender": "",
                    "availability": [0, 1],
                    "biased": [],
                },
            ],
            panel_size=1,
            all_slots_data=[0, 1],
            options_data={
                "prioritize_continuity": False,
                "repair_mode": True,
                "repair_strategy": "minimum_change",
            },
            previous_schedule_data=[
                {"candidate_id": "c1", "time": 0, "panel": [{"id": "i1"}]},
                {"candidate_id": "c2", "time": 1, "panel": [{"id": "i2"}]},
            ],
        )

        self.assertEqual(result["status"], "SUCCESS")
        repaired = {item["candidate_id"]: item for item in result["schedule"]}
        self.assertEqual(repaired["c1"]["time"], 0)
        self.assertNotEqual(repaired["c1"]["panel"][0]["id"], "i1")
        self.assertEqual(repaired["c2"]["time"], 1)
        self.assertEqual(repaired["c2"]["panel"][0]["id"], "i2")

    def test_repair_strategies_choose_substitute_or_whole_block(self):
        candidates = [
            {"id": f"c{index}", "name": f"Candidate {index}", "gender": ""}
            for index in range(4)
        ]
        interviewers = [
            {
                "id": "i1",
                "name": "Anna",
                "gender": "",
                "availability": [0, 1, 2, 3],
                "biased": ["c1"],
            },
            {
                "id": "i2",
                "name": "Nora",
                "gender": "",
                "availability": [0, 1, 2, 3],
                "biased": [],
            },
        ]
        previous = [
            {
                "candidate_id": f"c{index}",
                "candidate": f"Candidate {index}",
                "time": index,
                "panel": [{"id": "i1", "name": "Anna"}],
            }
            for index in range(4)
        ]

        def repair(strategy):
            return solve_schedule(
                candidates_data=candidates,
                interviewers_data=interviewers,
                panel_size=1,
                all_slots_data=[0, 1, 2, 3],
                blocks_data=[[0, 1, 2, 3]],
                options_data={
                    "allow_overtime": False,
                    "prioritize_continuity": False,
                    "same_panel_per_block": True,
                    "repair_mode": True,
                    "repair_strategy": strategy,
                },
                previous_schedule_data=previous,
            )

        minimum_change = repair("minimum_change")
        preserve_panels = repair("preserve_panels")

        self.assertEqual(minimum_change["status"], "SUCCESS")
        self.assertEqual(preserve_panels["status"], "SUCCESS")
        self.assertEqual(
            [row["panel"][0]["id"] for row in minimum_change["schedule"]],
            ["i1", "i2", "i1", "i1"],
        )
        self.assertEqual(
            [row["panel"][0]["id"] for row in preserve_panels["schedule"]],
            ["i2", "i2", "i2", "i2"],
        )
        self.assertEqual(
            [row["time"] for row in preserve_panels["schedule"]],
            [0, 1, 2, 3],
        )

    def test_fills_day_one_completely_before_touching_day_two(self):
        """Segmented packing: the solver fills whole days in order, so a
        shortfall can only land on the latest used day, never leave an
        earlier day half-empty while a later day is used."""
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
                {"id": "candidate-3", "name": "Ola", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0, 1, 1440, 1441],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1, 1440, 1441],
            "options": {"enforce_same_gender": False, "allow_overtime": False},
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(
            sorted(item["time"] for item in res.data["schedule"]),
            [0, 1, 1440],
        )
        self.assertEqual(res.data["filled_day_count"], 1)

    def test_filled_days_count_only_slots_with_available_panels(self):
        """A day counts as full when every slot a panel could staff holds an
        interview. Slot 1 has no available interviewer, so filling slot 0
        plus both day-2 slots makes both days full."""
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
                {"id": "candidate-3", "name": "Ola", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0, 1440, 1441],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1, 1440, 1441],
            "options": {"enforce_same_gender": False, "allow_overtime": False},
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(
            sorted(item["time"] for item in res.data["schedule"]),
            [0, 1440, 1441],
        )
        self.assertEqual(res.data["filled_day_count"], 2)

    def test_partial_result_still_reports_filled_days(self):
        payload = {
            "candidates": [
                {"id": f"candidate-{i}", "name": f"Kandidat {i}", "gender": ""}
                for i in range(5)
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [0, 1, 1440, 1441],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1, 1440, 1441],
            "options": {"enforce_same_gender": False, "allow_overtime": False},
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        self.assertEqual(len(res.data["schedule"]), 4)
        self.assertEqual(res.data["filled_day_count"], 2)
        self.assertEqual(len(res.data["unplaceable"]), 1)

    def test_locked_rows_are_pinned_without_rebalance(self):
        """D2: strict by default. The locked row keeps its time and panel even
        though moving it would let the remaining candidate place."""
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [1],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0],
                    "biased": ["candidate-2"],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "options": {"enforce_same_gender": False, "allow_overtime": False},
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 1,
                    "panel": [{"id": "interviewer-1", "name": "Ida"}],
                }
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        locked = next(
            item
            for item in res.data["schedule"]
            if item["candidate_id"] == "candidate-1"
        )
        self.assertEqual(locked["time"], 1)
        self.assertEqual(locked["panel"][0]["id"], "interviewer-1")
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-2"],
        )

    def test_rebalance_locked_demotes_draft_locks_to_soft_preferences(self):
        """D2: with rebalance_locked the worker demotes draft locks into
        previous_schedule, so the solver may re-flow the locked row to place
        the candidate it was blocking."""
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": ""},
                {"id": "candidate-2", "name": "Eirik", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [1],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0],
                    "biased": ["candidate-2"],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
                "rebalance_locked": True,
            },
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 1,
                    "panel": [{"id": "interviewer-1", "name": "Ida"}],
                }
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        placed = {item["candidate_id"]: item for item in res.data["schedule"]}
        # The biased interviewer cannot take candidate-2, so the solver keeps
        # interviewer-1 for candidate-2 and moves the previously locked row.
        self.assertEqual(placed["candidate-2"]["time"], 1)
        self.assertEqual(placed["candidate-2"]["panel"][0]["id"], "interviewer-1")
        self.assertEqual(placed["candidate-1"]["time"], 0)
        self.assertEqual(placed["candidate-1"]["panel"][0]["id"], "interviewer-2")
        # Both slots sit on day 0 and both are used, so the one scoped day is
        # full.
        self.assertEqual(res.data["filled_day_count"], 1)


class RebalancePolicyUnitTestCase(SimpleTestCase):
    """The worker's lock-demotion policy is a pure function of the request and
    the published boundary; test it without a database."""

    def _request(self):
        return {
            "options": {"rebalance_locked": True},
            "locked_assignments": [
                {
                    "candidate_id": "c1",
                    "time": 0,
                    "panel": [{"id": "i1"}],
                },
                {
                    "candidate_id": "c2",
                    "time": 1440,
                    "panel": [{"id": "i1"}],
                },
            ],
            "previous_schedule": [],
        }

    def test_published_day_stays_locked_and_draft_day_is_demoted(self):
        result = _demote_draft_locks(
            self._request(), date(2026, 9, 1), date(2026, 9, 1)
        )
        self.assertEqual(
            [row["candidate_id"] for row in result["locked_assignments"]],
            ["c1"],
        )
        self.assertEqual(
            [row["candidate_id"] for row in result["previous_schedule"]],
            ["c2"],
        )

    def test_without_the_flag_nothing_moves(self):
        request = self._request()
        request["options"] = {"rebalance_locked": False}
        result = _demote_draft_locks(request, date(2026, 9, 1), date(2026, 9, 1))
        self.assertEqual(len(result["locked_assignments"]), 2)
        self.assertEqual(result["previous_schedule"], [])

    def test_without_published_boundary_all_locks_are_demoted(self):
        result = _demote_draft_locks(self._request(), None, None)
        self.assertEqual(result["locked_assignments"], [])
        self.assertEqual(
            [row["candidate_id"] for row in result["previous_schedule"]],
            ["c1", "c2"],
        )

    def test_existing_previous_schedule_rows_are_not_duplicated(self):
        request = self._request()
        request["previous_schedule"] = [
            {"candidate_id": "c2", "time": 1440, "panel": [{"id": "i1"}]}
        ]
        result = _demote_draft_locks(request, date(2026, 9, 1), date(2026, 9, 1))
        self.assertEqual(
            [row["candidate_id"] for row in result["previous_schedule"]],
            ["c2"],
        )


class BuildSolveOptionsUnitTestCase(SimpleTestCase):
    """`options` carries request-level policy the CP-SAT model never reads
    (e.g. `rebalance_locked`, consumed by the worker). Those keys must not
    reach `SolveOptions(**...)`, which would raise TypeError."""

    def test_request_level_keys_are_dropped(self):
        options = build_solve_options(
            {"rebalance_locked": True, "enforce_same_gender": True}
        )
        self.assertTrue(options.enforce_same_gender)
        self.assertFalse(hasattr(options, "rebalance_locked"))

    def test_unknown_key_does_not_raise(self):
        # A future serializer field the dataclass does not know about yet.
        build_solve_options({"some_new_flag": True})

    def test_known_keys_are_still_applied(self):
        options = build_solve_options({"max_solver_seconds": 42.0})
        self.assertEqual(options.max_solver_seconds, 42.0)
