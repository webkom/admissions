import json
from datetime import date
from pathlib import Path

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
)
from admissions.admissions.schedule_layout import (
    ScheduleLayoutError,
    build_grid_slot_keys,
    derive_version_two_layout,
)
from admissions.admissions.tests.utils import (
    ScheduleRevisionAPIClient,
    create_admission,
)


class VersionTwoLayoutUnitTestCase(APITestCase):
    def _derive(self, enabled_slots, overrides):
        return derive_version_two_layout(
            enabled_slots=enabled_slots,
            slot_overrides=overrides,
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 20),
            day_start_minute=540,
            day_end_minute=720,
            session_duration=30,
            chunk_size=2,
            chunk_break_minutes=30,
        )

    def test_partial_block_keeps_boundary_and_opened_pause_is_separate(self):
        layout = self._derive(
            ["2026-04-20|540", "2026-04-20|600"],
            [
                {"slot": "2026-04-20|600", "open": True},
                {"slot": "2026-04-20|570", "open": False},
            ],
        )

        self.assertEqual(
            layout["resolved_blocks"],
            [
                {"slots": ["2026-04-20|540", "2026-04-20|570"]},
                {"slots": ["2026-04-20|600"]},
                {"slots": ["2026-04-20|630", "2026-04-20|660"]},
            ],
        )
        self.assertEqual(
            layout["slot_overrides"],
            [
                {"slot": "2026-04-20|570", "open": False},
                {"slot": "2026-04-20|600", "open": True},
            ],
        )

    def test_base_must_be_complete_standard_chunks(self):
        with self.assertRaises(ScheduleLayoutError):
            self._derive(["2026-04-20|540"], [])

    def test_non_divisible_pause_uses_patterned_standard_and_pause_slots(self):
        grid = build_grid_slot_keys(
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 20),
            day_start_minute=480,
            day_end_minute=600,
            session_duration=20,
            chunk_size=2,
            chunk_break_minutes=30,
        )

        self.assertEqual(
            grid,
            [
                "2026-04-20|480",
                "2026-04-20|500",
                "2026-04-20|520",
                "2026-04-20|550",
                "2026-04-20|570",
            ],
        )

    def test_shared_golden_layout_fixtures(self):
        fixture_path = (
            Path(__file__).resolve().parents[3]
            / "cypress"
            / "fixtures"
            / "schedule-layout-golden.json"
        )
        cases = json.loads(fixture_path.read_text())
        for case in cases:
            with self.subTest(case=case["name"]):
                layout = self._derive(case["enabled_slots"], case["slot_overrides"])
                self.assertEqual(
                    {
                        "base_slots": layout["base_slots"],
                        "slot_overrides": layout["slot_overrides"],
                        "resolved_blocks": layout["resolved_blocks"],
                    },
                    case["expected"],
                )


class AvailabilityGenerationProjectionTestCase(APITestCase):
    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.group = Group.objects.create(name="Layout generation", lego_id=6400)
        self.admin = LegoUser.objects.create(
            username="layout-generation-admin", lego_id=6401
        )
        Membership.objects.create(user=self.admin, group=self.group, role=RECRUITING)
        self.admission = create_admission(
            created_by=self.admin,
            slug="layout-generation",
        )
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)
        self.schedule_url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )
        self.availability_url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.schedule_url,
            {
                "start_date": "2026-04-20",
                "end_date": "2026-04-20",
                "session_duration": 30,
                "day_start_minute": 540,
                "day_end_minute": 720,
                "chunk_size": 2,
                "chunk_break_minutes": 30,
                "enabled_slots": ["2026-04-20|540", "2026-04-20|570"],
                "slot_overrides": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_addition_makes_even_empty_submission_stale_until_reconfirmed(self):
        submitted = self.client.post(
            self.availability_url,
            {"slots": [], "expected_availability_generation": 1},
            format="json",
        )
        self.assertEqual(submitted.status_code, status.HTTP_200_OK)

        response = self.client.post(
            self.schedule_url,
            {
                "enabled_slots": [
                    "2026-04-20|540",
                    "2026-04-20|570",
                    "2026-04-20|630",
                    "2026-04-20|660",
                ],
                "slot_overrides": [],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["availability_generation"], 2)

        participant = self.client.get(self.availability_url).data[0]
        self.assertFalse(participant["has_submitted"])
        self.assertTrue(participant["needs_review"])
        self.assertEqual(participant["slots"], [])

        stale = self.client.post(
            self.availability_url,
            {"slots": [], "expected_availability_generation": 1},
            format="json",
        )
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(
            InterviewAvailability.objects.get(
                admission=self.admission, user=self.admin
            ).submitted_grid_generation,
            1,
        )

        restored_grid = self.client.post(
            self.schedule_url,
            {
                "enabled_slots": ["2026-04-20|540", "2026-04-20|570"],
                "slot_overrides": [],
            },
            format="json",
        )
        # Restoring the grid removes the added slots, and a removal also
        # invalidates submissions: the generation bumps again.
        self.assertEqual(restored_grid.data["availability_generation"], 3)
        participant = self.client.get(self.availability_url).data[0]
        self.assertTrue(participant["needs_review"])

    def test_changed_grid_requires_expected_generation(self):
        updated = self.client.post(
            self.schedule_url,
            {
                "enabled_slots": [
                    "2026-04-20|540",
                    "2026-04-20|570",
                    "2026-04-20|630",
                    "2026-04-20|660",
                ],
                "slot_overrides": [],
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        response = self.client.post(
            self.availability_url,
            {"slots": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_availability_generation", response.data)

    def test_removal_prunes_slots_and_invalidates_generation(self):
        self.client.post(
            self.availability_url,
            {
                "slots": ["2026-04-20|540", "2026-04-20|570"],
                "expected_availability_generation": 1,
            },
            format="json",
        )
        response = self.client.post(
            self.schedule_url,
            {
                "enabled_slots": ["2026-04-20|540"],
                "slot_overrides": [{"slot": "2026-04-20|570", "open": False}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Removing a slot invalidates every submitted availability: the
        # generation bumps so stale grids cannot save against the new plan.
        self.assertEqual(response.data["availability_generation"], 2)
        availability = InterviewAvailability.objects.get(
            admission=self.admission, user=self.admin
        )
        self.assertEqual(availability.slots, ["2026-04-20|540"])
        self.assertEqual(availability.submitted_grid_generation, 1)

    def test_duration_change_clears_slots_and_submission_but_preserves_conflicts(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.admin,
            slots=["2026-04-20|540"],
            conflicts=["candidate-a"],
            submitted_grid_generation=1,
        )

        response = self.client.post(
            self.schedule_url,
            {
                "session_duration": 60,
                "enabled_slots": ["2026-04-20|540", "2026-04-20|600"],
                "slot_overrides": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["availability_generation"], 2)
        availability = InterviewAvailability.objects.get(
            admission=self.admission, user=self.admin
        )
        self.assertEqual(availability.slots, [])
        self.assertIsNone(availability.submitted_grid_generation)
        self.assertEqual(availability.conflicts, ["candidate-a"])

    def test_non_divisible_pause_pattern_persists_off_lattice_slots(self):
        response = self.client.post(
            self.schedule_url,
            {
                "session_duration": 20,
                "chunk_size": 2,
                "chunk_break_minutes": 30,
                "enabled_slots": [
                    "2026-04-20|540",
                    "2026-04-20|560",
                    "2026-04-20|580",
                ],
                "slot_overrides": [{"slot": "2026-04-20|580", "open": True}],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["resolved_blocks"][:2],
            [
                {"slots": ["2026-04-20|540", "2026-04-20|560"]},
                {"slots": ["2026-04-20|580"]},
            ],
        )

    def test_unchanged_legacy_windows_write_preserves_v2_draft(self):
        saved = SavedSchedule.objects.get(admission=self.admission)
        saved.schedule = [
            {"candidate_id": "legacy-candidate", "time": 540, "panel": []}
        ]
        saved.save(update_fields=["schedule", "updated_at"])

        response = self.client.post(
            self.schedule_url,
            {
                "enabled_windows": [
                    {
                        "date": "2026-04-20",
                        "start_minute": 540,
                        "end_minute": 600,
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["layout_version"], 2)
        saved.refresh_from_db()
        self.assertEqual(
            saved.schedule,
            [{"candidate_id": "legacy-candidate", "time": 540, "panel": []}],
        )
        self.assertFalse(response.data["is_distributed"])

    def test_enabled_slots_are_sorted_unique_and_match_equivalent_windows(self):
        response = self.client.post(
            self.schedule_url,
            {
                "enabled_slots": [
                    "2026-04-20:570",
                    "2026-04-20|540",
                    "2026-04-20|540",
                ],
                "enabled_windows": [
                    {
                        "date": "2026-04-20",
                        "start_minute": 540,
                        "end_minute": 600,
                    }
                ],
                "slot_overrides": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["enabled_slots"],
            ["2026-04-20|540", "2026-04-20|570"],
        )

    def test_legacy_windows_preserve_custom_v2_off_lattice_slot(self):
        configured = self.client.post(
            self.schedule_url,
            {
                "session_duration": 20,
                "chunk_size": 2,
                "chunk_break_minutes": 30,
                "enabled_slots": ["2026-04-20|610"],
                "slot_overrides": [{"slot": "2026-04-20|630", "open": False}],
            },
            format="json",
        )
        self.assertEqual(configured.status_code, status.HTTP_200_OK, configured.data)
        self.assertEqual(configured.data["block_mode"], "manual")

        response = self.client.post(
            self.schedule_url,
            {
                "enabled_windows": [
                    {
                        "date": "2026-04-20",
                        "start_minute": 610,
                        "end_minute": 630,
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["layout_version"], 2)
        self.assertEqual(response.data["enabled_slots"], ["2026-04-20|610"])
