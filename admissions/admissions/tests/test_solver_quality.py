from types import SimpleNamespace

from django.core.management import call_command
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import MEMBER
from admissions.admissions.models import Group, LegoUser, Membership, SolveJob
from admissions.admissions.solve_schedule import solve_schedule
from admissions.admissions.tests.utils import create_admission

ENVELOPE_KEYS = ("schedule", "unplaceable", "locked_conflicts")


class SolverQualityTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Kvalitetskom", lego_id=996)
        self.user = LegoUser.objects.create(username="quality-user", lego_id=995)
        Membership.objects.create(user=self.user, role=MEMBER, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="quality-opptak")
        self.admission.admin_groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("solve-schedule")

    def _solve(self, payload):
        """Enqueue a solve, run the worker once, and return a response-like
        object whose .data is the solve result envelope. Validation/permission
        failures (non-202) are returned verbatim so those assertions still hold.
        """
        res = self.client.post(
            self.url,
            {**payload, "admission_slug": self.admission.slug},
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
