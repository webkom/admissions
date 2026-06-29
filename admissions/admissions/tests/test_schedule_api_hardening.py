from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions import constants
from admissions.admissions.constants import MEMBER, RECRUITING
from admissions.admissions.models import (
    Group,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.tests.utils import create_admission
from admissions.admissions.views import panel_gender_code
from admissions.oauth import update_custom_user_details
from admissions.utils.management.commands.run_solver_worker import Command


class SavedSchedulePublishSemanticsTestCase(APITestCase):
    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=600)
        self.admin_user = LegoUser.objects.create(
            username="hardening-admin", lego_id=601
        )
        Membership.objects.create(
            user=self.admin_user, role=MEMBER, group=self.admin_group
        )
        self.admission = create_admission(
            created_by=self.admin_user, slug="hardening-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
        )
        self.client.force_authenticate(user=self.admin_user)

    def _create_saved(self, **overrides):
        defaults = {
            "admission": self.admission,
            "schedule": [{"candidate": "Ada", "time": 8, "panel": []}],
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "is_distributed": True,
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def test_changed_schedule_without_flag_unpublishes(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": [{"candidate": "Eirik", "time": 9, "panel": []}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["is_distributed"])
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_unchanged_schedule_without_flag_keeps_published(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": [{"candidate": "Ada", "time": 8, "panel": []}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])

    def test_explicit_true_keeps_changed_schedule_published(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {
                "schedule": [{"candidate": "Eirik", "time": 9, "panel": []}],
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])
        self.assertTrue(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_explicit_true_with_empty_schedule_is_rejected(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": [], "is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_distributed", res.data)
        # Nothing was saved — the published plan is untouched.
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertTrue(saved.is_distributed)
        self.assertEqual(len(saved.schedule), 1)

    def test_explicit_true_on_fresh_save_without_schedule_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_distributed", res.data)
        self.assertFalse(
            SavedSchedule.objects.filter(admission=self.admission).exists()
        )

    def test_expected_updated_at_mismatch_returns_conflict(self):
        saved = self._create_saved()
        stale = (saved.updated_at - timedelta(minutes=5)).isoformat()

        res = self.client.post(
            self.url,
            {
                "schedule": [{"candidate": "Eirik", "time": 9, "panel": []}],
                "expected_updated_at": stale,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).schedule,
            [{"candidate": "Ada", "time": 8, "panel": []}],
        )

    def test_expected_updated_at_match_allows_save(self):
        saved = self._create_saved()

        res = self.client.post(
            self.url,
            {
                "schedule": [{"candidate": "Eirik", "time": 9, "panel": []}],
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).schedule,
            [{"candidate": "Eirik", "time": 9, "panel": []}],
        )

    def test_end_date_before_start_date_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-25",
                "end_date": "2026-04-21",
                "session_duration": 60,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)

    def test_day_end_not_after_day_start_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "day_start_minute": 600,
                "day_end_minute": 600,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("day_end_minute", res.data)

    def test_schedule_item_with_negative_time_is_rejected(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": [{"candidate": "Ada", "time": -1, "panel": []}]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_schedule_item_unknown_keys_are_dropped(self):
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {
                "schedule": [
                    {
                        "candidate": "Eirik",
                        "candidate_id": "abc",
                        "time": 9,
                        "panel": [{"id": "i1", "name": "Ola", "extra": "nope"}],
                        "locked": True,
                        "unknown_key": "dropped",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        stored = SavedSchedule.objects.get(admission=self.admission).schedule[0]
        self.assertNotIn("unknown_key", stored)
        self.assertNotIn("extra", stored["panel"][0])
        self.assertEqual(stored["candidate_id"], "abc")
        self.assertTrue(stored["locked"])


class SolveScheduleInputCapTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Solvercaps", lego_id=610)
        self.user = LegoUser.objects.create(username="caps-admin", lego_id=611)
        Membership.objects.create(user=self.user, role=MEMBER, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="caps-opptak")
        self.admission.admin_groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("solve-schedule")

    def _solve(self, extra):
        payload = {
            "admission_slug": self.admission.slug,
            "candidates": [{"id": "c1", "name": "C1"}],
            "interviewers": [
                {"id": "i1", "name": "I1", "gender": "M", "availability": [0]}
            ],
            "panel_size": 1,
        }
        payload.update(extra)
        return self.client.post(self.url, payload, format="json")

    def test_weight_above_cap_is_rejected(self):
        res = self._solve({"options": {"overtime_weight": 10001}})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res.data)

    def test_all_slots_length_above_cap_is_rejected(self):
        res = self._solve({"all_slots": list(range(5001))})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("all_slots", res.data)

    def test_all_slots_value_above_cap_is_rejected(self):
        res = self._solve({"all_slots": [200001]})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("all_slots", res.data)

    def test_max_solver_seconds_above_cap_is_rejected(self):
        res = self._solve(
            {"options": {"max_solver_seconds": constants.MAX_SOLVER_SECONDS + 1}}
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", res.data)

    def test_second_enqueue_returns_the_active_job(self):
        # Enqueueing again while a solve is still pending returns the same job
        # instead of stacking a duplicate.
        first = self._solve({})
        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)
        second = self._solve({})
        self.assertEqual(second.status_code, status.HTTP_202_ACCEPTED)

        self.assertEqual(first.data["job_id"], second.data["job_id"])
        self.assertEqual(SolveJob.objects.filter(admission=self.admission).count(), 1)


class InterviewAvailabilityHardeningTestCase(APITestCase):
    def setUp(self):
        self.committee_group = Group.objects.create(name="Komite", lego_id=620)
        self.member = LegoUser.objects.create(username="hardening-member", lego_id=621)
        Membership.objects.create(
            user=self.member, role=MEMBER, group=self.committee_group
        )

        self.recruiter = LegoUser.objects.create(
            username="hardening-recruiter", lego_id=622
        )
        Membership.objects.create(
            user=self.recruiter, role=RECRUITING, group=self.committee_group
        )

        self.admin_group = Group.objects.create(name="Adminkom", lego_id=623)
        self.admin_user = LegoUser.objects.create(
            username="hardening-availability-admin", lego_id=624
        )
        Membership.objects.create(
            user=self.admin_user, role=MEMBER, group=self.admin_group
        )

        self.admission = create_admission(
            created_by=self.admin_user, slug="hardening-availability"
        )
        self.admission.groups.add(self.committee_group)
        self.admission.admin_groups.add(self.admin_group)

        self.applicant = LegoUser.objects.create(
            username="hardening-applicant", lego_id=625
        )
        self.application = UserApplication.objects.create(
            user=self.applicant, admission=self.admission
        )

        self.url = reverse(
            "interview-availability",
            kwargs={"admission_slug": self.admission.slug},
        )

    def _create_saved_schedule(self, **overrides):
        defaults = {
            "admission": self.admission,
            "schedule": [],
            "start_date": "2026-04-21",
            "session_duration": 60,
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def test_slot_outside_enabled_grid_is_rejected(self):
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"slots": ["2026-04-21|600"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission, user=self.member
            ).exists()
        )

    def test_legacy_colon_slot_key_is_stored_canonicalized(self):
        # Same canonical "<date>|<minute>" format the data migration enforces
        # on legacy rows.
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"slots": ["2026-04-21:540"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["slots"], ["2026-04-21|540"])
        self.assertEqual(
            InterviewAvailability.objects.get(
                admission=self.admission, user=self.member
            ).slots,
            ["2026-04-21|540"],
        )

    def test_malformed_slot_key_is_rejected(self):
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"slots": ["not-a-slot"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_slot_with_out_of_range_minute_is_rejected(self):
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"slots": ["2026-04-21|1440"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_unknown_conflict_id_is_rejected(self):
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": ["00000000-0000-0000-0000-000000000000"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)

    def test_legacy_real_candidate_conflict_id_is_rejected(self):
        # Legacy "real-candidate-<username>" ids were remapped to application
        # pks by the data migration and are no longer valid input.
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [f"real-candidate-{self.applicant.username}"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)

    def test_admin_can_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["conflicts"], [str(self.application.pk)])

    def test_recruiter_can_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["conflicts"], [str(self.application.pk)])

    def test_member_cannot_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission, user=self.member
            ).exists()
        )

    def test_partial_slots_update_preserves_conflicts(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"slots": ["2026-04-22|600"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = InterviewAvailability.objects.get(
            admission=self.admission, user=self.member
        )
        self.assertEqual(saved.slots, ["2026-04-22|600"])
        self.assertEqual(saved.conflicts, [str(self.application.pk)])

    def test_slots_above_cap_are_rejected(self):
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"slots": [f"2026-04-21|{minute}" for minute in range(10001)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_conflicts_above_cap_are_rejected(self):
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [str(index) for index in range(501)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)


class SavedScheduleVisibilityTestCase(APITestCase):
    """The privacy boundary the whole distribution feature rests on."""

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=700)
        self.committee_group = Group.objects.create(name="Arrkom", lego_id=701)
        self.admin_user = LegoUser.objects.create(username="vis-admin", lego_id=702)
        Membership.objects.create(
            user=self.admin_user, role=MEMBER, group=self.admin_group
        )
        self.member_user = LegoUser.objects.create(username="vis-member", lego_id=703)
        Membership.objects.create(
            user=self.member_user, role=MEMBER, group=self.committee_group
        )
        self.admission = create_admission(created_by=self.admin_user, slug="vis-opptak")
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.committee_group)
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
        )

    def _create_saved(self, **overrides):
        defaults = {
            "admission": self.admission,
            "schedule": [
                {"candidate": "Ada", "candidate_id": "5", "time": 8, "panel": []}
            ],
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "is_distributed": True,
            "name_visibility": "hidden",
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def test_committee_member_blocked_until_distributed(self):
        self._create_saved(is_distributed=False)
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_member_sees_redacted_names_when_hidden(self):
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "")
        self.assertNotIn("candidate_id", res.data["schedule"][0])

    def test_committee_member_sees_names_when_visibility_committee(self):
        self._create_saved(is_distributed=True, name_visibility="committee")
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_admin_sees_names_even_when_hidden(self):
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_legacy_schedule_backfills_enabled_windows_on_get(self):
        saved = self._create_saved(
            name_visibility="committee",
            enabled_slots=["2026-04-20|480", "2026-04-20|540"],
            enabled_windows=[],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved.refresh_from_db()
        self.assertTrue(saved.enabled_windows)


class InterviewGenderExposureTestCase(APITestCase):
    """Gender feeds the solver but is only ever exposed to privileged users."""

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=800)
        self.committee_group = Group.objects.create(name="Arrkom", lego_id=801)
        self.admin_user = LegoUser.objects.create(
            username="g-admin", lego_id=802, gender="male"
        )
        Membership.objects.create(
            user=self.admin_user, role=MEMBER, group=self.admin_group
        )
        self.member_user = LegoUser.objects.create(
            username="g-member", lego_id=803, gender="female"
        )
        Membership.objects.create(
            user=self.member_user, role=MEMBER, group=self.committee_group
        )
        self.applicant = LegoUser.objects.create(
            username="g-applicant", lego_id=804, gender="male"
        )
        self.admission = create_admission(
            created_by=self.admin_user, slug="gender-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.committee_group)
        UserApplication.objects.create(
            admission=self.admission, user=self.applicant, phone_number="12345678"
        )
        self.candidates_url = reverse(
            "interview-candidates", kwargs={"admission_slug": self.admission.slug}
        )
        self.availability_url = reverse(
            "interview-availability", kwargs={"admission_slug": self.admission.slug}
        )

    def test_admin_sees_mapped_candidate_gender(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([candidate["gender"] for candidate in res.data], ["M"])

    def test_committee_member_never_sees_candidate_gender(self):
        # Names are released to the committee, but gender still must not be.
        SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertNotEqual(res.data[0]["name"], "")  # name is visible
        self.assertEqual(res.data[0]["gender"], "")  # gender is not

    def test_availability_payload_carries_panel_gender_for_admin(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.availability_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        genders = {row["username"]: row["gender"] for row in res.data}
        self.assertEqual(genders.get("g-admin"), "M")
        self.assertEqual(genders.get("g-member"), "F")


class SolveJobLifecycleTestCase(APITestCase):
    """The async solve flow: enqueue -> worker -> poll for the result."""

    def setUp(self):
        self.group = Group.objects.create(name="AsyncKom", lego_id=950)
        self.user = LegoUser.objects.create(username="async-admin", lego_id=951)
        Membership.objects.create(user=self.user, role=MEMBER, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="async-opptak")
        self.admission.admin_groups.add(self.group)
        self.solve_url = reverse("solve-schedule")
        self.payload = {
            "admission_slug": self.admission.slug,
            "candidates": [{"id": "c1", "name": "Ada", "gender": ""}],
            "interviewers": [
                {"id": "i1", "name": "Ola", "gender": "M", "availability": [0]}
            ],
            "panel_size": 1,
        }

    def _enqueue(self):
        self.client.force_authenticate(user=self.user)
        return self.client.post(self.solve_url, self.payload, format="json")

    def test_enqueue_returns_a_pending_job_without_solving(self):
        res = self._enqueue()

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(res.data["status"], "PENDING")
        self.assertIsNone(res.data["result"])
        self.assertEqual(SolveJob.objects.count(), 1)

    def test_worker_runs_job_and_status_endpoint_returns_result(self):
        job_id = self._enqueue().data["job_id"]

        call_command("run_solver_worker", once=True)

        res = self.client.get(reverse("solve-job", kwargs={"job_id": job_id}))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "DONE")
        self.assertEqual(res.data["result"]["status"], "SUCCESS")

    def test_status_endpoint_is_forbidden_for_outsiders(self):
        job_id = self._enqueue().data["job_id"]
        outsider = LegoUser.objects.create(username="async-outsider", lego_id=952)
        self.client.force_authenticate(user=outsider)

        res = self.client.get(reverse("solve-job", kwargs={"job_id": job_id}))

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancel_frees_the_admission_for_a_new_solve(self):
        job_id = self._enqueue().data["job_id"]

        cancel = self.client.delete(reverse("solve-job", kwargs={"job_id": job_id}))
        self.assertEqual(cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel.data["status"], "CANCELLED")

        # The cancelled job is no longer active, so a new solve enqueues fresh.
        second = self._enqueue()
        self.assertEqual(second.status_code, status.HTTP_202_ACCEPTED)
        self.assertNotEqual(second.data["job_id"], job_id)

    def test_cancel_is_forbidden_for_outsiders(self):
        job_id = self._enqueue().data["job_id"]
        outsider = LegoUser.objects.create(username="async-outsider2", lego_id=953)
        self.client.force_authenticate(user=outsider)

        res = self.client.delete(reverse("solve-job", kwargs={"job_id": job_id}))

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_reaps_stale_running_job(self):
        stale = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_RUNNING,
            started_at=timezone.now()
            - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS + 60),
        )

        call_command("run_solver_worker", once=True)

        stale.refresh_from_db()
        self.assertEqual(stale.status, SolveJob.STATUS_ERROR)
        self.assertTrue(stale.error)

    def test_cleanup_deletes_old_finished_jobs(self):
        old = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_DONE,
        )
        SolveJob.objects.filter(id=old.id).update(
            finished_at=timezone.now()
            - timedelta(days=constants.SOLVE_JOB_RETENTION_DAYS + 1)
        )

        Command()._cleanup_old_jobs()

        self.assertFalse(SolveJob.objects.filter(id=old.id).exists())


class OAuthGenderCaptureTestCase(TestCase):
    """The login pipeline mirrors LEGO's gender onto the user."""

    def test_update_custom_user_details_stores_gender(self):
        user = LegoUser.objects.create(username="login-user", lego_id=900)
        response = {
            "memberships": [],
            "abakusGroups": [],
            "profilePicture": "https://example.com/p.png",
            "gender": "female",
        }

        update_custom_user_details(None, {}, user=user, response=response)

        user.refresh_from_db()
        self.assertEqual(user.gender, "female")
        # And it maps through to the solver code used downstream.
        self.assertEqual(panel_gender_code(user.gender), "F")

    def test_missing_gender_defaults_to_blank(self):
        user = LegoUser.objects.create(username="login-user-2", lego_id=901)
        response = {
            "memberships": [],
            "abakusGroups": [],
            "profilePicture": "https://example.com/p.png",
        }

        update_custom_user_details(None, {}, user=user, response=response)

        user.refresh_from_db()
        self.assertEqual(user.gender, "")
