from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import RECRUITING
from admissions.admissions.models import (
    Group,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.schedule_validation import canonicalize_solver_payload
from admissions.admissions.tests.utils import (
    ScheduleRevisionAPIClient,
    create_admission,
)


class ManualScheduleBlocksTestCase(APITestCase):
    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.group = Group.objects.create(name="Manual blocks", lego_id=5200)
        self.admin = LegoUser.objects.create(username="manual-admin", lego_id=5201)
        Membership.objects.create(user=self.admin, group=self.group, role=RECRUITING)
        self.admission = create_admission(
            created_by=self.admin,
            slug="manual-blocks-opptak",
        )
        self.admission.admin_groups.add(self.group)
        self.candidate = LegoUser.objects.create(
            username="manual-candidate", lego_id=5202
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
        )
        self.client.force_authenticate(user=self.admin)

    def _manual_blocks(self):
        return [
            {"slots": ["2026-04-20|540", "2026-04-20|570"]},
            {"slots": ["2026-04-20|600"]},
            {"slots": ["2026-04-20|630"]},
            {"slots": ["2026-04-20|660", "2026-04-20|690"]},
        ]

    def _saved(self, **overrides):
        defaults = {
            "admission": self.admission,
            "schedule": [],
            "start_date": date(2026, 4, 20),
            "end_date": date(2026, 4, 20),
            "session_duration": 30,
            "enabled_slots": ["2026-04-20|540", "2026-04-20|630"],
            "day_start_minute": 540,
            "day_end_minute": 720,
            "panel_size": 1,
            "block_mode": SavedSchedule.BLOCK_MODE_MANUAL,
            "manual_blocks": self._manual_blocks(),
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def test_manual_blocks_are_canonical_solver_groups_including_closed_slots(self):
        saved = self._saved()
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            slots=["2026-04-20|540", "2026-04-20|630"],
            submitted_grid_generation=saved.availability_generation,
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
        )

        payload = canonicalize_solver_payload(
            self.admission,
            saved,
            {
                "candidates": [{"id": str(self.application.pk)}],
                "interviewers": [{"id": str(self.admin.pk)}],
                "panel_size": 1,
                "options": {},
            },
            self.admin,
        )

        self.assertEqual(payload["blocks"], [[540], [630]])
        self.assertEqual(payload["block_metadata"][0]["canonical_slots"], [540, 570])
        self.assertEqual(payload["block_metadata"][0]["usable_slots"], [540])
        self.assertTrue(payload["block_metadata"][1]["has_zero_usable_slots"])

    def test_manual_mode_requires_every_open_slot_to_belong_to_a_block(self):
        response = self.client.post(
            self.url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "enabled_slots": ["2026-04-20|540", "2026-04-20|570"],
                "day_start_minute": 540,
                "day_end_minute": 720,
                "block_mode": "manual",
                "manual_blocks": [{"slots": ["2026-04-20|540"]}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("manual_blocks", response.data)

    def test_manual_mode_canonicalizes_slots_and_keeps_disabled_block_positions(self):
        response = self.client.post(
            self.url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "enabled_slots": ["2026-04-20:540", "2026-04-20:630"],
                "day_start_minute": 540,
                "day_end_minute": 720,
                "block_mode": "manual",
                "manual_blocks": [
                    {"slots": ["2026-04-20:540", "2026-04-20:570"]},
                    {"slots": ["2026-04-20:600"]},
                    {"slots": ["2026-04-20:630"]},
                    {"slots": ["2026-04-20:660", "2026-04-20:690"]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["block_mode"], "manual")
        self.assertEqual(response.data["manual_blocks"], self._manual_blocks())

    def test_standard_mode_clears_manual_blocks(self):
        response = self.client.post(
            self.url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "enabled_slots": ["2026-04-20|540"],
                "day_start_minute": 540,
                "day_end_minute": 720,
                "block_mode": "standard",
                "manual_blocks": self._manual_blocks(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["block_mode"], "standard")
        self.assertEqual(response.data["manual_blocks"], [])

    def test_same_panel_validation_uses_persisted_manual_blocks(self):
        second_interviewer = LegoUser.objects.create(
            username="manual-second-interviewer", lego_id=5203
        )
        Membership.objects.create(
            user=second_interviewer,
            group=self.group,
            role=RECRUITING,
        )
        second_candidate = LegoUser.objects.create(
            username="manual-second-candidate", lego_id=5204
        )
        second_application = UserApplication.objects.create(
            admission=self.admission,
            user=second_candidate,
            phone_number="87654321",
        )
        self._saved(
            manual_blocks=[
                {
                    "slots": [
                        "2026-04-20|540",
                        "2026-04-20|570",
                        "2026-04-20|600",
                        "2026-04-20|630",
                    ]
                },
                {"slots": ["2026-04-20|660", "2026-04-20|690"]},
            ]
        )

        response = self.client.post(
            self.url,
            {
                "solver_options": {"same_panel_per_block": True},
                "schedule": [
                    {
                        "candidate_id": str(self.application.pk),
                        "candidate": "",
                        "time": 540,
                        "panel": [{"id": str(self.admin.pk), "name": ""}],
                    },
                    {
                        "candidate_id": str(second_application.pk),
                        "candidate": "",
                        "time": 630,
                        "panel": [{"id": str(second_interviewer.pk), "name": ""}],
                    },
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", response.data)

    def test_mode_change_clears_published_schedule_but_preserves_availability(self):
        saved = self._saved(
            block_mode=SavedSchedule.BLOCK_MODE_STANDARD,
            manual_blocks=[],
            schedule=[{"candidate": "Ada", "time": 540, "panel": []}],
            is_distributed=True,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            slots=["2026-04-20|540"],
        )
        SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin,
            request_data={},
        )

        response = self.client.post(
            self.url,
            {
                "block_mode": "manual",
                "manual_blocks": self._manual_blocks(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["schedule"], [])
        self.assertFalse(response.data["is_distributed"])
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.admin,
            ).exists()
        )
        self.assertTrue(SolveJob.objects.filter(admission=self.admission).exists())
        saved.refresh_from_db()
        self.assertEqual(saved.block_mode, SavedSchedule.BLOCK_MODE_MANUAL)

    def test_manual_block_boundary_change_preserves_availability(self):
        self._saved(
            schedule=[{"candidate": "Ada", "time": 540, "panel": []}],
            is_distributed=True,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            slots=["2026-04-20|540"],
        )

        response = self.client.post(
            self.url,
            {
                "manual_blocks": [
                    {"slots": ["2026-04-20|540"]},
                    {"slots": ["2026-04-20|570"]},
                    {"slots": ["2026-04-20|600"]},
                    {"slots": ["2026-04-20|630"]},
                    {"slots": ["2026-04-20|660", "2026-04-20|690"]},
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["schedule"], [])
        self.assertFalse(response.data["is_distributed"])
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.admin,
            ).exists()
        )

    def test_boundary_only_change_preserves_availability_when_slots_match(self):
        self._saved()
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            slots=["2026-04-20|540"],
        )

        response = self.client.post(
            self.url,
            {
                "day_end_minute": 780,
                "manual_blocks": [
                    *self._manual_blocks(),
                    {"slots": ["2026-04-20|720", "2026-04-20|750"]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.admin,
            ).exists()
        )

    def test_zero_pause_block_size_change_clears_plan_but_keeps_availability(self):
        self._saved(
            block_mode=SavedSchedule.BLOCK_MODE_STANDARD,
            manual_blocks=[],
            chunk_size=3,
            chunk_break_minutes=0,
            schedule=[{"candidate": "Ada", "time": 540, "panel": []}],
            is_distributed=True,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            slots=["2026-04-20|540"],
        )

        response = self.client.post(
            self.url,
            {"chunk_size": 4},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["schedule"], [])
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.admin,
            ).exists()
        )

    def test_manual_block_slots_must_be_contiguous(self):
        response = self.client.post(
            self.url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "enabled_slots": ["2026-04-20|540", "2026-04-20|630"],
                "day_start_minute": 540,
                "day_end_minute": 720,
                "block_mode": "manual",
                "manual_blocks": [{"slots": ["2026-04-20|540", "2026-04-20|630"]}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("manual_blocks", response.data)

    def test_manual_plan_rejects_an_omitted_closed_gap(self):
        response = self.client.post(
            self.url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "enabled_slots": ["2026-04-20|540", "2026-04-20|630"],
                "day_start_minute": 540,
                "day_end_minute": 720,
                "block_mode": "manual",
                "manual_blocks": [
                    {"slots": ["2026-04-20|540", "2026-04-20|570"]},
                    {"slots": ["2026-04-20|630"]},
                    {"slots": ["2026-04-20|660", "2026-04-20|690"]},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("manual_blocks", response.data)

    def test_new_saved_schedule_defaults_to_standard_blocks(self):
        saved = SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[],
            start_date="2026-04-20",
        )

        self.assertEqual(saved.block_mode, SavedSchedule.BLOCK_MODE_STANDARD)
        self.assertEqual(saved.manual_blocks, [])
