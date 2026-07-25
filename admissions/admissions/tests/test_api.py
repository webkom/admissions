from types import SimpleNamespace

from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING, RETIREE
from admissions.admissions.models import (
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.tests.utils import (
    ScheduleRevisionAPIClient,
    create_admission,
    fake_timedelta,
)


class EditGroupTestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(
            name="Webkom",
            lego_id=3,
            description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!",
        )
        self.arrkom = Group.objects.create(
            name="Arrkom",
            lego_id=4,
            description="Arrkom arrangerer ting",
            response_label="Søk Arrkom fordi vi har det kult!",
        )

        self.pleb = LegoUser.objects.create(lego_id=3)
        self.webkom_leader = LegoUser.objects.create(
            username="webkom_leader", lego_id=4
        )
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        self.webkom_recruiter = LegoUser.objects.create(
            username="webkom_recruiter", lego_id=5
        )
        Membership.objects.create(
            user=self.webkom_recruiter, role=RECRUITING, group=self.webkom
        )

        self.edit_group_data = {
            "response_text": "Halla, Webkom er ikke noe gucci",
            "description": "Webkoms maskott er en rød ku(le)",
        }

    def test_pleb_cannot_edit_group(self):
        self.client.force_authenticate(user=self.pleb)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_group_leader_cannot_edit_other_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_group_recruiter_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_cannot_edit_group(self):
        staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=6, is_staff=True
        )
        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_admin_group_member_cannot_edit_group(self):
        admission = create_admission(slug="inactive-group-access")
        admission.groups.add(self.arrkom)
        admission.admin_groups.add(self.webkom)
        retired = LegoUser.objects.create(username="retired-webkom", lego_id=60)
        Membership.objects.create(user=retired, role=RETIREE, group=self.webkom)
        self.client.force_authenticate(user=retired)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # What about when not logged in aka. have a user? Rewrite api (remove LoginRequiredMixins
    # from views to stop from redirecting, and handle redirecting ourselves with permissions.
    # In this way, when using the api and not viewing in frontend, you are not redirected (disabled).
    # Disable redirecting when using api not in frontend. Or something along those lines).

    # Only testing with PATCH now, might want to test with other methods as well


class EditAdmissionTestCase(APITestCase):
    def setUp(self):
        self.staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=1, is_staff=True
        )
        self.admission = create_admission(created_by=self.staff_user)
        self.admin_group = Group.objects.create(name="Admission admins", lego_id=15)
        self.committee = Group.objects.create(name="Committee", lego_id=16)
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.committee)
        self.edit_admission_data = {
            "title": "Plebkom opptak 2020",
            "open_from": fake_timedelta(days=10),
            "public_deadline": fake_timedelta(days=11),
            "closed_from": fake_timedelta(days=12),
            "admin_groups": [str(self.admin_group.pk)],
            "groups": [str(self.committee.pk)],
        }

    def test_pleb_cannot_edit_admission(self):
        pleb = LegoUser.objects.create(lego_id=7)
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_cannot_edit_admission(self):
        bedkom_leader = LegoUser.objects.create(username="bedkomleader", lego_id=8)
        bedkom = Group.objects.create(name="Bedkom", lego_id=7)
        Membership.objects.create(user=bedkom_leader, role=LEADER, group=bedkom)

        self.client.force_authenticate(user=bedkom_leader)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_member_cannot_edit_admission(self):
        bedkom_member = LegoUser.objects.create(username="bedkommember", lego_id=9)
        bedkom = Group.objects.create(name="Bedkom", lego_id=6)
        Membership.objects.create(user=bedkom_member, role=MEMBER, group=bedkom)

        self.client.force_authenticate(user=bedkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_edit_admission(self):
        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_webkom_can_edit_admission(self):
        webkom_member = LegoUser.objects.create(
            username="webber", lego_id=10, is_staff=True
        )
        webkom = Group.objects.create(name="Webkom", lego_id=13)
        Membership.objects.create(user=webkom_member, role=MEMBER, group=webkom)

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_inactive_webkom_member_cannot_edit_admission(self):
        retired = LegoUser.objects.create(username="retired", lego_id=12)
        webkom = Group.objects.create(name="Webkom", lego_id=14)
        Membership.objects.create(user=retired, role=RETIREE, group=webkom)
        self.client.force_authenticate(user=retired)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_user_creator_can_edit_admission(self):

        self.client.force_authenticate(user=self.staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_nocreator_cannot_edit_admission(self):
        staff_user = LegoUser.objects.create(
            username="staffie", lego_id=11, is_staff=True
        )

        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(
    ALLOW_SYNTHETIC_SOLVER_INPUT=True,
    ALLOW_UNMARKED_SYNTHETIC_SOLVER_INPUT=True,
)
class SolveScheduleViewTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Solverkom", lego_id=998)
        self.user = LegoUser.objects.create(username="solver-user", lego_id=999)
        Membership.objects.create(user=self.user, role=RECRUITING, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="solve-opptak")
        self.admission.admin_groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("solve-schedule")

    def _solve(self, payload):
        """Enqueue, run the worker once, and return a response-like object whose
        .data is the solve result. Non-202 responses (validation/permission) are
        returned verbatim."""
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

    def test_requires_admission_slug(self):
        res = self.client.post(
            self.url,
            {"candidates": [], "interviewers": [], "panel_size": 1},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unprivileged_user_cannot_solve(self):
        outsider = LegoUser.objects.create(username="solver-outsider", lego_id=997)
        self.client.force_authenticate(user=outsider)

        res = self._solve({"candidates": [], "interviewers": [], "panel_size": 1})

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_recruiter_cannot_run_global_solver(self):
        committee = Group.objects.create(name="Bedkom", lego_id=996)
        recruiter = LegoUser.objects.create(username="solver-recruiter", lego_id=995)
        Membership.objects.create(user=recruiter, role=RECRUITING, group=committee)
        self.admission.groups.add(committee)
        self.client.force_authenticate(user=recruiter)

        res = self._solve({"candidates": [], "interviewers": [], "panel_size": 1})

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_panel_size_is_rejected(self):
        res = self._solve({"candidates": [], "interviewers": [], "panel_size": 0})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blank_candidate_gender_is_allowed(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Anna", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [8],
                },
            ],
            "panel_size": 1,
            "options": {
                "enforce_same_gender": True,
                "allow_overtime": False,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")

    def test_unplaceable_candidate_is_reported(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Anna", "gender": "F"},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-2",
                    "name": "Per",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-3",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [],
                },
            ],
            "panel_size": 2,
            "options": {
                "enforce_same_gender": True,
                "allow_overtime": False,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-1"],
        )

    def test_same_gender_constraint_can_be_disabled(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Anna", "gender": "F"},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-2",
                    "name": "Per",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-3",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [],
                },
            ],
            "panel_size": 2,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(len(res.data["schedule"]), 1)
        self.assertEqual(res.data["schedule"][0]["candidate_id"], "candidate-1")
        self.assertTrue(
            all("id" in member for member in res.data["schedule"][0]["panel"])
        )

    def test_overtime_can_be_disabled(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Erik", "gender": "M"},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-2",
                    "name": "Per",
                    "gender": "M",
                    "availability": [],
                },
            ],
            "panel_size": 2,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PARTIAL")
        self.assertEqual(
            [c["candidate_id"] for c in res.data["unplaceable"]],
            ["candidate-1"],
        )

    def test_overtime_can_be_enabled(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Erik", "gender": "M"},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [8],
                },
                {
                    "id": "interviewer-2",
                    "name": "Per",
                    "gender": "M",
                    "availability": [],
                },
            ],
            "panel_size": 2,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": True,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(len(res.data["schedule"]), 1)
        self.assertTrue(
            any(member["is_overtime"] for member in res.data["schedule"][0]["panel"])
        )

    def test_sequential_scheduling_works_across_empty_slots_with_overtime(self):
        payload = {
            "candidates": [
                {"id": "c1", "name": "C1", "gender": ""},
                {"id": "c2", "name": "C2", "gender": ""},
            ],
            "interviewers": [
                {
                    "id": "i1",
                    "name": "I1",
                    "gender": "M",
                    "availability": [0],
                },
            ],
            "panel_size": 1,
            "all_slots": [0, 1],
            "options": {
                "allow_overtime": True,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(len(res.data["schedule"]), 2)
        times = sorted([item["time"] for item in res.data["schedule"]])
        self.assertEqual(times, [0, 1])

    def test_continuity_prefers_earliest_consecutive_slots(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": "F"},
                {"id": "candidate-2", "name": "Eirik", "gender": "M"},
            ],
            "interviewers": [
                {
                    "id": "interviewer-1",
                    "name": "Ola",
                    "gender": "M",
                    "availability": [0, 2],
                },
                {
                    "id": "interviewer-2",
                    "name": "Ida",
                    "gender": "F",
                    "availability": [1, 2],
                },
            ],
            "panel_size": 1,
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
                "prioritize_continuity": True,
                "continuity_weight": 20,
            },
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        self.assertEqual(
            sorted(item["time"] for item in res.data["schedule"]),
            [0, 1],
        )

    def test_locked_assignments_are_preserved(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": "F"},
                {"id": "candidate-2", "name": "Eirik", "gender": "M"},
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
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 1,
                    "panel": [{"id": "interviewer-2", "name": "Ida"}],
                }
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "SUCCESS")
        locked = next(
            item
            for item in res.data["schedule"]
            if item["candidate_id"] == "candidate-1"
        )
        self.assertEqual(locked["time"], 1)
        self.assertEqual(locked["panel"][0]["id"], "interviewer-2")
        self.assertTrue(locked["locked"])

    def test_locked_assignment_with_conflict_is_reported(self):
        payload = {
            "candidates": [
                {"id": "candidate-1", "name": "Ada", "gender": "F"},
            ],
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
            "options": {
                "enforce_same_gender": False,
                "allow_overtime": False,
            },
            "locked_assignments": [
                {
                    "candidate_id": "candidate-1",
                    "candidate": "Ada",
                    "time": 0,
                    "panel": [{"id": "interviewer-1", "name": "Ola"}],
                }
            ],
        }

        res = self._solve(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "LOCKED_CONFLICT")
        self.assertEqual(res.data["schedule"], [])
        self.assertIn("locked_conflicts", res.data)


class SavedScheduleViewTestCase(APITestCase):
    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=300)
        self.admin_user = LegoUser.objects.create(
            username="schedule-admin", lego_id=301
        )
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.admin_group
        )
        self.admission = create_admission(
            created_by=self.admin_user, slug="schedule-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
        )
        self.client.force_authenticate(user=self.admin_user)

    def test_grid_change_clears_existing_plan(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[{"candidate": "Ada", "time": 8, "panel": []}],
            start_date="2026-04-20",
            end_date="2026-04-24",
            session_duration=60,
            enabled_slots=["2026-04-20:480"],
            day_start_minute=480,
            day_end_minute=1080,
            is_distributed=False,
        )

        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-25",
            "session_duration": 45,
            "enabled_slots": ["2026-04-21:540", "2026-04-21:585"],
            "day_start_minute": 540,
            "day_end_minute": 900,
            "is_distributed": False,
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        self.assertFalse(res.data["is_distributed"])
        self.assertEqual(res.data["start_date"], "2026-04-21")
        self.assertEqual(res.data["end_date"], "2026-04-25")
        self.assertEqual(
            res.data["enabled_slots"], ["2026-04-21|540", "2026-04-21|585"]
        )
        self.assertEqual(
            res.data["enabled_windows"],
            [{"date": "2026-04-21", "start_minute": 540, "end_minute": 630}],
        )
        self.assertEqual(res.data["day_start_minute"], 540)
        self.assertEqual(res.data["day_end_minute"], 900)

    def test_can_create_schedule_from_config_only_payload(self):
        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-25",
            "session_duration": 45,
            "enabled_slots": ["2026-04-21:540", "2026-04-21:585"],
            "day_start_minute": 540,
            "day_end_minute": 900,
            "is_distributed": False,
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(res.data["start_date"], "2026-04-21")
        self.assertEqual(res.data["end_date"], "2026-04-25")
        self.assertEqual(res.data["session_duration"], 45)
        self.assertEqual(
            res.data["enabled_slots"], ["2026-04-21|540", "2026-04-21|585"]
        )
        self.assertEqual(
            res.data["enabled_windows"],
            [{"date": "2026-04-21", "start_minute": 540, "end_minute": 630}],
        )
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).schedule, []
        )

    def test_can_save_enabled_windows_and_derive_slots(self):
        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-21",
            "session_duration": 30,
            "enabled_windows": [
                {"date": "2026-04-21", "start_minute": 540, "end_minute": 630}
            ],
            "day_start_minute": 540,
            "day_end_minute": 900,
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data["enabled_slots"],
            ["2026-04-21|540", "2026-04-21|570", "2026-04-21|600"],
        )
        self.assertEqual(res.data["enabled_windows"], payload["enabled_windows"])

    def test_duration_change_clears_submitted_availability_slots(self):
        interviewer = LegoUser.objects.create(username="available-user", lego_id=304)
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=interviewer,
            slots=["2026-04-21|540"],
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-21",
            end_date="2026-04-21",
            session_duration=60,
            enabled_windows=[
                {"date": "2026-04-21", "start_minute": 540, "end_minute": 660}
            ],
            enabled_slots=["2026-04-21|540", "2026-04-21|600"],
            day_start_minute=540,
            day_end_minute=900,
        )

        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-21",
            "session_duration": 30,
            "enabled_windows": [
                {"date": "2026-04-21", "start_minute": 540, "end_minute": 660}
            ],
            "day_start_minute": 540,
            "day_end_minute": 900,
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            user=interviewer,
        )
        self.assertEqual(availability.slots, [])
        self.assertIsNone(availability.submitted_grid_generation)

    def test_block_break_change_clears_existing_plan(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[{"candidate": "Ada", "time": 8, "panel": []}],
            start_date="2026-04-21",
            end_date="2026-04-21",
            session_duration=30,
            enabled_windows=[
                {"date": "2026-04-21", "start_minute": 540, "end_minute": 660}
            ],
            enabled_slots=[
                "2026-04-21|540",
                "2026-04-21|570",
                "2026-04-21|600",
                "2026-04-21|630",
            ],
            day_start_minute=540,
            day_end_minute=900,
            chunk_size=4,
            chunk_break_minutes=0,
            is_distributed=True,
        )

        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-21",
            "session_duration": 30,
            "enabled_windows": [
                {"date": "2026-04-21", "start_minute": 540, "end_minute": 600},
                {"date": "2026-04-21", "start_minute": 630, "end_minute": 690},
            ],
            "day_start_minute": 540,
            "day_end_minute": 900,
            "chunk_size": 2,
            "chunk_break_minutes": 30,
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        self.assertFalse(res.data["is_distributed"])

    def test_recruiter_cannot_save_global_schedule(self):
        recruiter_group = Group.objects.create(name="Bedkom", lego_id=302)
        recruiter_user = LegoUser.objects.create(
            username="schedule-recruiter", lego_id=303
        )
        Membership.objects.create(
            user=recruiter_user,
            role=RECRUITING,
            group=recruiter_group,
        )
        self.admission.groups.add(recruiter_group)
        self.client.force_authenticate(user=recruiter_user)

        payload = {
            "start_date": "2026-04-21",
            "end_date": "2026-04-25",
            "session_duration": 45,
            "enabled_slots": ["2026-04-21:540", "2026-04-21:585"],
            "day_start_minute": 540,
            "day_end_minute": 900,
            "is_distributed": False,
            "name_visibility": "committee",
        }

        res = self.client.post(self.url, payload, format="json")

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class InterviewAvailabilityViewTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Komite", lego_id=401)
        self.user = LegoUser.objects.create(username="committee-member", lego_id=402)
        Membership.objects.create(user=self.user, role=MEMBER, group=self.group)
        self.admission = create_admission(
            created_by=self.user, slug="availability-test"
        )
        self.admission.groups.add(self.group)
        self.url = reverse(
            "interview-availability",
            kwargs={"admission_slug": self.admission.slug},
        )
        self.client.force_authenticate(user=self.user)

    def test_can_save_conflicts_without_overwriting_slots(self):
        applicant = LegoUser.objects.create(username="eirik-applicant", lego_id=403)
        application = UserApplication.objects.create(
            user=applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=application,
            group=self.group,
            text="Komite application",
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[
                {
                    "candidate_id": str(application.pk),
                    "candidate": "Eirik Applicant",
                    "time": 540,
                    "panel": [
                        {
                            "id": str(self.user.pk),
                            "name": "Committee Member",
                        }
                    ],
                }
            ],
            start_date="2026-04-21",
            session_duration=60,
            is_distributed=False,
            conflict_review_open=True,
            name_visibility="committee",
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.user,
            slots=["2026-04-21:540"],
            conflicts=["real-candidate-ada"],
        )

        res = self.client.post(
            self.url,
            {"conflicts": [str(application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["slots"], ["2026-04-21:540"])
        self.assertEqual(res.data["conflicts"], [str(application.pk)])

    def test_cannot_save_conflicts_before_names_are_visible(self):
        res = self.client.post(
            self.url,
            {"conflicts": ["real-candidate-eirik"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.user,
            ).exists()
        )

    def test_get_returns_saved_conflicts_for_participant(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.user,
            slots=["2026-04-21:540"],
            conflicts=["real-candidate-ada"],
        )

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["conflicts"], [])


class InterviewCandidatesViewTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Intervjukomite", lego_id=501)
        self.user = LegoUser.objects.create(username="committee-viewer", lego_id=502)
        Membership.objects.create(user=self.user, role=MEMBER, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="candidate-list")
        self.admission.groups.add(self.group)
        self.applicant = LegoUser.objects.create(
            username="ada",
            first_name="Ada",
            last_name="Lovelace",
            lego_id=503,
        )
        self.application = UserApplication.objects.create(
            user=self.applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.group,
            text="Intervjukomite application",
        )
        self.url = reverse(
            "interview-candidates",
            kwargs={"admission_slug": self.admission.slug},
        )
        self.client.force_authenticate(user=self.user)

    def test_candidate_names_hidden_from_committee_by_default(self):
        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_candidate_names_hidden_when_not_released_to_committee(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            name_visibility="admin_only",
        )

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_committee_member_sees_names_when_released(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            is_distributed=True,
            name_visibility="committee",
        )

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            [
                {
                    "id": str(self.application.pk),
                    "name": "Ada Lovelace",
                }
            ],
        )

    def test_recruiter_sees_only_candidates_for_own_committee(self):
        recruiter_group = Group.objects.create(name="Bedkom", lego_id=504)
        recruiter_user = LegoUser.objects.create(
            username="candidate-recruiter", lego_id=505
        )
        Membership.objects.create(
            user=recruiter_user, role=RECRUITING, group=recruiter_group
        )
        self.admission.groups.add(recruiter_group)
        own_applicant = LegoUser.objects.create(
            username="grace",
            first_name="Grace",
            last_name="Hopper",
            lego_id=506,
        )
        own_application = UserApplication.objects.create(
            user=own_applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=own_application,
            group=recruiter_group,
            text="Bedkom application",
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            is_distributed=True,
            name_visibility="committee",
        )
        self.client.force_authenticate(user=recruiter_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            [
                {
                    "id": str(own_application.pk),
                    "name": "Grace Hopper",
                }
            ],
        )

    def test_candidate_who_applied_to_both_committees_is_visible_to_both(self):
        recruiter = LegoUser.objects.create(username="candidate-recruiter", lego_id=507)
        Membership.objects.create(user=recruiter, role=RECRUITING, group=self.group)
        other_group = Group.objects.create(name="Bedkom", lego_id=508)
        self.admission.groups.add(other_group)
        GroupApplication.objects.create(
            application=self.application,
            group=other_group,
            text="Bedkom application",
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            is_distributed=True,
            name_visibility="committee",
        )
        self.client.force_authenticate(user=recruiter)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res.data,
            [{"id": str(self.application.pk), "name": "Ada Lovelace"}],
        )
