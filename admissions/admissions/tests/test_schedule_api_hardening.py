import uuid
from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from admissions.admissions import constants
from admissions.admissions.constants import MEMBER, RECRUITING, RETIREE
from admissions.admissions.models import (
    ConflictReviewAuditEvent,
    ConflictReviewList,
    FadderbarnDeclaration,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    NameVisibilityAuditEvent,
    SavedSchedule,
    ScheduleDeviationApproval,
    SolveJob,
    UserApplication,
)
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_solver_payload,
)
from admissions.admissions.schedule_workflow import ScheduleInputError
from admissions.admissions.serializers import SolveJobSerializer, SolveOptionsSerializer
from admissions.admissions.tests.utils import (
    ScheduleRevisionAPIClient,
    create_admission,
)
from admissions.admissions.views import panel_gender_code
from admissions.oauth import update_custom_user_details
from admissions.utils.management.commands.run_solver_worker import Command


class SavedSchedulePublishSemanticsTestCase(APITestCase):
    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=600)
        self.admin_user = LegoUser.objects.create(
            username="hardening-admin", lego_id=601
        )
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.admin_group
        )
        self.admission = create_admission(
            created_by=self.admin_user, slug="hardening-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.admin_group)
        self.candidate_user = LegoUser.objects.create(
            username="hardening-candidate", lego_id=602
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate_user,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.admin_group,
            text="Hardening application",
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
            slots=["2026-04-20|540", "2026-04-20|600"],
        )
        self.url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.admin_group.pk,
            },
        )
        self.client.force_authenticate(user=self.admin_user)

    def _schedule(self, time=540, **overrides):
        item = {
            "candidate": "Client-supplied name",
            "candidate_id": str(self.application.pk),
            "time": time,
            "panel": [
                {
                    "id": str(self.admin_user.pk),
                    "name": "Client-supplied interviewer",
                }
            ],
        }
        item.update(overrides)
        return [item]

    def _create_saved(self, **overrides):
        defaults = {
            "admission": self.admission,
            "group": self.admin_group,
            "schedule": self._schedule(),
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "enabled_slots": ["2026-04-20|540", "2026-04-20|600"],
            "panel_size": 1,
            "is_distributed": True,
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def _mark_reviewed(self, *applications):
        InterviewAvailability.objects.filter(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
        ).update(
            reviewed_candidate_ids=[str(application.pk) for application in applications]
        )

    def test_completed_days_round_trip_and_never_touch_availability(self):
        saved = self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540", "2026-04-21|540"],
        )
        generation_before = saved.availability_generation

        res = self.client.post(
            self.url,
            {"completed_days": ["2026-04-20"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertEqual(saved.completed_days, ["2026-04-20"])
        # Marking a day finished is not a framework change.
        self.assertEqual(saved.availability_generation, generation_before)

    def test_completed_day_without_an_interview_is_dropped(self):
        saved = self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540", "2026-04-21|540"],
        )

        # 2026-04-21 has no interview in the schedule, so it cannot be "done".
        res = self.client.post(
            self.url,
            {"completed_days": ["2026-04-20", "2026-04-21"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertEqual(saved.completed_days, ["2026-04-20"])

    def test_row_edit_survives_a_roster_that_shrank_under_the_plan(self):
        """Editing a row must not be blocked because fewer people are
        participating than the plan's panel size.

        The regression: capacity was re-checked on *every* save, so the moment
        someone opted out - or a framework change reset everyone's submitted
        availability - every subsequent edit died on
        "Panelstørrelsen kan ikke være større enn intervjuergruppen", a field
        the editor never touched. The plan is itself the proof those panels
        were staffable; what matters afterwards is caught per row.
        """
        second = LegoUser.objects.create(username="hardening-second", lego_id=6031)
        Membership.objects.create(user=second, role=RECRUITING, group=self.admin_group)
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=second,
            slots=["2026-04-20|540", "2026-04-20|600"],
        )
        panel = [
            {"id": str(self.admin_user.pk), "name": self.admin_user.username},
            {"id": str(second.pk), "name": second.username},
        ]
        self._create_saved(
            panel_size=2, schedule=self._schedule(panel=panel), is_distributed=False
        )
        # The second interviewer steps back after the plan exists.
        InterviewAvailability.objects.filter(
            admission=self.admission, group=self.admin_group, user=second
        ).update(participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING)

        # A row edit that leaves the panel alone still has to go through -
        # the offending row is a separate, better-named problem.
        res = self.client.post(
            self.url,
            {"schedule": self._schedule(time=600, panel=panel)},
            format="json",
        )

        self.assertNotIn("panel_size", res.data)

    def test_choosing_a_panel_size_the_committee_cannot_staff_is_refused(self):
        """The capacity rule still applies where it belongs: to the save that
        actually picks the number."""
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {"panel_size": 5, "schedule": self._schedule()},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("panel_size", res.data)

    def test_self_interview_names_the_candidate(self):
        """ "Det gikk ikke" is not a reason. Every refusal here names the
        person the editor has to act on."""
        self.candidate_user.first_name = "Kari"
        self.candidate_user.last_name = "Nordmann"
        self.candidate_user.save(update_fields=["first_name", "last_name"])
        application = UserApplication.objects.create(
            admission=self.admission, user=self.admin_user, phone_number="1"
        )
        GroupApplication.objects.create(
            application=application, group=self.admin_group, text="x"
        )
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(
                    candidate_id=str(application.pk),
                    panel=[
                        {
                            "id": str(self.admin_user.pk),
                            "name": self.admin_user.username,
                        }
                    ],
                )
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("intervjue seg selv", str(res.data))
        self.assertIn(self.admin_user.username, str(res.data))

    def test_a_panel_member_who_left_the_committee_is_named(self):
        gone = LegoUser.objects.create(username="hardening-gone", lego_id=6032)
        self.assertFalse(
            Membership.objects.filter(user=gone, group=self.admin_group).exists()
        )
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(
                    panel=[{"id": str(gone.pk), "name": "Maja Nilsen"}]
                )
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        # The name comes off the submitted row: there is no eligible-user
        # record left to look it up in, which is exactly why it is rejected.
        self.assertIn("Maja Nilsen", str(res.data))

    def test_a_panel_member_who_opted_out_is_named(self):
        second = LegoUser.objects.create(username="hardening-out", lego_id=6033)
        second.first_name = "Ola"
        second.last_name = "Hansen"
        second.save(update_fields=["first_name", "last_name"])
        Membership.objects.create(user=second, role=RECRUITING, group=self.admin_group)
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=second,
            slots=["2026-04-20|540"],
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
        )
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(
                    panel=[{"id": str(second.pk), "name": second.username}]
                )
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Ola Hansen", str(res.data))
        self.assertIn("deltar ikke", str(res.data))

    def test_a_wrong_sized_panel_names_the_interview_and_the_expectation(self):
        """The old text - "Alle intervjuer må ha riktig panelstørrelse" - named
        neither the offending interview nor what "riktig" was, which on a
        40-row plan is not a reason, it is a search."""
        self._create_saved(panel_size=1, is_distributed=False)

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(panel=[])},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        message = str(res.data)
        self.assertIn(self.candidate_user.username, message)
        self.assertIn("0 intervjuer", message)
        self.assertIn("panelstørrelsen er 1", message)

    def test_a_duplicated_panel_member_names_the_interview(self):
        self._create_saved(panel_size=2, is_distributed=False)
        twice = [
            {"id": str(self.admin_user.pk), "name": self.admin_user.username},
            {"id": str(self.admin_user.pk), "name": self.admin_user.username},
        ]

        res = self.client.post(
            self.url, {"schedule": self._schedule(panel=twice)}, format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(self.candidate_user.username, str(res.data))

    def test_changed_schedule_without_flag_unpublishes(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(time=600)},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["is_distributed"])
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_removing_enabled_slot_invalidates_availability_generation(self):
        saved = self._create_saved()
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
        )
        availability.slots = ["2026-04-20|600"]
        availability.submitted_grid_generation = saved.availability_generation
        availability.save(update_fields=["slots", "submitted_grid_generation"])

        res = self.client.post(
            self.url,
            {"enabled_slots": ["2026-04-20|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved.refresh_from_db()
        availability.refresh_from_db()
        self.assertEqual(saved.availability_generation, 2)
        self.assertEqual(availability.slots, [])

    def test_distributed_through_publishes_only_part_of_the_plan(self):
        second_candidate = LegoUser.objects.create(
            username="hardening-candidate-2", lego_id=603
        )
        second_application = UserApplication.objects.create(
            admission=self.admission, user=second_candidate
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Second hardening application",
        )
        second_entry = self._schedule(time=2 * 24 * 60 + 540)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        self._create_saved(
            is_distributed=False,
            schedule=self._schedule(time=540) + second_entry,
            enabled_slots=["2026-04-20|540", "2026-04-22|540"],
        )
        self._mark_reviewed(self.application, second_application)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-21"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["distributed_through"], "2026-04-21")
        self.assertTrue(res.data["is_distributed"])
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(saved.distributed_through.isoformat(), "2026-04-21")

    def test_own_committee_recruiter_publishes_with_name_visibility(self):
        """A plain committee recruiter (no admission-admin role) must be able
        to publish their own committee's plan, including the name-visibility
        choice made in the publish dialog. The publish payload always carries
        name_visibility alongside is_distributed; rejecting it used to 403
        every recruiter publish, which the frontend surfaced as a lost-access
        purge."""
        committee = Group.objects.create(name="Bedkom", lego_id=610)
        self.admission.groups.add(committee)
        recruiter = LegoUser.objects.create(username="bedkom-recruiter", lego_id=611)
        Membership.objects.create(user=recruiter, role=RECRUITING, group=committee)
        candidate = LegoUser.objects.create(username="bedkom-candidate", lego_id=612)
        application = UserApplication.objects.create(
            admission=self.admission, user=candidate, phone_number="87654321"
        )
        GroupApplication.objects.create(
            application=application, group=committee, text="Bedkom application"
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=committee,
            user=recruiter,
            slots=["2026-04-20|540", "2026-04-20|600"],
            reviewed_candidate_ids=[str(application.pk)],
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            group=committee,
            schedule=[
                {
                    "candidate_id": str(application.pk),
                    "candidate": "Bedkom kandidat",
                    "time": 540,
                    "panel": [{"id": str(recruiter.pk), "name": "Bedkom recruiter"}],
                }
            ],
            start_date="2026-04-20",
            end_date="2026-04-24",
            session_duration=60,
            enabled_slots=["2026-04-20|540", "2026-04-20|600"],
            panel_size=1,
            is_distributed=False,
        )
        committee_url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": committee.pk,
            },
        )
        saved = SavedSchedule.objects.get(admission=self.admission, group=committee)
        self.client.force_authenticate(user=recruiter)

        res = self.client.post(
            committee_url,
            {
                "is_distributed": True,
                "name_visibility": "admin_only",
                "expected_updated_at": saved.updated_at,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_distributed"])
        self.assertEqual(res.data["name_visibility"], "admin_only")

    def test_distributed_through_cannot_precede_start_date(self):
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-01"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("distributed_through", res.data)
        self.assertIsNone(
            SavedSchedule.objects.get(admission=self.admission).distributed_through
        )

    def test_distributed_through_cannot_move_backward(self):
        self._create_saved(is_distributed=False, distributed_through="2026-04-22")

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-21"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("distributed_through", res.data)
        self.assertEqual(
            SavedSchedule.objects.get(
                admission=self.admission
            ).distributed_through.isoformat(),
            "2026-04-22",
        )

    def test_distributed_through_can_move_forward(self):
        self._create_saved(is_distributed=False, distributed_through="2026-04-21")
        self._mark_reviewed(self.application)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-22"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["distributed_through"], "2026-04-22")

    def test_distributed_through_together_with_conflict_review_open_is_rejected(self):
        self._create_saved(is_distributed=False, conflict_review_open=True)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-21", "conflict_review_open": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflict_review_open", res.data)

    def test_publish_is_blocked_until_open_conflict_review_is_complete(self):
        self._create_saved(is_distributed=False, conflict_review_open=True)

        res = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_publish_closes_review_after_every_candidate_is_reviewed(self):
        self._create_saved(is_distributed=False, conflict_review_open=True)
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            user=self.admin_user,
        )
        availability.reviewed_candidate_ids = [str(self.application.pk)]
        availability.save(update_fields=["reviewed_candidate_ids"])

        res = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])
        self.assertFalse(res.data["conflict_review_open"])
        self.assertTrue(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_CLOSED,
            ).exists()
        )

    def test_retry_after_committed_publish_is_one_durable_transition(self):
        saved = self._create_saved(
            is_distributed=False,
            conflict_review_open=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )
        self._mark_reviewed(self.application)
        original_revision = saved.updated_at.isoformat()

        published = self.client.post(
            self.url,
            {
                "is_distributed": True,
                "name_visibility": SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY,
                "expected_updated_at": original_revision,
            },
            format="json",
        )

        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        saved.refresh_from_db()
        published_revision = saved.updated_at
        self.assertTrue(saved.is_distributed)
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY,
        )

        retried = self.client.post(
            self.url,
            {
                "is_distributed": True,
                "name_visibility": SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY,
                "expected_updated_at": original_revision,
            },
            format="json",
        )

        self.assertEqual(retried.status_code, status.HTTP_409_CONFLICT)
        saved.refresh_from_db()
        self.assertEqual(saved.updated_at, published_revision)
        self.assertEqual(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_CLOSED,
            ).count(),
            1,
        )

    def test_proposed_availability_deviation_requires_exact_publish_approval(self):
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(slots=["2026-04-20|540"])
        self._create_saved(
            schedule=[],
            is_distributed=False,
            conflict_review_open=False,
        )
        draft = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=600),
                "panel_size": 1,
                "solver_options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "propose",
                    "same_panel_per_block": False,
                    "allow_overtime": False,
                },
                "is_distributed": False,
            },
            format="json",
        )
        self.assertEqual(draft.status_code, status.HTTP_200_OK, draft.data)
        review = draft.data["deviation_review"]
        self.assertTrue(review["requires_approval"])
        self.assertEqual(review["deviation_count"], 1)
        self._mark_reviewed(self.application)

        blocked = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("deviation_approval_fingerprint", blocked.data)

        published = self.client.post(
            self.url,
            {
                "is_distributed": True,
                "deviation_approval_fingerprint": review["deviation_fingerprint"],
            },
            format="json",
        )
        self.assertEqual(published.status_code, status.HTTP_200_OK, published.data)
        self.assertTrue(published.data["is_distributed"])
        self.assertEqual(
            ScheduleDeviationApproval.objects.filter(
                saved_schedule__admission=self.admission
            ).count(),
            1,
        )

    def test_saving_first_timed_draft_opens_assignment_review(self):
        self._create_saved(
            schedule=[],
            is_distributed=False,
            conflict_review_open=False,
        )

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(), "is_distributed": False},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["conflict_review_open"])
        self.assertTrue(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_OPENED,
            ).exists()
        )

    def test_unchanged_schedule_without_flag_keeps_published(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": self._schedule()},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])

    def test_framework_save_preserves_unpublished_overtime_draft(self):
        self._create_saved(
            schedule=self._schedule(time=660),
            is_distributed=False,
            enabled_slots=[
                "2026-04-20|540",
                "2026-04-20|600",
                "2026-04-20|660",
            ],
            solver_options={
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "stop",
                "allow_overtime": False,
            },
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=1,
        )

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=660),
                "start_date": "2026-04-20",
                "end_date": "2026-04-24",
                "session_duration": 60,
                "day_start_minute": 480,
                "day_end_minute": 1080,
                "chunk_size": 4,
                "chunk_break_minutes": 0,
                "enabled_slots": [
                    "2026-04-20|540",
                    "2026-04-20|600",
                    "2026-04-20|660",
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertFalse(res.data["is_distributed"])
        self.assertEqual(res.data["schedule"][0]["time"], 660)

        validation_cases = {
            "schedule edit": {"schedule": self._schedule(time=660, locked=True)},
            "panel-size change": {
                "schedule": self._schedule(time=660),
                "panel_size": 1,
            },
            "policy change": {
                "schedule": self._schedule(time=660),
                "solver_options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "stop",
                    "allow_overtime": False,
                },
            },
            "publish": {
                "schedule": self._schedule(time=660),
                "is_distributed": True,
            },
        }
        for label, payload in validation_cases.items():
            with self.subTest(label):
                invalid = self.client.post(self.url, payload, format="json")

                self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("overtid", str(invalid.data))

    def test_explicit_true_keeps_changed_schedule_published(self):
        self._create_saved()
        self._mark_reviewed(self.application)

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=600),
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])
        self.assertTrue(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def _second_application(self):
        second_candidate = LegoUser.objects.create(
            username="hardening-candidate-2", lego_id=603
        )
        second_application = UserApplication.objects.create(
            admission=self.admission, user=second_candidate
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Second hardening application",
        )
        return second_application

    def test_row_edit_of_partially_published_plan_keeps_the_boundary(self):
        """A row edit echoing `is_distributed: true` must not widen a partial publish."""
        second_application = self._second_application()
        second_entry = self._schedule(time=2 * 24 * 60 + 540)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        self._create_saved(
            is_distributed=False,
            schedule=self._schedule(time=540) + second_entry,
            enabled_slots=["2026-04-20|540", "2026-04-20|600", "2026-04-22|540"],
            distributed_through="2026-04-21",
        )
        self._mark_reviewed(self.application, second_application)

        edited_second = self._schedule(time=2 * 24 * 60 + 540)
        edited_second[0]["candidate_id"] = str(second_application.pk)
        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=600) + edited_second,
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(saved.distributed_through.isoformat(), "2026-04-21")

    def test_republish_after_unlock_still_computes_the_full_boundary(self):
        self._create_saved(is_distributed=False)
        self._mark_reviewed(self.application)

        res = self.client.post(self.url, {"is_distributed": True}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["is_distributed"])
        self.assertIsNotNone(
            SavedSchedule.objects.get(admission=self.admission).distributed_through
        )

    def test_updating_the_schedule_regenerates_conflict_review_lists(self):
        """The update path must re-snapshot review lists, not just creation."""
        saved = self._create_saved(is_distributed=False, schedule=[])
        ConflictReviewList.objects.filter(saved_schedule=saved).delete()

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(time=540)},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = list(ConflictReviewList.objects.filter(saved_schedule=saved))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].own_candidate_ids, [str(self.application.pk)])

        # And a byte-identical re-save must keep the snapshot untouched.
        revision_before = rows[0].revision
        res = self.client.post(
            self.url,
            {"schedule": self._schedule(time=540)},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            ConflictReviewList.objects.get(saved_schedule=saved).revision,
            revision_before,
        )

    def test_publish_with_schedule_change_requires_review_of_the_new_pairing(self):
        """Readiness must cover the incoming schedule, not the old snapshot."""
        second_application = self._second_application()
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)

        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=540) + second_entry,
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)
        self.assertIn("kontrollere", res.data["schedule"][0])
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_publishing_past_a_missing_review_is_recorded_and_shown(self):
        """An admin may decide the recruitment cannot wait for a member who
        has stopped answering, but never quietly: the decision is logged
        against them and against each person skipped, and the published plan
        names who did not confirm so the committee can still flag an
        inhabilitet nobody checked for."""
        second_application = self._second_application()
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)
        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        schedule = self._schedule(time=540) + second_entry

        res = self.client.post(
            self.url,
            {
                "schedule": schedule,
                "is_distributed": True,
                "publish_without_full_review": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertTrue(saved.is_distributed)
        self.assertEqual(
            saved.published_without_review_by,
            [self.admin_user.get_full_name() or self.admin_user.username],
        )
        self.assertEqual(res.data["published_without_review_by"], ["hardening-admin"])
        bypass = ConflictReviewAuditEvent.objects.filter(
            admission=self.admission,
            action=ConflictReviewAuditEvent.ACTION_BYPASSED,
        )
        self.assertEqual(bypass.count(), 1)
        self.assertEqual(bypass.get().actor_username, self.admin_user.username)
        self.assertEqual(bypass.get().subject_username, self.admin_user.username)

    def test_the_bypass_is_opt_in_per_publish_not_sticky(self):
        """The note must not outlive the decision. A later publish with
        everyone confirmed clears it; an ordinary edit in between leaves it
        alone rather than silently wiping the record."""
        second_application = self._second_application()
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)
        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        schedule = self._schedule(time=540) + second_entry
        self.client.post(
            self.url,
            {
                "schedule": schedule,
                "is_distributed": True,
                "publish_without_full_review": True,
            },
            format="json",
        )
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertTrue(saved.published_without_review_by)

        # An unrelated edit while published keeps the note.
        res = self.client.post(
            self.url,
            {
                "name_visibility": "admin_only",
                "expected_updated_at": saved.updated_at,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertTrue(saved.published_without_review_by)

        # Publishing again once everybody has confirmed clears it.
        self._mark_reviewed(self.application, second_application)
        res = self.client.post(
            self.url,
            {
                "schedule": schedule,
                "is_distributed": True,
                "expected_updated_at": saved.updated_at,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertEqual(saved.published_without_review_by, [])

    def test_publish_without_the_flag_still_refuses(self):
        """The override has to be asked for. Absent the flag the gate is
        exactly as strict as before."""
        second_application = self._second_application()
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)
        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=540) + second_entry,
                "is_distributed": True,
                "publish_without_full_review": False,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kontrollere", res.data["schedule"][0])
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                action=ConflictReviewAuditEvent.ACTION_BYPASSED
            ).exists()
        )

    def test_taking_plan_back_to_draft_clears_the_bypass_note(self):
        """The three-way rule: unlocking the plan to draft clears the note
        because there is no published plan to mark. A subsequent publish
        with full review leaves it cleared."""
        second_application = self._second_application()
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)
        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        schedule = self._schedule(time=540) + second_entry

        # First: bypass on a publish.
        self.client.post(
            self.url,
            {
                "schedule": schedule,
                "is_distributed": True,
                "publish_without_full_review": True,
            },
            format="json",
        )
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertTrue(saved.published_without_review_by)

        # Unlocking back to draft clears the note.
        res = self.client.post(
            self.url,
            {
                "is_distributed": False,
                "expected_updated_at": saved.updated_at,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertEqual(saved.published_without_review_by, [])

    def test_on_behalf_write_then_publishes_cleanly(self):
        """The two override paths are meant to compose: an admin who has
        chased a missing reviewer records their answer on their behalf via
        the availability endpoint's `user_id` field, which makes the
        kandidatkontroll complete and removes the need for
        `publish_without_full_review` at all. This locks in that the
        precise path is enough on its own: no bypass flag, no audit
        event, no `published_without_review_by` note."""
        second_application = self._second_application()
        second_interviewer = LegoUser.objects.create(
            username="on-behalf-target", lego_id=700
        )
        Membership.objects.create(
            user=second_interviewer, role=MEMBER, group=self.admin_group
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=second_interviewer,
            slots=["2026-04-20|600"],
        )
        second_entry = self._schedule(time=600)
        second_entry[0]["candidate_id"] = str(second_application.pk)
        second_entry[0]["panel"] = [
            {"id": str(second_interviewer.pk), "name": "on-behalf-target"},
        ]
        self._create_saved(is_distributed=False, schedule=self._schedule(time=540))
        self._mark_reviewed(self.application)

        # Refused first: the second interviewer has not answered.
        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=540) + second_entry,
                "is_distributed": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("kontrollere", res.data["schedule"][0])

        # Admin records the second interviewer's review on their behalf.
        availability_url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.admin_group.pk,
            },
        )
        res = self.client.post(
            availability_url,
            {
                "user_id": str(second_interviewer.pk),
                "reviewed_candidate_ids": [str(second_application.pk)],
                "conflicts": [],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        # Now the publish goes through cleanly without the bypass flag.
        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=540) + second_entry,
                "is_distributed": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_distributed"])
        self.assertEqual(res.data.get("published_without_review_by"), [])
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(saved.published_without_review_by, [])
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                action=ConflictReviewAuditEvent.ACTION_BYPASSED
            ).exists()
        )

    def test_manual_publish_enforces_same_gender(self):
        self.candidate_user.gender = "male"
        self.candidate_user.save(update_fields=["gender"])
        self.admin_user.gender = "female"
        self.admin_user.save(update_fields=["gender"])
        self._create_saved(
            solver_options={"enforce_same_gender": True, "allow_overtime": True}
        )

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(), "is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("samme kjønn", str(res.data))

    def test_manual_publish_enforces_same_panel_per_block(self):
        second_candidate = LegoUser.objects.create(
            username="second-candidate", lego_id=603
        )
        second_application = UserApplication.objects.create(
            admission=self.admission,
            user=second_candidate,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Second panel application",
        )
        second_interviewer = LegoUser.objects.create(
            username="second-interviewer", lego_id=604
        )
        Membership.objects.create(
            user=second_interviewer, role=MEMBER, group=self.admin_group
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=second_interviewer,
            slots=["2026-04-20|600"],
        )
        self._create_saved(
            schedule=[],
            solver_options={"same_panel_per_block": True, "allow_overtime": True},
        )
        schedule = self._schedule()
        schedule.append(
            {
                "candidate": "ignored",
                "candidate_id": str(second_application.pk),
                "time": 600,
                "panel": [{"id": str(second_interviewer.pk), "name": "ignored"}],
            }
        )

        res = self.client.post(
            self.url,
            {"schedule": schedule, "is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("samme panel", str(res.data))

    def test_candidate_cannot_be_their_own_interviewer(self):
        Membership.objects.create(
            user=self.candidate_user, role=MEMBER, group=self.admin_group
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=self.candidate_user,
            slots=["2026-04-20|540"],
        )
        self._create_saved(schedule=[])

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(
                    panel=[
                        {
                            "id": str(self.candidate_user.pk),
                            "name": self.candidate_user.username,
                        }
                    ]
                ),
                "is_distributed": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("intervjue seg selv", str(res.data))

    def test_explicit_true_with_empty_schedule_is_rejected(self):
        self._create_saved()

        res = self.client.post(
            self.url,
            {"schedule": [], "is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_distributed", res.data)
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
                "schedule": self._schedule(time=600),
                "expected_updated_at": stale,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(set(res.data), {"detail"})
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).schedule,
            self._schedule(),
        )

    def test_admin_must_send_explicit_revision(self):
        client = APIClient()
        client.force_authenticate(user=self.admin_user)

        create_without_revision = client.post(
            self.url,
            {"start_date": "2026-04-21", "session_duration": 60},
            format="json",
        )
        self.assertEqual(
            create_without_revision.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("expected_updated_at", create_without_revision.data)

        created = client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "expected_updated_at": None,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_200_OK)
        self.assertTrue(
            SavedSchedule.objects.get(admission=self.admission).solver_options[
                "require_experienced_panel"
            ]
        )

        update_without_revision = client.post(
            self.url,
            {"session_duration": 30},
            format="json",
        )
        self.assertEqual(
            update_without_revision.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("expected_updated_at", update_without_revision.data)
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).session_duration,
            60,
        )

    def test_non_null_revision_cannot_create_schedule(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "expected_updated_at": timezone.now().isoformat(),
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(set(res.data), {"detail"})
        self.assertFalse(
            SavedSchedule.objects.filter(admission=self.admission).exists()
        )

    def test_explicit_null_revision_prevents_second_create(self):
        first = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "expected_updated_at": None,
            },
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        second = self.client.post(
            self.url,
            {
                "start_date": "2026-04-22",
                "session_duration": 30,
                "expected_updated_at": None,
            },
            format="json",
        )

        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(set(second.data), {"detail"})
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(saved.start_date.isoformat(), "2026-04-21")
        self.assertEqual(saved.session_duration, 60)

    def test_expected_updated_at_match_allows_save(self):
        saved = self._create_saved()

        res = self.client.post(
            self.url,
            {
                "schedule": self._schedule(time=600),
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).schedule,
            [
                {
                    "candidate": self.candidate_user.username,
                    "candidate_id": str(self.application.pk),
                    "time": 600,
                    "panel": [
                        {
                            "id": str(self.admin_user.pk),
                            "name": self.admin_user.username,
                            "is_overtime": False,
                            "experience_level": "unknown",
                        }
                    ],
                }
            ],
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

    def test_partial_update_cannot_invert_date_range(self):
        self._create_saved()
        InterviewAvailability.objects.filter(
            admission=self.admission, user=self.admin_user
        ).update(slots=["2026-04-20|540"])

        res = self.client.post(self.url, {"end_date": "2026-04-01"}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(str(saved.end_date), "2026-04-24")
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission, user=self.admin_user
            ).exists()
        )

    def test_partial_start_date_after_existing_end_date_is_rejected(self):
        self._create_saved()

        res = self.client.post(self.url, {"start_date": "2026-04-30"}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(str(saved.start_date), "2026-04-20")

    def test_partial_update_cannot_invert_day_window(self):
        self._create_saved()

        res = self.client.post(self.url, {"day_end_minute": 300}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("day_end_minute", res.data)
        self.assertEqual(
            SavedSchedule.objects.get(admission=self.admission).day_end_minute, 1080
        )

    def test_enabled_window_with_garbage_date_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "enabled_windows": [
                    {"date": "not-a-date", "start_minute": 540, "end_minute": 600}
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("enabled_windows", res.data)
        self.assertFalse(
            SavedSchedule.objects.filter(admission=self.admission).exists()
        )

    def test_enabled_window_with_non_integer_minutes_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "enabled_windows": [
                    {"date": "2026-04-21", "start_minute": "nope", "end_minute": 600}
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("enabled_windows", res.data)

    def test_enabled_window_with_inverted_minutes_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "enabled_windows": [
                    {"date": "2026-04-21", "start_minute": 600, "end_minute": 540}
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("enabled_windows", res.data)

    def test_valid_enabled_windows_are_expanded_to_slots(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "enabled_windows": [
                    {"date": "2026-04-21", "start_minute": 540, "end_minute": 660}
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = SavedSchedule.objects.get(admission=self.admission)
        self.assertEqual(saved.enabled_slots, ["2026-04-21|540", "2026-04-21|600"])

    def test_garbage_date_in_enabled_slots_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-21",
                "session_duration": 60,
                "enabled_slots": ["not-a-date|540", "2026-04-21|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            SavedSchedule.objects.filter(admission=self.admission).exists()
        )

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
                        "candidate": "Spoofed",
                        "candidate_id": str(self.application.pk),
                        "time": 600,
                        "panel": [
                            {
                                "id": str(self.admin_user.pk),
                                "name": "Spoofed",
                                "extra": "nope",
                            }
                        ],
                        "locked": True,
                        "booking_source": "manual",
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
        self.assertEqual(stored["candidate_id"], str(self.application.pk))
        self.assertEqual(stored["candidate"], self.candidate_user.username)
        self.assertEqual(stored["panel"][0]["name"], self.admin_user.username)
        self.assertTrue(stored["locked"])
        self.assertEqual(stored["booking_source"], "manual")

    def test_schedule_item_rejects_unknown_booking_source(self):
        self._create_saved(is_distributed=False)
        schedule = self._schedule()
        schedule[0]["booking_source"] = "spreadsheet"

        response = self.client.post(self.url, {"schedule": schedule}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", response.data)

    def test_schedule_outside_enabled_grid_is_rejected(self):
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url, {"schedule": self._schedule(time=720)}, format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_unknown_interviewer_is_rejected(self):
        self._create_saved(is_distributed=False)
        outsider = LegoUser.objects.create(username="panel-outsider", lego_id=603)
        schedule = self._schedule()
        schedule[0]["panel"] = [{"id": str(outsider.pk), "name": "Outsider"}]

        res = self.client.post(self.url, {"schedule": schedule}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_registered_conflict_is_rejected(self):
        self._create_saved(is_distributed=False)
        InterviewAvailability.objects.filter(
            admission=self.admission, user=self.admin_user
        ).update(conflicts=[str(self.application.pk)])

        res = self.client.post(self.url, {"schedule": self._schedule()}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_derived_fadderbarn_conflict_is_rejected(self):
        """canonicalize_schedule must catch this too, not just the solver.

        A manually-edited or imported schedule bypasses the solver's own
        "biased" set entirely, so this is the only place a fadderbarn pairing
        the interviewer never explicitly ticked would otherwise be caught.
        """
        self._create_saved(is_distributed=False)
        FadderbarnDeclaration.objects.create(
            admission=self.admission,
            interviewer=self.admin_user,
            lego_user_id=self.candidate_user.lego_id,
            username=self.candidate_user.username,
            full_name="",
        )

        res = self.client.post(self.url, {"schedule": self._schedule()}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_publishing_requires_every_active_candidate(self):
        self._create_saved(is_distributed=False)
        second_user = LegoUser.objects.create(username="second-candidate", lego_id=604)
        UserApplication.objects.create(
            admission=self.admission, user=second_user, phone_number="12345678"
        )

        res = self.client.post(
            self.url,
            {"schedule": self._schedule(), "is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", res.data)

    def test_partial_draft_is_preserved_when_widening_enabled_days(self):
        """Incremental multi-day solving: a partial draft (some
        candidates placed, others unplaced because of capacity) must
        survive a PATCH that adds more enabled days. The user widens
        the schedule to fit the rest, then re-runs the solver with
        the partial plan passed back as locked_assignments.
        """
        saved = self._create_saved(
            is_distributed=False,
            start_date="2026-04-20",
            end_date="2026-04-24",
            enabled_slots=[
                "2026-04-20|540",
                "2026-04-20|600",
                "2026-04-20|660",
            ],
        )
        original_candidate_id = saved.schedule[0]["candidate_id"]
        original_time = saved.schedule[0]["time"]
        original_enabled = list(saved.enabled_slots)

        # PATCH widens the enabled days without disturbing the partial plan.
        res = self.client.post(
            self.url,
            {
                "enabled_slots": original_enabled
                + [
                    "2026-04-21|540",
                    "2026-04-21|600",
                    "2026-04-21|660",
                ],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # The existing partial plan survives - same candidate at the same time.
        self.assertEqual(len(res.data["schedule"]), 1)
        self.assertEqual(res.data["schedule"][0]["candidate_id"], original_candidate_id)
        self.assertEqual(res.data["schedule"][0]["time"], original_time)
        self.assertEqual(
            sorted(res.data["enabled_slots"]),
            sorted(
                original_enabled
                + [
                    "2026-04-21|540",
                    "2026-04-21|600",
                    "2026-04-21|660",
                ]
            ),
        )
        self.assertFalse(res.data["is_distributed"])
        saved.refresh_from_db()
        self.assertEqual(len(saved.schedule), 1)
        self.assertEqual(saved.schedule[0]["candidate_id"], original_candidate_id)
        self.assertEqual(saved.schedule[0]["time"], original_time)
        self.assertEqual(
            saved.enabled_slots,
            res.data["enabled_slots"],
        )

    def test_date_range_above_limit_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "start_date": "2026-04-01",
                "end_date": "2026-04-22",
                "session_duration": 60,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", res.data)


class SolveScheduleInputCapTestCase(APITestCase):
    def setUp(self):
        self.group = Group.objects.create(name="Solvercaps", lego_id=610)
        self.user = LegoUser.objects.create(username="caps-admin", lego_id=611)
        Membership.objects.create(user=self.user, role=RECRUITING, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="caps-opptak")
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        self.url = reverse("solve-schedule")

    def _solve(self, extra):
        payload = {
            "admission_slug": self.admission.slug,
            "group_id": str(self.group.pk),
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

    def test_missing_block_rest_option_defaults_to_true(self):
        serializer = SolveOptionsSerializer(data={"allow_overtime": False})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertTrue(
            serializer.validated_data["avoid_consecutive_interviewer_blocks"]
        )

    def test_compact_strategy_supplies_real_continuity_defaults(self):
        serializer = SolveOptionsSerializer(data={"initial_strategy": "compact_days"})

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["continuity_weight"], 48)
        self.assertEqual(serializer.validated_data["load_balance_weight"], 2)
        self.assertTrue(serializer.validated_data["prioritize_continuity"])

    def test_solver_runtime_budget_is_five_minutes_with_stale_job_headroom(self):
        self.assertEqual(constants.MAX_SOLVER_SECONDS, 5 * 60)
        self.assertGreaterEqual(
            constants.SOLVE_JOB_STALE_SECONDS,
            constants.MAX_SOLVER_SECONDS * 2,
        )

    def test_duplicate_slot_inside_block_is_rejected(self):
        res = self._solve({"all_slots": [0], "blocks": [[0, 0]]})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("blocks", res.data)

    def test_overlapping_blocks_are_rejected(self):
        res = self._solve({"all_slots": [0, 1, 2], "blocks": [[0, 1], [1, 2]]})

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("blocks", res.data)

    def test_second_enqueue_returns_the_active_job(self):
        first = self._solve({})
        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)
        second = self._solve({})
        self.assertEqual(second.status_code, status.HTTP_202_ACCEPTED)

        self.assertEqual(first.data["job_id"], second.data["job_id"])
        self.assertEqual(SolveJob.objects.filter(admission=self.admission).count(), 1)

    def test_second_enqueue_with_different_request_returns_conflict(self):
        first = self._solve({})
        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)

        second = self._solve({"options": {"allow_overtime": False}})

        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(second.data["active_job"]["job_id"], first.data["job_id"])

    def test_db_rejects_a_second_active_job_for_the_same_admission(self):
        SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={},
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            SolveJob.objects.create(
                admission=self.admission,
                group=self.group,
                requested_by=self.user,
                request_data={},
                status=SolveJob.STATUS_RUNNING,
            )

    def test_finished_job_does_not_block_a_new_enqueue(self):
        SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_DONE,
        )

        res = self._solve({})

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(SolveJob.objects.filter(admission=self.admission).count(), 2)

    def test_enqueue_losing_the_race_rejects_a_different_winning_job(self):
        winner = SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={},
        )

        real_filter = SolveJob.objects.filter
        calls = []

        def filter_missing_the_winner(*args, **kwargs):
            calls.append(1)
            if len(calls) == 1:
                return SolveJob.objects.none()
            return real_filter(*args, **kwargs)

        with mock.patch.object(
            SolveJob.objects, "filter", side_effect=filter_missing_the_winner
        ):
            res = self._solve({})

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(str(res.data["active_job"]["job_id"]), str(winner.id))
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
            user=self.admin_user, role=RECRUITING, group=self.admin_group
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
        GroupApplication.objects.create(
            application=self.application,
            group=self.committee_group,
            text="Komite application",
        )

        self.url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee_group.pk,
            },
        )

    def _create_saved_schedule(self, **overrides):
        defaults = {
            "admission": self.admission,
            "group": self.committee_group,
            "schedule": [],
            "start_date": "2026-04-21",
            "session_duration": 60,
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def _open_conflict_review(self):
        return self._create_saved_schedule(
            conflict_review_open=True,
            enabled_slots=["2026-04-21|540"],
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": self.applicant.username,
                    "time": 540,
                    "panel": [
                        {
                            "id": str(self.member.pk),
                            "name": self.member.username,
                        }
                    ],
                }
            ],
        )

    def test_slot_outside_enabled_grid_is_rejected(self):
        """A slot the plan does not contain always means the client was built
        against a different framework (the grid never offers non-enabled
        slots), so the answer is the reload conflict - even when the submitted
        generation happens to match, e.g. when the schedule and availability
        caches briefly disagree.
        """
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"slots": ["2026-04-21|600"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("slots", res.data)
        self.assertIn("Last inn siden på nytt", str(res.data))
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                group=self.committee_group,
                user=self.recruiter,
            ).exists()
        )

    def test_legacy_colon_slot_key_is_stored_canonicalized(self):
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"slots": ["2026-04-21:540"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["slots"], ["2026-04-21|540"])
        self.assertEqual(
            InterviewAvailability.objects.get(
                admission=self.admission, user=self.recruiter
            ).slots,
            ["2026-04-21|540"],
        )

    def test_malformed_slot_key_is_rejected(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"slots": ["not-a-slot"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_only_interview_admin_can_classify_experience(self):
        self.client.force_authenticate(user=self.member)

        forbidden = self.client.post(
            self.url,
            {"experience_level": InterviewAvailability.EXPERIENCE_EXPERIENCED},
            format="json",
        )

        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                group=self.committee_group,
                user=self.member,
            ).exists()
        )

        self.client.force_authenticate(user=self.recruiter)
        allowed = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "experience_level": InterviewAvailability.EXPERIENCE_EXPERIENCED,
            },
            format="json",
        )

        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual(allowed.data["experience_level"], "experienced")
        self.assertEqual(
            InterviewAvailability.objects.get(
                admission=self.admission,
                user=self.member,
            ).experience_level,
            InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )

    def test_non_admin_reads_unknown_experience_but_admin_reads_classification(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )
        self.client.force_authenticate(user=self.member)

        member_response = self.client.get(self.url)

        self.assertEqual(member_response.status_code, status.HTTP_200_OK)
        self.assertEqual(member_response.data[0]["experience_level"], "unknown")

        self.client.force_authenticate(user=self.recruiter)
        admin_response = self.client.get(self.url)

        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        by_user = {str(item["user_id"]): item for item in admin_response.data}
        self.assertEqual(
            by_user[str(self.member.pk)]["experience_level"],
            "experienced",
        )

    def test_experience_change_advances_revision_and_invalidates_approvals(self):
        saved_schedule = self._create_saved_schedule()
        approval = ScheduleDeviationApproval.objects.create(
            admission=self.admission,
            saved_schedule=saved_schedule,
            actor=self.recruiter,
            actor_username=self.recruiter.username,
            schedule_fingerprint="a" * 64,
            deviation_fingerprint="b" * 64,
            policy_snapshot={},
            availability_generation=saved_schedule.availability_generation,
            layout_version=saved_schedule.layout_version,
        )
        previous_revision = saved_schedule.updated_at
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "experience_level": InterviewAvailability.EXPERIENCE_INEXPERIENCED,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        saved_schedule.refresh_from_db()
        self.assertGreater(saved_schedule.updated_at, previous_revision)
        self.assertFalse(
            ScheduleDeviationApproval.objects.filter(pk=approval.pk).exists()
        )

    def test_slot_with_out_of_range_minute_is_rejected(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"slots": ["2026-04-21|1440"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_reviewed_id_outside_scope_is_dropped_not_rejected(self):
        """A real candidate in this committee that is outside the submitter's
        current review scope is dropped, not rejected.

        The review scope is a snapshot, regenerated whenever the plan changes
        (`_refresh_conflict_review_lists`) - and the plan re-solves by itself
        the moment the last outstanding review lands. So an interviewer who
        has the review form open can have their scope rewritten underneath
        them and submit ids that were in scope when they read the page. Those
        ids are real and were never persisted on this row, so neither the
        stale-echo nor the sentinel escape hatch catches them: before this,
        a routine save died on 400 "Ukjent kandidat".
        """
        other_applicant = LegoUser.objects.create(
            username="hardening-applicant-2", lego_id=6251
        )
        other_application = UserApplication.objects.create(
            user=other_applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=other_application,
            group=self.committee_group,
            text="Komite application 2",
        )
        saved_schedule = self._open_conflict_review()
        # The recruiter is on the panel for self.application, so the review
        # is open *for them* and their scope is exactly that one candidate.
        saved_schedule.schedule[0]["panel"] = [
            {"id": str(self.recruiter.pk), "name": self.recruiter.username}
        ]
        saved_schedule.save(update_fields=["schedule"])
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.recruiter)

        # other_application is a real candidate in this committee, but the
        # recruiter is not on its panel.
        res = self.client.post(
            self.url,
            {
                "reviewed_candidate_ids": [
                    str(self.application.pk),
                    str(other_application.pk),
                ]
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        stored = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
        )
        # The in-scope attestation sticks; the out-of-scope one is dropped
        # rather than rejected, so the save always goes through.
        self.assertEqual(stored.reviewed_candidate_ids, [str(self.application.pk)])

    def test_recruiter_declares_conflict_outside_own_panel_scope(self):
        """Same shape for `conflicts`: a recruiter must be able to declare
        inhabilitet against any candidate in their committee, whether or not
        they happen to sit on that candidate's proposed panel. Declaring one
        is precisely how a bad pairing gets *avoided* before it is planned,
        so scoping it to already-proposed pairings defeats the purpose.
        """
        other_applicant = LegoUser.objects.create(
            username="hardening-applicant-3", lego_id=6252
        )
        other_application = UserApplication.objects.create(
            user=other_applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=other_application,
            group=self.committee_group,
            text="Komite application 3",
        )
        saved_schedule = self._open_conflict_review()
        saved_schedule.schedule[0]["panel"] = [
            {"id": str(self.recruiter.pk), "name": self.recruiter.username}
        ]
        saved_schedule.save(update_fields=["schedule"])
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(other_application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        stored = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
        )
        self.assertIn(str(other_application.pk), stored.conflicts)

    def test_phantom_conflict_id_is_dropped_not_rejected(self):
        """Submitting a conflicts list with a phantom id (e.g. a stale
        snapshot) is treated as a best-effort drop, not a client error.
        The persistence path prunes unknown ids from the saved set, so
        dropping them on the way in keeps the row working without ever
        surfacing a scary "Ukjent kandidat" toast to the admin."""
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": ["00000000-0000-0000-0000-000000000000"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_stale_reviewed_echo_is_dropped_not_rejected(self):
        """reviewed_candidate_ids echoes the row's own persisted attestations
        back from the GET, so a candidate that left the pool between the GET
        and the POST (withdrawal, soft-deleted application) must not wedge
        the whole review behind "Ukjent kandidat". The pool, the review
        scope, and the decoy roster can all shift while the form is open,
        so any id the server doesn't recognize is dropped silently - the
        persistence path prunes it from the saved set anyway, so dropping
        it on the way in just saves a round trip and a scary error. The
        row keeps working.
        """
        saved_schedule = self._open_conflict_review()
        saved_schedule.schedule[0]["panel"] = [
            {"id": str(self.recruiter.pk), "name": self.recruiter.username}
        ]
        saved_schedule.save(update_fields=["schedule"])
        stale_id = "802f250d-33e9-432c-a97d-f73443ec322a"
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            reviewed_candidate_ids=[stale_id],
        )
        self.client.force_authenticate(user=self.recruiter)

        # The save echoes what the GET showed: the stale id plus the newly
        # checked candidate.
        res = self.client.post(
            self.url,
            {
                "reviewed_candidate_ids": [
                    stale_id,
                    str(self.application.pk),
                ]
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability.refresh_from_db()
        # The stale echo vanished; the real attestation stuck.
        self.assertEqual(
            availability.reviewed_candidate_ids,
            [str(self.application.pk)],
        )

        # A novel unknown id - never persisted on this row, not in the
        # pool, not a decoy - is also dropped, not rejected. The user can
        # always save, the persisted state is the source of truth, and
        # "Ukjent kandidat" never reaches the UI.
        novel = self.client.post(
            self.url,
            {"reviewed_candidate_ids": ["00000000-0000-0000-0000-000000000000"]},
            format="json",
        )
        self.assertEqual(novel.status_code, status.HTTP_200_OK, novel.data)
        availability.refresh_from_db()
        self.assertEqual(
            availability.reviewed_candidate_ids,
            [str(self.application.pk)],
        )

    def test_unknown_conflict_id_is_dropped_not_rejected(self):
        """Same rule for declared conflicts: a stale id (the applicant was
        removed between the GET and the POST, or the form was built against
        a snapshot that no longer matches) is dropped, not rejected.
        Strict per-id rejection on the conflicts field would let a single
        phantom id block saving a perfectly valid set of declarations."""
        saved_schedule = self._open_conflict_review()
        saved_schedule.schedule[0]["panel"].append(
            {"id": str(self.recruiter.pk), "name": self.recruiter.username}
        )
        saved_schedule.save(update_fields=["schedule"])
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {
                "conflicts": [
                    str(self.application.pk),
                    "00000000-0000-0000-0000-000000000000",
                ]
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability.refresh_from_db()
        self.assertEqual(availability.conflicts, [str(self.application.pk)])

    def test_a_phantom_id_never_seen_before_does_not_wedge_the_review(self):
        """The reported bug: the browser cached the availability GET, the plan
        re-solved and regenerated the review lists, and the cached
        proposed_candidate_ids still carried a candidate id that is now in no
        list at all. Submitted in both `conflicts` and `reviewed_candidate_ids`
        alongside a real attestation, it must not 400 the whole save with
        "Ukjent kandidat" - it is dropped, and the real data lands."""
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.member)
        phantom = "0aac87c4-6207-4aaa-9e3b-858890212899"

        res = self.client.post(
            self.url,
            {
                "conflicts": [phantom],
                "reviewed_candidate_ids": [str(self.application.pk), phantom],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertNotIn("Ukjent kandidat", str(res.data))
        stored = InterviewAvailability.objects.get(
            admission=self.admission, group=self.committee_group, user=self.member
        )
        self.assertEqual(stored.reviewed_candidate_ids, [str(self.application.pk)])
        self.assertNotIn(phantom, stored.conflicts)
        self.assertNotIn(phantom, stored.reviewed_candidate_ids)

    def test_stale_reviewed_id_is_pruned_on_next_save(self):
        """A name the user once checked must stay checked, but the pool can
        shrink - and once it does, an old attestation would block every
        future save with "Ukjent kandidat". Prune persisted IDs that are no
        longer in the current pool on save, so the rest of the row keeps
        working without re-prompting the user about names that are gone.
        """
        # Open the review with the recruiter on the panel so their review
        # scope actually contains the application - the default helper
        # only puts the member on the panel, leaving the recruiter's scope
        # empty and any submit rejected.
        self._create_saved_schedule(
            conflict_review_open=True,
            enabled_slots=["2026-04-21|540"],
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": self.applicant.username,
                    "time": 540,
                    "panel": [
                        {
                            "id": str(self.recruiter.pk),
                            "name": self.recruiter.username,
                        },
                        {
                            "id": str(self.member.pk),
                            "name": self.member.username,
                        },
                    ],
                }
            ],
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            reviewed_candidate_ids=[
                "802f250d-33e9-432c-a97d-f73443ec322a",
                str(self.application.pk),
            ],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"reviewed_candidate_ids": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability.refresh_from_db()
        # The stale, no-longer-in-pool id was pruned; the still-current one
        # was preserved. The user never saw an error and never had to clear
        # a row by hand.
        self.assertEqual(
            availability.reviewed_candidate_ids,
            [str(self.application.pk)],
        )

    def test_review_save_never_deletes_a_live_declared_conflict(self):
        """A declared inhabilitet against an application that still exists
        survives a review save, whatever committee that application belongs
        to. The prune is allowed to clear ids that name nothing; it is never
        allowed to clear one that names a real person, because the result
        would be an inhabil interviewer quietly back on a panel.
        """
        other_group = Group.objects.create(name="Annen komite", lego_id=6401)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(
            username="live-conflict-candidate", lego_id=6402
        )
        other_application = UserApplication.objects.create(
            user=other_user, admission=self.admission
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Other committee application",
        )
        saved_schedule = self._open_conflict_review()
        saved_schedule.schedule[0]["panel"] = [
            {"id": str(self.recruiter.pk), "name": self.recruiter.username}
        ]
        saved_schedule.save(update_fields=["schedule"])
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[str(other_application.pk)],
            # A genuinely dead id alongside it, to show the prune still works.
            reviewed_candidate_ids=["802f250d-33e9-432c-a97d-f73443ec322a"],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"reviewed_candidate_ids": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability.refresh_from_db()
        self.assertEqual(availability.conflicts, [str(other_application.pk)])

    def test_stale_conflict_id_is_pruned_on_next_save(self):
        """Same prune applies to declared conflicts: a withdrawn application
        must not leave the row in a state that rejects every future save."""
        self._create_saved_schedule(
            conflict_review_open=True,
            enabled_slots=["2026-04-21|540"],
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": self.applicant.username,
                    "time": 540,
                    "panel": [
                        {
                            "id": str(self.recruiter.pk),
                            "name": self.recruiter.username,
                        }
                    ],
                }
            ],
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[
                "802f250d-33e9-432c-a97d-f73443ec322a",
                str(self.application.pk),
            ],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability.refresh_from_db()
        self.assertEqual(availability.conflicts, [str(self.application.pk)])

    def test_member_can_review_own_scope_but_not_outside_it(self):
        """A member confirms their own review (their review scope) but can
        never record anything against a candidate outside it - the candidate
        pool stays empty and an out-of-scope id is dropped, not persisted."""
        other_group = Group.objects.create(name="Andre", lego_id=630)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(username="other-review", lego_id=631)
        other_application = UserApplication.objects.create(
            user=other_user,
            admission=self.admission,
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Other application",
        )
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.member)

        candidates_res = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        # In-scope: the candidate assigned to this member's panel.
        own_review = self.client.post(
            self.url,
            {
                "conflicts": [],
                "reviewed_candidate_ids": [str(self.application.pk)],
            },
            format="json",
        )
        # Out-of-scope: a candidate from another group entirely.
        outside_review = self.client.post(
            self.url,
            {
                "conflicts": [str(other_application.pk)],
                "reviewed_candidate_ids": [
                    str(self.application.pk),
                    str(other_application.pk),
                ],
            },
            format="json",
        )
        # Posting on another interviewer's behalf stays forbidden.
        on_behalf = self.client.post(
            self.url,
            {
                "user_id": str(self.recruiter.pk),
                "reviewed_candidate_ids": [str(self.application.pk)],
            },
            format="json",
        )

        self.assertEqual(candidates_res.status_code, status.HTTP_200_OK)
        self.assertEqual(candidates_res.data, [])
        self.assertEqual(own_review.status_code, status.HTTP_200_OK)
        # The out-of-scope references are dropped, not rejected - the save goes
        # through and the in-scope attestation sticks.
        self.assertEqual(outside_review.status_code, status.HTTP_200_OK)
        stored = InterviewAvailability.objects.get(
            admission=self.admission, group=self.committee_group, user=self.member
        )
        self.assertNotIn(str(other_application.pk), stored.conflicts)
        self.assertNotIn(str(other_application.pk), stored.reviewed_candidate_ids)
        self.assertIn(str(self.application.pk), stored.reviewed_candidate_ids)
        self.assertEqual(on_behalf.status_code, status.HTTP_403_FORBIDDEN)

    def test_draft_review_preserves_conflicts_outside_the_proposal_scope(self):
        other_group = Group.objects.create(name="Andre bevart", lego_id=638)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(
            username="preserved-conflict-candidate",
            lego_id=639,
        )
        other_application = UserApplication.objects.create(
            user=other_user,
            admission=self.admission,
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Other application",
        )
        self._open_conflict_review()
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[str(other_application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            self.url,
            {
                "conflicts": [],
                "reviewed_candidate_ids": [str(self.application.pk)],
            },
            format="json",
        )

        # The reviewer (recruiter) has no review scope here - the panel
        # belongs to the member - so their attestation for a candidate they
        # were not asked about is dropped rather than rejected: the save goes
        # through, and the review simply stays incomplete.
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        availability.refresh_from_db()
        # The invariant that actually matters is unchanged, and is enforced by
        # `conflict_replace_scope` rather than by the status code: an empty
        # review scope clears nothing, so a conflict held against a candidate
        # outside it survives untouched.
        self.assertEqual(availability.conflicts, [str(other_application.pk)])
        # Nothing out of scope was attested to either.
        self.assertEqual(availability.reviewed_candidate_ids, [])

    def test_review_scope_requires_submitted_interview_availability(self):
        other_group = Group.objects.create(name="Andre uten tider", lego_id=632)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(username="hidden-review", lego_id=633)
        other_application = UserApplication.objects.create(
            user=other_user,
            admission=self.admission,
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Other application",
        )
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=[],
            reviewed_candidate_ids=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        candidates_res = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        availability_res = self.client.get(self.url)
        review_res = self.client.post(
            self.url,
            {
                "reviewed_candidate_ids": [
                    str(self.application.pk),
                    str(other_application.pk),
                ]
            },
            format="json",
        )

        self.assertEqual(candidates_res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["id"] for item in candidates_res.data},
            {str(self.application.pk)},
        )
        self.assertEqual(availability_res.status_code, status.HTTP_200_OK)
        me = next(item for item in availability_res.data if item["is_me"])
        self.assertEqual(me["proposed_candidate_ids"], [])
        self.assertEqual(me["affected_assignment_count"], 0)
        self.assertFalse(me["conflict_review_complete"])
        # The out-of-scope candidate is dropped rather than 400-ing the save;
        # the in-scope committee candidate still lands.
        self.assertEqual(review_res.status_code, status.HTTP_200_OK, review_res.data)
        stored = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
        )
        self.assertNotIn(str(other_application.pk), stored.reviewed_candidate_ids)

    def test_unassigned_new_candidate_does_not_invalidate_proposal_review(self):
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            slots=["2026-04-21|540"],
            reviewed_candidate_ids=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        before = self.client.get(self.url)
        new_user = LegoUser.objects.create(username="late-review", lego_id=634)
        UserApplication.objects.create(user=new_user, admission=self.admission)
        after = self.client.get(self.url)

        before_me = next(item for item in before.data if item["is_me"])
        after_me = next(item for item in after.data if item["is_me"])
        self.assertTrue(before_me["conflict_review_complete"])
        self.assertTrue(after_me["conflict_review_complete"])

    def test_new_proposed_candidate_requires_review(self):
        saved = self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            slots=["2026-04-21|540"],
            reviewed_candidate_ids=[str(self.application.pk)],
        )
        new_user = LegoUser.objects.create(username="new-proposal", lego_id=635)
        new_application = UserApplication.objects.create(
            user=new_user,
            admission=self.admission,
        )
        saved.schedule.append(
            {
                "candidate_id": str(new_application.pk),
                "candidate": new_user.username,
                "time": 600,
                "panel": [{"id": str(self.member.pk), "name": self.member.username}],
            }
        )
        saved.save(update_fields=["schedule"])
        self.client.force_authenticate(user=self.member)

        response = self.client.get(self.url)

        me = next(item for item in response.data if item["is_me"])
        self.assertFalse(me["conflict_review_complete"])
        self.assertEqual(
            set(me["proposed_candidate_ids"]),
            {str(self.application.pk), str(new_application.pk)},
        )

    def test_legacy_real_candidate_conflict_id_is_dropped(self):
        """A malformed legacy id (not a UUID, not a real application) is
        dropped, not rejected - the persistence path would prune it anyway,
        and a 400 only wedges the review."""
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [f"real-candidate-{self.applicant.username}"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["conflicts"], [])

    def test_admin_cannot_save_conflicts_for_unrepresented_committee(self):
        """Admin group members do not operate committee availability: an admin
        who is not a recruiter for this committee gets 403."""
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_recruiter_can_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["conflicts"], [str(self.application.pk)])

    def test_recruiter_conflict_for_an_unrepresented_candidate_is_not_recorded(self):
        """A recruiter for this committee cannot record an inhabilitet against
        a candidate who only applied elsewhere - the id is dropped, so the
        save succeeds but nothing crosses the committee boundary."""
        other_group = Group.objects.create(name="Annen komite", lego_id=626)
        self.admission.groups.add(other_group)
        other_candidate = LegoUser.objects.create(
            username="other-applicant", lego_id=627
        )
        other_application = UserApplication.objects.create(
            user=other_candidate, admission=self.admission
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Other application",
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(other_application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["conflicts"], [])
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                group=self.committee_group,
                user=self.recruiter,
                conflicts__contains=[str(other_application.pk)],
            ).exists()
        )

    def test_recruiter_sees_only_represented_group_availability(self):
        other_group = Group.objects.create(name="Annen komite", lego_id=628)
        self.admission.groups.add(other_group)
        other_member = LegoUser.objects.create(username="other-member", lego_id=629)
        Membership.objects.create(user=other_member, role=MEMBER, group=other_group)
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=other_member,
            slots=["2026-04-21|540"],
            conflicts=[],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # The committee's own people only: the admission admin-group member is
        # panel-eligible here but sits on no roster of this committee, and
        # neither does the other committee's member.
        self.assertEqual(
            {row["username"] for row in res.data},
            {
                "hardening-member",
                "hardening-recruiter",
            },
        )

    def test_member_cannot_save_conflicts_before_names_released(self):
        """Members may complete their own review, but only while the conflict
        review is actually open - with no plan there is nothing to review, so
        the save is rejected (as a validation error, not a permission error,
        since the member is allowed to submit their own row)."""
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Inhabilitet", str(res.data))
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                group=self.committee_group,
                user=self.member,
            ).exists()
        )

    def test_member_cannot_edit_conflicts_from_published_schedule(self):
        """A published plan closes the conflict review, so a member's attempt
        to touch inhabilitet afterwards is rejected and nothing is changed."""
        self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=[],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Inhabilitet", str(res.data))
        self.assertEqual(
            InterviewAvailability.objects.get(
                admission=self.admission,
                user=self.member,
            ).conflicts,
            [],
        )

    def test_partial_slots_update_preserves_conflicts(self):
        self._create_saved_schedule(enabled_slots=["2026-04-22|600"])
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"slots": ["2026-04-22|600"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = InterviewAvailability.objects.get(
            admission=self.admission, user=self.recruiter
        )
        self.assertEqual(saved.slots, ["2026-04-22|600"])
        self.assertEqual(saved.conflicts, [str(self.application.pk)])

    def test_partial_update_omits_conflicts_from_a_hidden_member_group(self):
        other_group = Group.objects.create(name="Skjult komite", lego_id=630)
        self.admission.groups.add(other_group)
        Membership.objects.create(user=self.recruiter, role=MEMBER, group=other_group)
        other_candidate = LegoUser.objects.create(
            username="hidden-applicant", lego_id=631
        )
        other_application = UserApplication.objects.create(
            user=other_candidate,
            admission=self.admission,
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Hidden application",
        )
        self._create_saved_schedule(
            enabled_slots=["2026-04-22|600"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            conflicts=[str(self.application.pk), str(other_application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"slots": ["2026-04-22|600"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["conflicts"], [str(self.application.pk)])

    def test_non_admin_availability_responses_omit_panel_gender(self):
        self.member.gender = "female"
        self.member.save(update_fields=["gender"])
        self._create_saved_schedule(enabled_slots=["2026-04-22|600"])
        self.client.force_authenticate(user=self.member)

        get_response = self.client.get(self.url)

        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data[0]["gender"], "")

    def test_slots_above_cap_are_rejected(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"slots": [f"2026-04-21|{minute}" for minute in range(10001)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slots", res.data)

    def test_conflicts_above_cap_are_rejected(self):
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(index) for index in range(501)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)

    def test_recruiter_can_clear_conflicts_while_names_are_hidden(self):
        self._create_saved_schedule(name_visibility="hidden")
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.recruiter,
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(self.url, {"conflicts": []}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = InterviewAvailability.objects.get(
            admission=self.admission, user=self.recruiter
        )
        self.assertEqual(saved.conflicts, [])

    def test_hidden_conflicts_are_redacted_from_member(self):
        self._create_saved_schedule(name_visibility="committee", is_distributed=False)
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member,
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data[0]["conflicts"], [])

    def test_saving_slots_marks_self_as_participating(self):
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            self.url,
            {"slots": ["2026-04-21|540"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["participation"], "participating")

    def test_member_cannot_change_another_users_participation(self):
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.recruiter.pk),
                "participation": "not_participating",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_opt_out_preserves_published_schedule_and_advances_revision(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": self.applicant.username,
                    "time": 540,
                    "panel": [
                        {
                            "id": str(self.member.pk),
                            "name": self.member.username,
                        }
                    ],
                }
            ],
        )
        original_schedule = saved.schedule
        original_revision = saved.updated_at
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "participation": "not_participating",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["affected_assignment_count"], 1)
        saved.refresh_from_db()
        self.assertEqual(saved.schedule, original_schedule)
        self.assertTrue(saved.is_distributed)
        self.assertGreater(saved.updated_at, original_revision)

    def test_admin_cannot_set_participation_for_non_roster_user(self):
        self._create_saved_schedule()
        outsider = LegoUser.objects.create(
            username="availability-outsider",
            lego_id=629,
        )
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            self.url,
            {
                "user_id": str(outsider.pk),
                "participation": "not_participating",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class SavedScheduleVisibilityTestCase(APITestCase):
    """The privacy boundary the whole distribution feature rests on."""

    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=700)
        self.committee_group = Group.objects.create(name="Arrkom", lego_id=701)
        self.admin_user = LegoUser.objects.create(username="vis-admin", lego_id=702)
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.committee_group
        )
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.admin_group
        )
        self.member_user = LegoUser.objects.create(username="vis-member", lego_id=703)
        Membership.objects.create(
            user=self.member_user, role=MEMBER, group=self.committee_group
        )
        self.admission = create_admission(created_by=self.admin_user, slug="vis-opptak")
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.committee_group)
        self.candidate_user = LegoUser.objects.create(
            username="vis-candidate",
            first_name="Ada",
            email="ada@example.com",
            lego_id=704,
        )
        self.application = UserApplication.objects.create(
            admission=self.admission, user=self.candidate_user
        )
        self.application.phone_number = "+47 400 00 000"
        self.application.save(update_fields=["phone_number"])
        self.group_application = GroupApplication.objects.create(
            application=self.application,
            group=self.committee_group,
            text="Arrkom application",
        )
        self.url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee_group.pk,
            },
        )

    def _create_saved(self, **overrides):
        defaults = {
            "admission": self.admission,
            "group": self.committee_group,
            "schedule": [
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                }
            ],
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "is_distributed": True,
            "name_visibility": "hidden",
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def _other_committee_recruiter(self):
        other_group = Group.objects.create(name="Bedkom", lego_id=705)
        self.admission.groups.add(other_group)
        recruiter = LegoUser.objects.create(username="vis-other-recruiter", lego_id=706)
        Membership.objects.create(user=recruiter, role=RECRUITING, group=other_group)
        return recruiter

    def _extra_candidate(self, username, lego_id, time):
        """Another candidate for this committee, scheduled at `time`."""

        user = LegoUser.objects.create(username=username, lego_id=lego_id)
        application = UserApplication.objects.create(
            admission=self.admission, user=user
        )
        GroupApplication.objects.create(
            application=application,
            group=self.committee_group,
            text="Arrkom application",
        )
        return {
            "candidate": username,
            "candidate_id": str(application.pk),
            "time": time,
            "panel": [],
        }

    def test_placeholder_names_survive_publishing_another_day(self):
        """A member who notes down "Kandidat 3, tirsdag 10:00" must still find
        the same person there after an admin extends the publication.

        Numbering over the rows in the response renumbered everybody whenever
        the published pool grew, so the label silently came to mean somebody
        else at the same time.
        """

        day_two = self._extra_candidate("vis-second", 760, 8 + 24 * 60)
        day_two_extra = self._extra_candidate("vis-third", 761, 9 + 24 * 60)
        saved = self._create_saved(
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                day_two,
                day_two_extra,
            ],
            distributed_through="2026-04-20",
        )
        self.client.force_authenticate(user=self.member_user)

        first_day_only = self.client.get(self.url).data["schedule"]
        # Only day one is published, so that is all a member may see.
        self.assertEqual(1, len(first_day_only))
        label_before = first_day_only[0]["candidate"]

        saved.distributed_through = "2026-04-21"
        saved.save(update_fields=["distributed_through"])
        after_extending = self.client.get(self.url).data["schedule"]

        self.assertEqual(3, len(after_extending))
        same_row = next(row for row in after_extending if row["time"] == 8)
        self.assertEqual(label_before, same_row["candidate"])
        # And every row still gets a distinct label.
        labels = [row["candidate"] for row in after_extending]
        self.assertEqual(len(labels), len(set(labels)))

    def test_cross_committee_recruiter_cannot_read_the_schedule(self):
        """Representing committee X grants nothing on committee Y's schedule."""
        self._create_saved(name_visibility="committee")
        self.client.force_authenticate(user=self._other_committee_recruiter())

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cross_committee_recruiter_cannot_flip_name_visibility(self):
        saved = self._create_saved(name_visibility="hidden")
        self.client.force_authenticate(user=self._other_committee_recruiter())

        res = self.client.post(
            self.url,
            {"name_visibility": "committee"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        saved.refresh_from_db()
        self.assertEqual(saved.name_visibility, "hidden")
        self.assertFalse(NameVisibilityAuditEvent.objects.exists())

    def test_own_committee_recruiter_still_flips_name_visibility(self):
        saved = self._create_saved(name_visibility="hidden")
        recruiter = LegoUser.objects.create(username="vis-own-recruiter", lego_id=707)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        self.client.force_authenticate(user=recruiter)

        res = self.client.post(
            self.url,
            {"name_visibility": "committee"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        saved.refresh_from_db()
        self.assertEqual(saved.name_visibility, "committee")

    def test_committee_member_sees_only_config_until_distributed(self):
        self._create_saved(is_distributed=False)
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(res.data["start_date"], "2026-04-20")

    def test_member_can_submit_availability_before_distribution(self):
        """Members record their own availability as soon as the recruiter
        has opened the interview windows - they do not wait for the
        published plan. Only their own row is writable: no user_id, no
        review fields, no experience level."""
        self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540"],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.post(
            reverse(
                "interview-availability",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            ),
            {"slots": ["2026-04-20|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
        )
        self.assertEqual(saved.slots, ["2026-04-20|540"])

    def test_committee_member_does_not_receive_schedule_rows_when_hidden(self):
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        schedule = res.data["schedule"]
        self.assertTrue(len(schedule) > 0)
        # Placeholder names, no real identity leaked.
        self.assertEqual(schedule[0]["candidate"], "Kandidat 1")
        self.assertNotIn("candidate_id", schedule[0])
        self.assertNotIn("candidate_phone", schedule[0])

    def test_committee_member_sees_names_when_visibility_committee(self):
        self._create_saved(is_distributed=True, name_visibility="committee")
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_member_who_opted_out_does_not_receive_the_schedule(self):
        """A member who opted out has no stake in the plan and must not see
        it - not even once it is published and revealed to the committee.
        The framework stays available so they can rejoin later."""
        self._create_saved(is_distributed=True, name_visibility="committee")
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        # The framework remains readable: rejoining still needs the windows.
        self.assertEqual(res.data["start_date"], "2026-04-20")

    def test_opted_out_member_can_still_rejoin(self):
        """Opting out is not permanent: the member can submit availability
        again, which flips participation back to participating."""
        self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.post(
            reverse(
                "interview-availability",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            ),
            {"slots": ["2026-04-20|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
        )
        self.assertEqual(
            row.participation, InterviewAvailability.PARTICIPATION_PARTICIPATING
        )

    def test_rejoining_preserves_existing_availability(self):
        self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540"],
        )
        row = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.post(
            reverse(
                "interview-availability",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            ),
            {"slots": ["2026-04-20|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        row.refresh_from_db()
        self.assertEqual(
            row.participation, InterviewAvailability.PARTICIPATION_PARTICIPATING
        )
        self.assertEqual(row.slots, ["2026-04-20|540"])

    def test_partial_publication_hides_rows_after_the_boundary_for_members(self):
        other_candidate = LegoUser.objects.create(
            username="vis-candidate-2",
            first_name="Bea",
            email="bea@example.com",
            lego_id=705,
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_candidate
        )
        GroupApplication.objects.create(
            application=other_application,
            group=self.committee_group,
            text="Arrkom application",
        )
        self._create_saved(
            is_distributed=False,
            distributed_through="2026-04-21",
            name_visibility="committee",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Bea",
                    "candidate_id": str(other_application.pk),
                    "time": 2 * 24 * 60 + 8,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        candidates = {entry["candidate"] for entry in res.data["schedule"]}
        self.assertEqual(candidates, {"Ada"})

    def test_partial_publication_still_shows_admin_the_whole_plan(self):
        other_candidate = LegoUser.objects.create(
            username="vis-candidate-2",
            first_name="Bea",
            email="bea@example.com",
            lego_id=705,
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_candidate
        )
        GroupApplication.objects.create(
            application=other_application,
            group=self.committee_group,
            text="Arrkom application",
        )
        self._create_saved(
            is_distributed=False,
            distributed_through="2026-04-21",
            name_visibility="committee",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Bea",
                    "candidate_id": str(other_application.pk),
                    "time": 2 * 24 * 60 + 8,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        candidates = {entry["candidate"] for entry in res.data["schedule"]}
        self.assertEqual(candidates, {"Ada", "Bea"})

    def test_legacy_schedule_rows_are_allowlisted_and_authoritative(self):
        private_marker = "private-value-that-must-not-leak"
        unrelated_user = LegoUser.objects.create(
            username="unrelated-panel-user",
            lego_id=739,
        )
        self._create_saved(
            is_distributed=True,
            name_visibility="committee",
            schedule=[
                {
                    "candidate": private_marker,
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [
                        {
                            "id": str(self.member_user.pk),
                            "name": private_marker,
                            "email": private_marker,
                            "is_overtime": True,
                        },
                        {
                            "id": str(unrelated_user.pk),
                            "name": private_marker,
                        },
                    ],
                    "locked": True,
                    "email": private_marker,
                    "gender": private_marker,
                    "application_text": private_marker,
                },
                private_marker,
                {
                    "candidate": private_marker,
                    "candidate_id": "legacy:missing-candidate",
                    "time": 9,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=self.member_user)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        workflow_fields = {
            key: response.data["schedule"][0].pop(key) for key in ("interview_status",)
        }
        self.assertEqual(
            response.data["schedule"],
            [
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [
                        {
                            "id": str(self.member_user.pk),
                            "name": self.member_user.username,
                            "is_overtime": True,
                        }
                    ],
                    "locked": True,
                }
            ],
        )
        self.assertEqual(workflow_fields["interview_status"], "not_invited")
        self.assertNotIn("interview_status_updated_at", response.data["schedule"][0])
        self.assertNotIn("interview_status_updated_by", response.data["schedule"][0])
        self.assertNotIn("candidate_email", response.data["schedule"][0])
        self.assertNotIn("candidate_phone", response.data["schedule"][0])
        self.assertNotContains(response, private_marker)

    def test_member_sees_status_but_not_recruiter_metadata_on_revealed_plan(self):
        """H4 regression: a committee member viewing a revealed published plan
        sees the candidate's interview_status value but not the recruiter-side
        metadata (who last changed it, when). The recruiter's identity is
        workflow information, not a published-plan field."""
        recruiter = LegoUser.objects.create(username="h4-recruiter", lego_id=746)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        self.group_application.interview_status = "confirmed"
        self.group_application.interview_status_updated_by = recruiter
        self.group_application.interview_status_updated_by_username = recruiter.username
        self.group_application.save(
            update_fields=[
                "interview_status",
                "interview_status_updated_by",
                "interview_status_updated_by_username",
            ]
        )
        self._create_saved(is_distributed=True, name_visibility="committee")

        # Member view: status visible, metadata hidden.
        self.client.force_authenticate(user=self.member_user)
        member_response = self.client.get(self.url)
        self.assertEqual(member_response.status_code, status.HTTP_200_OK)
        member_item = member_response.data["schedule"][0]
        self.assertEqual(member_item["interview_status"], "confirmed")
        self.assertNotIn("interview_status_updated_at", member_item)
        self.assertNotIn("interview_status_updated_by", member_item)

        # Recruiter view: status + metadata both visible.
        self.client.force_authenticate(user=recruiter)
        recruiter_response = self.client.get(self.url)
        self.assertEqual(recruiter_response.status_code, status.HTTP_200_OK)
        recruiter_item = recruiter_response.data["schedule"][0]
        self.assertEqual(recruiter_item["interview_status"], "confirmed")
        self.assertEqual(
            recruiter_item["interview_status_updated_by"], recruiter.username
        )

    def test_member_published_plan_does_not_leak_phone(self):
        """H3 regression: a published plan visible to a plain committee member
        must not include the candidate's phone number. Phone is gated by
        contact_candidate_ids in schedule_response_context, which is empty
        for non-admins. Guards against a future refactor that opens that
        field to non-admins."""
        self.application.phone_number = "+47 999 99 999"
        self.application.save(update_fields=["phone_number"])
        self._create_saved(is_distributed=True, name_visibility="committee")

        self.client.force_authenticate(user=self.member_user)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["schedule"]), 1)
        item = response.data["schedule"][0]
        self.assertNotIn("candidate_phone", item)
        self.assertNotIn("+47 999 99 999", str(response.data))

    def test_recruiter_receives_contact_and_workflow_for_visible_candidate(self):
        recruiter = LegoUser.objects.create(username="workflow-rec", lego_id=745)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        self.group_application.interview_status = "confirmed"
        self.group_application.interview_status_updated_by = recruiter
        self.group_application.interview_status_updated_by_username = recruiter.username
        self.group_application.save(
            update_fields=[
                "interview_status",
                "interview_status_updated_by",
                "interview_status_updated_by_username",
            ]
        )
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["schedule"][0]
        self.assertNotIn("candidate_email", item)
        self.assertEqual(item["candidate_phone"], "+47 400 00 000")
        self.assertEqual(item["interview_status"], "confirmed")
        self.assertEqual(item["interview_status_updated_by"], recruiter.username)

    def test_unpublish_then_republish_does_not_restore_name_visibility(self):
        slot = "2026-04-20|480"
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.admin_user,
            slots=[slot],
        )
        saved = self._create_saved(
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 480,
                    "panel": [
                        {
                            "id": str(self.admin_user.pk),
                            "name": self.admin_user.username,
                        }
                    ],
                }
            ],
            enabled_slots=[slot],
            panel_size=1,
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        self.client.force_authenticate(user=self.admin_user)

        unpublished = self.client.post(
            self.url,
            {
                "is_distributed": False,
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )
        self.assertEqual(unpublished.status_code, status.HTTP_200_OK)
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(reviewed_candidate_ids=[str(self.application.pk)])

        republished = self.client.post(
            self.url,
            {
                "is_distributed": True,
                "expected_updated_at": unpublished.data["updated_at"],
            },
            format="json",
        )

        self.assertEqual(
            republished.status_code,
            status.HTTP_200_OK,
            republished.data,
        )
        self.assertEqual(
            republished.data["name_visibility"],
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )
        saved.refresh_from_db()
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )

        self.client.force_authenticate(user=self.member_user)
        member_schedule = self.client.get(self.url)
        member_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )

        schedule = member_schedule.data["schedule"]
        self.assertTrue(len(schedule) > 0)
        self.assertEqual(schedule[0]["candidate"], "Kandidat 1")
        self.assertEqual(member_candidates.data, [])

        self.client.force_authenticate(user=self.admin_user)
        audit = self.client.get(
            reverse(
                "name-visibility-audit",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        self.assertEqual(audit.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [(event["action"], event["group_name"]) for event in audit.data],
            [("hidden", self.committee_group.name)],
        )

    def test_recruiter_reveals_names_only_for_own_committee(self):
        other_group = Group.objects.create(name="Bedkom", lego_id=705)
        self.admission.groups.add(other_group)
        recruiter = LegoUser.objects.create(username="vis-recruiter", lego_id=706)
        other_member = LegoUser.objects.create(username="vis-other-member", lego_id=707)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        Membership.objects.create(user=other_member, role=MEMBER, group=other_group)
        other_candidate = LegoUser.objects.create(
            username="vis-other-candidate", first_name="Grace", lego_id=708
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_candidate
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Bedkom application",
        )
        saved = self._create_saved(
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Grace",
                    "candidate_id": str(other_application.pk),
                    "time": 9,
                    "panel": [],
                },
            ]
        )
        self.client.force_authenticate(user=recruiter)

        reveal = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(reveal.status_code, status.HTTP_200_OK)
        self.assertEqual(reveal.data["name_visibility"], "committee")
        saved.refresh_from_db()
        self.assertEqual(saved.name_visibility, "committee")

        self.client.force_authenticate(user=self.member_user)
        own_schedule = self.client.get(self.url)
        own_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        self.assertEqual(
            [item["candidate"] for item in own_schedule.data["schedule"]], ["Ada"]
        )
        self.assertEqual(
            own_candidates.data,
            [{"id": str(self.application.pk), "name": "Ada"}],
        )
        self.assertNotIn("revealed_groups", own_schedule.data)

        # other_member belongs to Bedkom, not Arrkom - a fully unrelated
        # committee has no access to Arrkom's schedule at all now.
        self.client.force_authenticate(user=other_member)
        self.assertEqual(
            self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.get(
                reverse(
                    "interview-candidates",
                    kwargs={
                        "admission_slug": self.admission.slug,
                        "group_id": self.committee_group.pk,
                    },
                )
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        audit_url = reverse(
            "name-visibility-audit",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee_group.pk,
            },
        )
        # The recruiter is this committee's own interview admin, so they
        # can see its audit trail; an ordinary committee member cannot.
        self.client.force_authenticate(user=recruiter)
        self.assertEqual(
            self.client.get(audit_url).status_code,
            status.HTTP_200_OK,
        )
        self.client.force_authenticate(user=self.member_user)
        self.assertEqual(
            self.client.get(audit_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(user=self.admin_user)
        admin_schedule = self.client.get(self.url)
        self.assertEqual(admin_schedule.data["name_visibility"], "committee")
        audit = self.client.get(audit_url)
        self.assertEqual(audit.status_code, status.HTTP_200_OK)
        self.assertEqual(len(audit.data), 1)
        self.assertEqual(audit.data[0]["action"], "revealed")
        self.assertEqual(audit.data[0]["group_name"], self.committee_group.name)
        self.assertEqual(audit.data[0]["actor_username"], recruiter.username)
        self.assertIsNotNone(audit.data[0]["created_at"])

    def test_recruiter_can_hide_own_committee_after_global_reveal(self):
        other_group = Group.objects.create(name="Bedkom", lego_id=709)
        self.admission.groups.add(other_group)
        recruiter = LegoUser.objects.create(username="vis-hide-recruiter", lego_id=710)
        other_member = LegoUser.objects.create(username="vis-hide-member", lego_id=711)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        Membership.objects.create(user=other_member, role=MEMBER, group=other_group)
        other_candidate = LegoUser.objects.create(
            username="vis-hide-candidate", first_name="Grace", lego_id=712
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_candidate
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Bedkom application",
        )
        saved = self._create_saved(
            name_visibility="committee",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Grace",
                    "candidate_id": str(other_application.pk),
                    "time": 9,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=recruiter)

        hidden = self.client.post(
            self.url,
            {
                "name_visibility": "admin_only",
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(hidden.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden.data["name_visibility"], "admin_only")
        saved.refresh_from_db()
        self.assertEqual(saved.name_visibility, "admin_only")

        self.client.force_authenticate(user=self.member_user)
        own_schedule = self.client.get(self.url)
        own_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        schedule = own_schedule.data["schedule"]
        self.assertTrue(len(schedule) > 0)
        self.assertEqual(schedule[0]["candidate"], "Kandidat 1")
        self.assertEqual(own_candidates.data, [])

        # other_member belongs to Bedkom, not Arrkom - a fully unrelated
        # committee has no access to Arrkom's schedule at all now, whatever
        # revealed_groups says.
        self.client.force_authenticate(user=other_member)
        self.assertEqual(
            self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.get(
                reverse(
                    "interview-candidates",
                    kwargs={
                        "admission_slug": self.admission.slug,
                        "group_id": self.committee_group.pk,
                    },
                )
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(user=self.admin_user)
        audit = self.client.get(
            reverse(
                "name-visibility-audit",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )
        self.assertEqual(audit.status_code, status.HTTP_200_OK)
        self.assertEqual(len(audit.data), 1)
        self.assertEqual(audit.data[0]["action"], "hidden")
        self.assertEqual(audit.data[0]["group_name"], self.committee_group.name)
        self.assertEqual(audit.data[0]["actor_username"], recruiter.username)

    def test_recruiter_name_reveal_cannot_modify_schedule(self):
        recruiter = LegoUser.objects.create(username="vis-recruiter-2", lego_id=709)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        saved = self._create_saved()
        self.client.force_authenticate(user=recruiter)

        res = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "schedule": [],
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        saved.refresh_from_db()
        self.assertEqual(len(saved.schedule), 1)

    def test_recruiter_explicit_null_revision_cannot_update_visibility(self):
        recruiter = LegoUser.objects.create(username="vis-recruiter-cas", lego_id=730)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        saved = self._create_saved()
        self.client.force_authenticate(user=recruiter)

        res = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "expected_updated_at": None,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(set(res.data), {"detail"})
        saved.refresh_from_db()
        self.assertEqual(saved.name_visibility, "hidden")

    def test_recruiter_must_send_schedule_revision(self):
        recruiter = LegoUser.objects.create(
            username="vis-recruiter-missing-cas",
            lego_id=731,
        )
        Membership.objects.create(
            user=recruiter,
            role=RECRUITING,
            group=self.committee_group,
        )
        saved = self._create_saved()
        client = APIClient()
        client.force_authenticate(user=recruiter)

        response = client.post(
            self.url,
            {"name_visibility": "committee"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_updated_at", response.data)
        saved.refresh_from_db()

    def test_recruiter_cannot_reveal_unpublished_schedule(self):
        recruiter = LegoUser.objects.create(username="vis-recruiter-3", lego_id=710)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        saved = self._create_saved(is_distributed=False)
        self.client.force_authenticate(user=recruiter)

        draft = self.client.get(self.url)

        res = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(draft.status_code, status.HTTP_200_OK)
        # The recruiter is this committee's own interview admin now that
        # scheduling is committee-scoped, so they work against the full
        # draft - unlike an ordinary committee member, who is still gated
        # by is_distributed.
        self.assertEqual(draft.data["schedule"][0]["candidate"], "Ada")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_committee_member_does_not_see_other_committee_candidate(self):
        other_group = Group.objects.create(name="Bedkom", lego_id=705)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(
            username="vis-other-candidate", first_name="Grace", lego_id=706
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_user
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Bedkom application",
        )
        self._create_saved(
            name_visibility="committee",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Grace",
                    "candidate_id": str(other_application.pk),
                    "time": 9,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([item["candidate"] for item in res.data["schedule"]], ["Ada"])

    def test_recruiting_another_committee_grants_no_extra_visibility(self):
        recruiting_group = Group.objects.create(name="Bedkom", lego_id=720)
        unrelated_group = Group.objects.create(name="Fagkom", lego_id=721)
        self.admission.groups.add(recruiting_group, unrelated_group)
        mixed_user = LegoUser.objects.create(username="vis-mixed", lego_id=722)
        Membership.objects.create(
            user=mixed_user,
            role=MEMBER,
            group=self.committee_group,
        )
        Membership.objects.create(
            user=mixed_user,
            role=RECRUITING,
            group=recruiting_group,
        )

        applications = []
        for group, username, first_name, lego_id in (
            (recruiting_group, "vis-recruit-candidate", "Grace", 723),
            (unrelated_group, "vis-unrelated-candidate", "Linus", 724),
        ):
            candidate = LegoUser.objects.create(
                username=username,
                first_name=first_name,
                lego_id=lego_id,
            )
            application = UserApplication.objects.create(
                admission=self.admission,
                user=candidate,
            )
            GroupApplication.objects.create(
                application=application,
                group=group,
                text=f"{group.name} application",
            )
            applications.append(application)
        applications[0].phone_number = "+47 411 11 111"
        applications[0].save(update_fields=["phone_number"])

        self._create_saved(
            name_visibility="committee",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [],
                },
                {
                    "candidate": "Grace",
                    "candidate_id": str(applications[0].pk),
                    "time": 9,
                    "panel": [],
                },
                {
                    "candidate": "Linus",
                    "candidate_id": str(applications[1].pk),
                    "time": 10,
                    "panel": [],
                },
            ],
        )
        self.client.force_authenticate(user=mixed_user)

        schedule = self.client.get(self.url)
        candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee_group.pk,
                },
            )
        )

        # mixed_user recruits Bedkom, but that grants no visibility into
        # Arrkom's schedule - each committee's schedule is independent now,
        # so only Arrkom's own (revealed) candidate, Ada, is visible, and
        # mixed_user gets no elevated contact access since they are only an
        # ordinary member of Arrkom itself.
        self.assertEqual(schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["candidate"] for item in schedule.data["schedule"]},
            {"Ada"},
        )
        schedule_by_candidate = {
            item["candidate"]: item for item in schedule.data["schedule"]
        }
        self.assertNotIn("candidate_phone", schedule_by_candidate["Ada"])
        self.assertEqual(
            {item["name"] for item in candidates.data},
            {"Ada"},
        )

    def test_admin_sees_names_even_when_hidden(self):
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_legacy_schedule_derives_enabled_windows_without_writing_on_get(self):
        saved = self._create_saved(
            name_visibility="committee",
            enabled_slots=["2026-04-20|480", "2026-04-20|540"],
            enabled_windows=[],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["enabled_windows"])
        saved.refresh_from_db()
        self.assertEqual(saved.enabled_windows, [])


class InterviewGenderExposureTestCase(APITestCase):
    """Gender feeds the solver but is only ever exposed to privileged users."""

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=800)
        self.committee_group = Group.objects.create(name="Arrkom", lego_id=801)
        self.admin_user = LegoUser.objects.create(
            username="g-admin", lego_id=802, gender="male"
        )
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.committee_group
        )
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.admin_group
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
        application = UserApplication.objects.create(
            admission=self.admission, user=self.applicant, phone_number="12345678"
        )
        GroupApplication.objects.create(
            application=application,
            group=self.committee_group,
            text="Arrkom application",
        )
        self.candidates_url = reverse(
            "interview-candidates",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee_group.pk,
            },
        )
        self.availability_url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee_group.pk,
            },
        )

    def test_admin_does_not_receive_candidate_gender(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("gender", res.data[0])

    def test_committee_member_never_sees_candidate_gender(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.committee_group,
            schedule=[],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertNotEqual(res.data[0]["name"], "")
        self.assertNotIn("gender", res.data[0])

    def test_hidden_candidate_response_does_not_reveal_count(self):
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_availability_includes_inactive_members_in_completion_count(self):
        inactive_member = LegoUser.objects.create(
            username="g-inactive", lego_id=805, gender="male"
        )
        Membership.objects.create(
            user=inactive_member, role=RETIREE, group=self.committee_group
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.admin_user,
            slots=["2026-04-20|480"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.member_user,
            slots=["2026-04-20|480"],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.availability_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # The committee's own people: the recruiter, the active member, and the retiree.
        self.assertEqual(
            {row["username"] for row in res.data},
            {"g-admin", "g-member", "g-inactive"},
        )
        self.assertEqual(sum(1 for row in res.data if row["has_submitted"]), 2)
        self.assertEqual(sum(1 for row in res.data if not row["has_submitted"]), 1)

    def test_unpublished_committee_visibility_does_not_release_names(self):
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.committee_group,
            schedule=[],
            start_date="2026-04-20",
            is_distributed=False,
            name_visibility="committee",
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_availability_payload_carries_panel_gender_for_admin(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee_group,
            user=self.admin_user,
            slots=[],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.availability_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        genders = {row["username"]: row["gender"] for row in res.data}
        self.assertEqual(genders.get("g-member"), "F")


@override_settings(
    ALLOW_SYNTHETIC_SOLVER_INPUT=True,
    ALLOW_UNMARKED_SYNTHETIC_SOLVER_INPUT=True,
)
class SolveJobLifecycleTestCase(APITestCase):
    """The async solve flow: enqueue -> worker -> poll for the result."""

    def setUp(self):
        self.group = Group.objects.create(name="AsyncKom", lego_id=950)
        self.user = LegoUser.objects.create(username="async-admin", lego_id=951)
        Membership.objects.create(user=self.user, role=RECRUITING, group=self.group)
        self.admission = create_admission(created_by=self.user, slug="async-opptak")
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)
        self.solve_url = reverse("solve-schedule")
        self.payload = {
            "admission_slug": self.admission.slug,
            "group_id": str(self.group.pk),
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
        self.assertIsNone(res.data["started_at"])
        self.assertIsNone(res.data["result"])
        self.assertEqual(SolveJob.objects.count(), 1)

    def test_worker_runs_job_and_status_endpoint_returns_result(self):
        job_id = self._enqueue().data["job_id"]

        call_command("run_solver_worker", once=True)

        res = self.client.get(reverse("solve-job", kwargs={"job_id": job_id}))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "DONE")
        self.assertIsNotNone(res.data["started_at"])
        self.assertEqual(res.data["result"]["status"], "SUCCESS")

    def test_worker_rejects_legacy_committee_recruiter_job(self):
        job_id = self._enqueue().data["job_id"]
        saved = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-20",
            is_distributed=False,
        )
        committee = Group.objects.create(name="LegacySolverRecruiters", lego_id=957)
        recruiter = LegoUser.objects.create(
            username="legacy-solver-recruiter", lego_id=958
        )
        Membership.objects.create(user=recruiter, group=committee, role=RECRUITING)
        self.admission.groups.add(committee)
        job = SolveJob.objects.get(pk=job_id)
        job.requested_by = recruiter
        job.request_data = {
            **job.request_data,
            "auto_apply_if_empty": True,
            "baseline_updated_at": saved.updated_at.isoformat(),
        }
        job.save(update_fields=["requested_by", "request_data"])

        call_command("run_solver_worker", once=True)

        job = SolveJob.objects.get(pk=job_id)
        saved.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_ERROR)
        self.assertIsNone(job.result)
        self.assertIsNone(job.applied_at)
        self.assertEqual(saved.schedule, [])
        self.assertFalse(saved.is_distributed)

    def test_status_endpoint_is_forbidden_for_outsiders(self):
        job_id = self._enqueue().data["job_id"]
        outsider = LegoUser.objects.create(username="async-outsider", lego_id=952)
        self.client.force_authenticate(user=outsider)

        res = self.client.get(reverse("solve-job", kwargs={"job_id": job_id}))

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_solve_job_operations_are_forbidden_for_committee_recruiters(self):
        job_id = self._enqueue().data["job_id"]
        committee = Group.objects.create(name="AsyncRecruiters", lego_id=953)
        recruiter = LegoUser.objects.create(username="async-recruiter", lego_id=954)
        Membership.objects.create(user=recruiter, group=committee, role=RECRUITING)
        self.admission.groups.add(committee)
        self.client.force_authenticate(user=recruiter)

        job_url = reverse("solve-job", kwargs={"job_id": job_id})
        status_response = self.client.get(job_url)
        latest_response = self.client.get(
            reverse("latest-solve-job"),
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
            },
        )
        cancel_response = self.client.delete(job_url)
        apply_response = self.client.post(
            reverse("solve-job-apply", kwargs={"job_id": job_id}),
            {"expected_updated_at": timezone.now().isoformat()},
            format="json",
        )

        self.assertEqual(status_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(latest_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(cancel_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(apply_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_latest_endpoint_recovers_an_unfinished_or_unconsumed_job(self):
        job_id = self._enqueue().data["job_id"]

        pending = self.client.get(
            reverse("latest-solve-job"),
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
            },
        )
        call_command("run_solver_worker", once=True)
        completed = self.client.get(
            reverse("latest-solve-job"),
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
            },
        )

        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual(pending.data["job_id"], job_id)
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(completed.data["job_id"], job_id)
        self.assertEqual(completed.data["status"], SolveJob.STATUS_DONE)

    def test_latest_endpoint_does_not_recover_a_repair_preview(self):
        self.payload["options"] = {"repair_mode": True}
        job_id = self._enqueue().data["job_id"]

        pending = self.client.get(
            reverse("latest-solve-job"),
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
            },
        )
        call_command("run_solver_worker", once=True)
        completed = self.client.get(
            reverse("latest-solve-job"),
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
            },
        )

        self.assertEqual(pending.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(completed.status_code, status.HTTP_204_NO_CONTENT)
        job = SolveJob.objects.get(id=job_id)
        self.assertTrue(job.request_data["preview_only"])
        self.assertFalse(job.request_data.get("auto_apply_if_empty", False))

    def test_other_admission_admin_cannot_read_or_cancel_job(self):
        job_id = self._enqueue().data["job_id"]
        other_group = Group.objects.create(name="OtherAsyncKom", lego_id=955)
        other_admin = LegoUser.objects.create(
            username="other-async-admin",
            lego_id=956,
        )
        Membership.objects.create(
            user=other_admin,
            role=RECRUITING,
            group=other_group,
        )
        other_admission = create_admission(
            created_by=other_admin,
            slug="other-async-opptak",
            title="Other async admission",
        )
        other_admission.admin_groups.add(other_group)
        self.client.force_authenticate(user=other_admin)
        job_url = reverse("solve-job", kwargs={"job_id": job_id})

        read = self.client.get(job_url)
        cancel = self.client.delete(job_url)

        self.assertEqual(read.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(cancel.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            SolveJob.objects.get(id=job_id).status,
            SolveJob.STATUS_PENDING,
        )

    def test_cancel_frees_the_admission_for_a_new_solve(self):
        job_id = self._enqueue().data["job_id"]

        cancel = self.client.delete(reverse("solve-job", kwargs={"job_id": job_id}))
        self.assertEqual(cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel.data["status"], "CANCELLED")
        cancelled = SolveJob.objects.get(id=job_id)
        self.assertEqual(cancelled.request_data, {})
        self.assertIsNone(cancelled.result)

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
            group=self.group,
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

    def test_worker_reaps_stale_pending_job(self):
        stale = SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_PENDING,
        )
        SolveJob.objects.filter(id=stale.id).update(
            created_at=timezone.now()
            - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS + 60)
        )

        call_command("run_solver_worker", once=True)

        stale.refresh_from_db()
        self.assertEqual(stale.status, SolveJob.STATUS_ERROR)

    def test_cleanup_deletes_old_finished_jobs(self):
        old = SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_DONE,
        )
        SolveJob.objects.filter(id=old.id).update(
            finished_at=timezone.now()
            - timedelta(days=constants.SOLVE_PROPOSAL_RETENTION_DAYS + 1)
        )

        Command()._cleanup_old_jobs()

        self.assertFalse(SolveJob.objects.filter(id=old.id).exists())

    def test_worker_cleans_old_results_even_when_processing_a_job(self):
        old = SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={"candidate": "private"},
            result={"candidate": "private"},
            status=SolveJob.STATUS_DONE,
        )
        SolveJob.objects.filter(id=old.id).update(
            finished_at=timezone.now()
            - timedelta(days=constants.SOLVE_PROPOSAL_RETENTION_DAYS + 1)
        )
        self._enqueue()

        call_command("run_solver_worker", once=True)

        self.assertFalse(SolveJob.objects.filter(id=old.id).exists())


class SolveProposalApplyTestCase(APITestCase):
    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.group = Group.objects.create(name="Proposal admins", lego_id=9590)
        self.user = LegoUser.objects.create(username="proposal-admin", lego_id=9591)
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role=RECRUITING,
        )
        self.admission = create_admission(
            created_by=self.user,
            slug="proposal-apply",
        )
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)
        candidate = LegoUser.objects.create(
            username="proposal-candidate",
            lego_id=9592,
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=candidate,
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.group,
            text="Proposal application",
        )
        self.saved = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-20",
            end_date="2026-04-20",
            session_duration=60,
            enabled_slots=["2026-04-20|540"],
            resolved_blocks=[{"slots": ["2026-04-20|540"]}],
            panel_size=1,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.user,
            slots=["2026-04-20|540"],
            submitted_grid_generation=self.saved.availability_generation,
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
        )
        self.client.force_authenticate(user=self.user)

    def _job(self):
        return SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            status=SolveJob.STATUS_DONE,
            finished_at=timezone.now(),
            request_data={
                "baseline_updated_at": self.saved.updated_at.isoformat(),
                "panel_size": 1,
                "options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "stop",
                    "same_panel_per_block": False,
                    "allow_overtime": False,
                },
            },
            result={
                "status": "SUCCESS",
                "schedule": [
                    {
                        "candidate_id": str(self.application.pk),
                        "candidate": "spoofed",
                        "time": 540,
                        "panel": [
                            {
                                "id": str(self.user.pk),
                                "name": "spoofed",
                                "is_overtime": False,
                            }
                        ],
                    }
                ],
                "unplaceable": [],
            },
        )

    def _apply(self, job, expected=None):
        return self.client.post(
            reverse("solve-job-apply", kwargs={"job_id": job.id}),
            {"expected_updated_at": expected or self.saved.updated_at.isoformat()},
            format="json",
        )

    def test_apply_promotes_exact_job_idempotently(self):
        job = self._job()

        first = self._apply(job)
        second = self._apply(job, first.data["updated_at"])

        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        self.assertEqual(len(first.data["schedule"]), 1)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        job.refresh_from_db()
        self.assertIsNotNone(job.applied_at)

    def test_apply_rejects_stale_or_published_draft(self):
        stale_job = self._job()
        SavedSchedule.objects.filter(pk=self.saved.pk).update(updated_at=timezone.now())
        stale = self._apply(stale_job)
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)

        self.saved.refresh_from_db()
        published_job = self._job()
        SavedSchedule.objects.filter(pk=self.saved.pk).update(
            distributed_through=timezone.now().date()
        )
        published = self._apply(published_job)
        self.assertEqual(published.status_code, status.HTTP_409_CONFLICT)

    def test_apply_rejects_a_proposal_invalidated_by_a_new_conflict(self):
        job = self._job()
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            user=self.user,
        )
        availability.conflicts = [str(self.application.pk)]
        availability.save(update_fields=["conflicts"])

        response = self._apply(job)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("schedule", response.data)
        job.refresh_from_db()
        self.assertIsNone(job.applied_at)
        self.assertIsNotNone(job.discarded_at)
        self.saved.refresh_from_db()
        self.assertEqual(self.saved.schedule, [])

    def test_discarded_proposal_cannot_be_applied(self):
        job = self._job()
        discard = self.client.delete(reverse("solve-job", kwargs={"job_id": job.id}))

        applied = self._apply(job)

        self.assertEqual(discard.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(discard.data["discarded_at"])
        self.assertEqual(applied.status_code, status.HTTP_409_CONFLICT)

    def test_repair_preview_cannot_be_applied(self):
        job = self._job()
        job.request_data["preview_only"] = True
        job.request_data["options"]["repair_mode"] = True
        job.save(update_fields=["request_data"])

        applied = self._apply(job)

        self.assertEqual(applied.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("Forhåndsvisninger", applied.data["detail"])
        job.refresh_from_db()
        self.assertIsNone(job.applied_at)
        self.saved.refresh_from_db()
        self.assertEqual(self.saved.schedule, [])

    def test_applied_proposal_cannot_also_be_discarded(self):
        job = self._job()
        applied = self._apply(job)

        discarded = self.client.delete(reverse("solve-job", kwargs={"job_id": job.id}))

        self.assertEqual(applied.status_code, status.HTTP_200_OK, applied.data)
        self.assertEqual(discarded.status_code, status.HTTP_409_CONFLICT)
        job.refresh_from_db()
        self.assertIsNotNone(job.applied_at)
        self.assertIsNone(job.discarded_at)

    def test_expired_proposal_cannot_be_applied(self):
        job = self._job()
        SolveJob.objects.filter(pk=job.pk).update(
            finished_at=timezone.now()
            - timedelta(days=constants.SOLVE_PROPOSAL_RETENTION_DAYS + 1)
        )

        response = self._apply(job)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("utløpt", response.data["detail"])

    def test_database_rejects_a_job_marked_applied_and_discarded(self):
        job = self._job()

        with self.assertRaises(IntegrityError), transaction.atomic():
            SolveJob.objects.filter(pk=job.pk).update(
                applied_at=timezone.now(),
                discarded_at=timezone.now(),
            )

    def test_generic_schedule_save_preserves_proposal_history(self):
        job = self._job()
        response = self.client.post(
            reverse(
                "saved-schedule",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.group.pk,
                },
            ),
            {"panel_size": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(SolveJob.objects.filter(pk=job.pk).exists())


@override_settings(ALLOW_SYNTHETIC_SOLVER_INPUT=False)
class DayScopedSolverPayloadTestCase(APITestCase):
    """The partial-plan workflow: solve the first days now, extend later.

    Scoping happens inside the saved framework (enabled_slots untouched), so
    solving day by day never invalidates availability answers.
    """

    def setUp(self):
        self.admin_group = Group.objects.create(name="ScopeAdmin", lego_id=970)
        self.admin = LegoUser.objects.create(username="scope-admin", lego_id=971)
        Membership.objects.create(
            user=self.admin, group=self.admin_group, role=RECRUITING
        )
        self.admission = create_admission(created_by=self.admin, slug="scope-opptak")
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.admin_group)
        self.candidate = LegoUser.objects.create(
            username="scope-candidate", lego_id=972
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.admin_group,
            text="Scope application",
        )
        self.saved = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.admin_group,
            schedule=[],
            start_date="2026-04-20",
            end_date="2026-04-22",
            session_duration=60,
            enabled_slots=[
                "2026-04-20|540",
                "2026-04-21|540",
                "2026-04-22|540",
            ],
            day_start_minute=480,
            day_end_minute=1080,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin,
            slots=["2026-04-20|540", "2026-04-21|540", "2026-04-22|540"],
            submitted_grid_generation=self.saved.availability_generation,
        )
        self.client.force_authenticate(user=self.admin)
        self.url = reverse("solve-schedule")

    def _data(self, **overrides):
        data = {
            "candidates": [{"id": str(self.application.pk)}],
            "interviewers": [{"id": str(self.admin.pk)}],
            "panel_size": 1,
            "options": {},
        }
        data.update(overrides)
        return data

    def test_scope_limits_slots_blocks_and_availability(self):
        saved = SavedSchedule.objects.get(admission=self.admission)
        payload = canonicalize_solver_payload(
            self.admission,
            saved,
            self._data(day_scope_through="2026-04-21"),
            self.admin,
        )

        self.assertEqual(payload["all_slots"], [540, 1440 + 540])
        # The out-of-scope day's block has no usable slots and drops out.
        self.assertEqual(payload["blocks"], [[540], [1440 + 540]])
        self.assertEqual(
            payload["interviewers"][0]["availability"],
            [540, 1440 + 540],
        )

    def test_scope_beyond_the_period_covers_everything(self):
        saved = SavedSchedule.objects.get(admission=self.admission)
        payload = canonicalize_solver_payload(
            self.admission,
            saved,
            self._data(day_scope_through="2030-01-01"),
            self.admin,
        )

        self.assertEqual(payload["all_slots"], [540, 1440 + 540, 2880 + 540])

    def test_scope_before_the_first_day_is_rejected(self):
        with self.assertRaises(ScheduleValidationError) as ctx:
            canonicalize_solver_payload(
                self.admission,
                SavedSchedule.objects.get(admission=self.admission),
                self._data(day_scope_through="2026-04-19"),
                self.admin,
            )
        self.assertEqual(ctx.exception.field, "day_scope_through")

    def test_solve_request_carries_the_scope_to_the_worker(self):
        response = self.client.post(
            self.url,
            {
                **self._data(),
                "admission_slug": self.admission.slug,
                "group_id": str(self.admin_group.pk),
                "day_scope_through": "2026-04-21",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        request_data = SolveJob.objects.get(id=response.data["job_id"]).request_data
        self.assertEqual(request_data["day_scope_through"], "2026-04-21")


@override_settings(ALLOW_SYNTHETIC_SOLVER_INPUT=False)
class CanonicalSolverInputTestCase(APITestCase):
    def setUp(self):
        self.admin_group = Group.objects.create(name="CanonicalAdmin", lego_id=960)
        self.admin = LegoUser.objects.create(
            username="canonical-admin", lego_id=961, gender="female"
        )
        Membership.objects.create(
            user=self.admin, group=self.admin_group, role=RECRUITING
        )
        self.admission = create_admission(
            created_by=self.admin, slug="canonical-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.admin_group)
        self.candidate = LegoUser.objects.create(
            username="canonical-candidate", lego_id=962, gender="male"
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.admin_group,
            text="Canonical application",
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.admin_group,
            schedule=[],
            start_date="2026-04-20",
            end_date="2026-04-20",
            session_duration=60,
            enabled_slots=["2026-04-20|540"],
            day_start_minute=480,
            day_end_minute=1080,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin,
            slots=["2026-04-20|540"],
        )
        self.client.force_authenticate(user=self.admin)
        self.url = reverse("solve-schedule")

    def _payload(self, candidate_id=None):
        return {
            "admission_slug": self.admission.slug,
            "group_id": str(self.admin_group.pk),
            "candidates": [
                {
                    "id": candidate_id or str(self.application.pk),
                    "name": "Spoofed candidate",
                    "gender": "F",
                }
            ],
            "interviewers": [
                {
                    "id": str(self.admin.pk),
                    "name": "Spoofed interviewer",
                    "gender": "M",
                    "availability": [999],
                    "biased": [],
                }
            ],
            "panel_size": 1,
            "all_slots": [999],
            "blocks": [[999]],
        }

    def test_server_rehydrates_solver_facts(self):
        res = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        request_data = SolveJob.objects.get(id=res.data["job_id"]).request_data
        self.assertTrue(request_data["rehydrate"])
        self.assertEqual(request_data["candidates"], [{"id": str(self.application.pk)}])
        self.assertEqual(request_data["interviewers"], [{"id": str(self.admin.pk)}])
        self.assertNotIn(self.candidate.username, str(request_data))
        self.assertNotIn(self.admin.username, str(request_data))

    def test_experience_policy_requires_a_classified_participant_before_enqueue(self):
        payload = self._payload()
        payload["options"] = {
            "policy_version": 2,
            "panel_stability": "flexible",
            "availability_fallback": "stop",
            "require_experienced_panel": True,
        }

        blocked = self.client.post(self.url, payload, format="json")

        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("options", blocked.data)

        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin,
        ).update(experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED)
        accepted = self.client.post(self.url, payload, format="json")

        self.assertEqual(accepted.status_code, status.HTTP_202_ACCEPTED)

    def test_solve_waits_for_unresolved_roster_and_excludes_opted_out_member(self):
        optional = LegoUser.objects.create(
            username="canonical-optional",
            lego_id=965,
        )
        Membership.objects.create(
            user=optional,
            group=self.admin_group,
            role=MEMBER,
        )
        unresolved_payload = self._payload()
        unresolved_payload["interviewers"].append(
            {
                "id": str(optional.pk),
                "name": "Spoofed optional",
                "gender": "",
                "availability": [999],
                "biased": [],
            }
        )

        blocked = self.client.post(self.url, unresolved_payload, format="json")

        self.assertEqual(blocked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("interviewers", blocked.data)

        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=optional,
            slots=[],
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
        )
        accepted = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(accepted.status_code, status.HTTP_202_ACCEPTED, accepted.data)
        request_data = SolveJob.objects.get(id=accepted.data["job_id"]).request_data
        self.assertEqual(
            request_data["interviewers"],
            [{"id": str(self.admin.pk)}],
        )

    def test_repair_preview_rejects_a_stale_baseline(self):
        payload = {
            **self._payload(),
            "baseline_updated_at": (timezone.now() - timedelta(minutes=5)).isoformat(),
            "options": {"repair_mode": True},
        }

        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("baseline_updated_at", response.data)
        self.assertFalse(SolveJob.objects.filter(admission=self.admission).exists())

    def test_first_solve_does_not_wait_for_conflict_review(self):
        SavedSchedule.objects.filter(admission=self.admission).update(
            conflict_review_open=True
        )

        res = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(SolveJob.objects.filter(admission=self.admission).exists())

    def test_solve_keeps_assignment_review_open_until_draft_is_saved(self):
        SavedSchedule.objects.filter(admission=self.admission).update(
            conflict_review_open=True
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin,
        ).update(reviewed_candidate_ids=[str(self.application.pk)])

        res = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(
            SavedSchedule.objects.get(admission=self.admission).conflict_review_open
        )
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                actor=self.admin,
                action=ConflictReviewAuditEvent.ACTION_FROZEN,
            ).exists()
        )

    def test_candidate_scope_validation_still_applies_during_review(self):
        saved = SavedSchedule.objects.get(admission=self.admission)
        ConflictReviewAuditEvent.objects.create(
            admission=self.admission,
            saved_schedule=saved,
            actor=self.admin,
            actor_username=self.admin.username,
            action=ConflictReviewAuditEvent.ACTION_FROZEN,
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin,
        ).update(reviewed_candidate_ids=[str(self.application.pk)])
        other_user = LegoUser.objects.create(
            username="late-canonical-candidate",
            lego_id=964,
        )
        other_application = UserApplication.objects.create(
            admission=self.admission, user=other_user
        )
        GroupApplication.objects.create(
            application=other_application,
            group=self.admin_group,
            text="Late canonical application",
        )

        res = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("candidates", res.data)

    def test_rehydrated_blocks_exclude_closed_slots(self):
        saved_schedule = SavedSchedule.objects.get(admission=self.admission)
        payload = canonicalize_solver_payload(
            self.admission,
            saved_schedule,
            {
                "candidates": [{"id": str(self.application.pk)}],
                "interviewers": [{"id": str(self.admin.pk)}],
                "panel_size": 1,
                "options": {},
            },
            self.admin,
        )

        self.assertEqual(payload["all_slots"], [540])
        self.assertEqual(payload["blocks"], [[540]])
        self.assertEqual(
            payload["candidates"][0]["user_id"],
            str(self.candidate.pk),
        )
        self.assertEqual(
            payload["interviewers"][0]["experience_level"],
            InterviewAvailability.EXPERIENCE_UNKNOWN,
        )

    def test_repair_mode_excludes_candidates_outside_the_review_scope(self):
        """A repair must never place a candidate onto a panel that never
        reviewed them - otherwise the repaired plan has an unchecked pairing."""
        second_user = LegoUser.objects.create(
            username="canonical-candidate-2", lego_id=965, gender="male"
        )
        second_application = UserApplication.objects.create(
            admission=self.admission, user=second_user, phone_number="87654321"
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Canonical application 2",
        )
        second_interviewer = LegoUser.objects.create(
            username="canonical-interviewer-2", lego_id=967, gender="male"
        )
        Membership.objects.create(
            user=second_interviewer, group=self.admin_group, role=MEMBER
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=second_interviewer,
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            slots=["2026-04-20|540"],
        )
        saved_schedule = SavedSchedule.objects.get(admission=self.admission)
        revision = uuid.uuid4()
        ConflictReviewList.objects.create(
            saved_schedule=saved_schedule,
            revision=revision,
            interviewer_id=self.admin.pk,
            own_candidate_ids=[str(self.application.pk)],
            swap_candidate_ids=[],
            decoys=[],
        )
        ConflictReviewList.objects.create(
            saved_schedule=saved_schedule,
            revision=revision,
            interviewer_id=second_interviewer.pk,
            own_candidate_ids=[str(second_application.pk)],
            swap_candidate_ids=[],
            decoys=[],
        )

        payload = canonicalize_solver_payload(
            self.admission,
            saved_schedule,
            {
                "candidates": [
                    {"id": str(self.application.pk)},
                    {"id": str(second_application.pk)},
                ],
                "interviewers": [
                    {"id": str(self.admin.pk)},
                    {"id": str(second_interviewer.pk)},
                ],
                "panel_size": 1,
                "options": {"repair_mode": True},
                "locked_assignments": [
                    {
                        "candidate_id": str(self.application.pk),
                        "time": 540,
                        "panel": [{"id": str(self.admin.pk), "name": "x"}],
                    }
                ],
            },
            self.admin,
        )

        biased = set(payload["interviewers"][0]["biased"])
        self.assertIn(str(second_application.pk), biased)
        self.assertNotIn(str(self.application.pk), biased)

    def test_progressive_plan_with_locked_assignments_does_not_exclude_unplaced_candidates(
        self,
    ):
        """Extending a delplan passes locked_assignments to preserve earlier
        days, but is not a repair - unplaced candidates must not be marked
        as biased against every interviewer."""
        second_user = LegoUser.objects.create(
            username="canonical-candidate-3", lego_id=966, gender="male"
        )
        second_application = UserApplication.objects.create(
            admission=self.admission, user=second_user, phone_number="87654321"
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Canonical application 3",
        )
        saved_schedule = SavedSchedule.objects.get(admission=self.admission)
        ConflictReviewList.objects.create(
            saved_schedule=saved_schedule,
            revision=uuid.uuid4(),
            interviewer_id=self.admin.pk,
            own_candidate_ids=[str(self.application.pk)],
            swap_candidate_ids=[],
            decoys=[],
        )

        payload = canonicalize_solver_payload(
            self.admission,
            saved_schedule,
            {
                "candidates": [
                    {"id": str(self.application.pk)},
                    {"id": str(second_application.pk)},
                ],
                "interviewers": [{"id": str(self.admin.pk)}],
                "panel_size": 1,
                "options": {"repair_mode": False},
                "locked_assignments": [
                    {
                        "candidate_id": str(self.application.pk),
                        "time": 540,
                        "panel": [{"id": str(self.admin.pk), "name": "x"}],
                    }
                ],
            },
            self.admin,
        )

        self.assertEqual(payload["interviewers"][0]["biased"], [])

    def test_a_completed_day_only_contributes_its_locked_slot_times(self):
        """A day marked finished keeps its locked interviews but withholds its
        open slots, so a later solve cannot backfill it after a removal."""
        SavedSchedule.objects.filter(admission=self.admission).update(
            start_date="2026-04-20",
            end_date="2026-04-21",
            enabled_slots=[
                "2026-04-20|540",
                "2026-04-20|600",
                "2026-04-21|540",
                "2026-04-21|600",
            ],
            resolved_blocks=[],
            completed_days=["2026-04-20"],
        )
        saved_schedule = SavedSchedule.objects.get(admission=self.admission)

        payload = canonicalize_solver_payload(
            self.admission,
            saved_schedule,
            {
                "candidates": [{"id": str(self.application.pk)}],
                "interviewers": [{"id": str(self.admin.pk)}],
                "panel_size": 1,
                "options": {},
                "locked_assignments": [
                    {
                        "candidate_id": str(self.application.pk),
                        "time": 540,
                        "panel": [{"id": str(self.admin.pk), "name": "x"}],
                    }
                ],
            },
            self.admin,
        )

        # 540 survives (a locked interview sits there); 600 on the completed
        # day is gone; both of the next day's slots stay.
        self.assertEqual(payload["all_slots"], [540, 1980, 2040])

    def test_review_scope_is_not_enforced_without_locked_assignments(self):
        """A fresh solve has nothing reviewed yet, so the review-scope
        exclusion (which only makes sense for a repair) must not apply."""
        second_user = LegoUser.objects.create(
            username="canonical-candidate-4", lego_id=968, gender="male"
        )
        second_application = UserApplication.objects.create(
            admission=self.admission, user=second_user, phone_number="87654321"
        )
        GroupApplication.objects.create(
            application=second_application,
            group=self.admin_group,
            text="Canonical application 4",
        )
        saved_schedule = SavedSchedule.objects.get(admission=self.admission)
        ConflictReviewList.objects.create(
            saved_schedule=saved_schedule,
            revision=uuid.uuid4(),
            interviewer_id=self.admin.pk,
            own_candidate_ids=[str(self.application.pk)],
            swap_candidate_ids=[],
            decoys=[],
        )

        payload = canonicalize_solver_payload(
            self.admission,
            saved_schedule,
            {
                "candidates": [
                    {"id": str(self.application.pk)},
                    {"id": str(second_application.pk)},
                ],
                "interviewers": [{"id": str(self.admin.pk)}],
                "panel_size": 1,
                "options": {},
            },
            self.admin,
        )

        self.assertEqual(payload["interviewers"][0]["biased"], [])

    def test_cross_admission_candidate_is_rejected(self):
        other = create_admission(
            created_by=self.admin,
            slug="other-canonical-opptak",
            title="Other canonical admission",
        )
        other_user = LegoUser.objects.create(username="other-candidate", lego_id=963)
        other_application = UserApplication.objects.create(
            admission=other, user=other_user, phone_number="12345678"
        )

        res = self.client.post(
            self.url, self._payload(str(other_application.pk)), format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("candidates", res.data)

    def test_worker_rehydrates_and_auto_applies_first_solve(self):
        res = self.client.post(self.url, self._payload(), format="json")
        job = SolveJob.objects.get(id=res.data["job_id"])

        Command()._claim_and_run()

        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_DONE)
        self.assertEqual(
            job.result["schedule"][0]["candidate"], self.candidate.username
        )
        self.assertEqual(
            job.result["schedule"][0]["panel"][0]["name"], self.admin.username
        )
        self.assertNotIn("_solver_metrics", job.result)
        self.assertEqual(job.solver_metrics["solver_engine_version"], "v2")
        self.assertEqual(job.solver_metrics["placed_count"], 1)
        self.assertNotIn("solver_metrics", SolveJobSerializer(job).data)
        self.assertIsNotNone(job.applied_at)
        self.assertEqual(
            len(SavedSchedule.objects.get(admission=self.admission).schedule),
            1,
        )


class GroupRemovalDisclosureTestCase(APITestCase):
    """Removing a committee from the admission must revoke its disclosure."""

    def setUp(self):
        self.staff_user = LegoUser.objects.create(
            username="disclosure-staff", lego_id=940, is_staff=True
        )
        self.admission = create_admission(
            created_by=self.staff_user, slug="disclosure-opptak"
        )
        self.admin_group = Group.objects.create(name="Disclosure admins", lego_id=941)
        self.committee = Group.objects.create(name="Disclosure committee", lego_id=942)
        self.other_committee = Group.objects.create(
            name="Disclosure other committee", lego_id=943
        )
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.committee, self.other_committee)
        self.saved = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.committee,
            schedule=[
                {
                    "candidate_id": str(uuid.uuid4()),
                    "candidate": "Kandidat",
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )
        self.url = reverse(
            "manage-admission-detail", kwargs={"slug": self.admission.slug}
        )
        self.client.force_authenticate(user=self.staff_user)

    def _edit(self, groups):
        return self.client.patch(
            self.url,
            {
                "title": self.admission.title,
                "open_from": self.admission.open_from,
                "public_deadline": self.admission.public_deadline,
                "closed_from": self.admission.closed_from,
                "admin_groups": [str(self.admin_group.pk)],
                "groups": [str(group.pk) for group in groups],
            },
            format="json",
        )

    def test_removing_a_group_revokes_its_published_disclosure(self):
        res = self._edit([self.other_committee])

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.saved.refresh_from_db()
        self.assertFalse(self.saved.is_distributed)
        self.assertEqual(self.saved.name_visibility, "hidden")
        audit_event = NameVisibilityAuditEvent.objects.get(group=self.committee)
        self.assertEqual(audit_event.action, NameVisibilityAuditEvent.ACTION_HIDDEN)
        self.assertEqual(audit_event.actor, self.staff_user)

    def test_removing_and_readding_group_does_not_restore_disclosure(self):
        self._edit([self.other_committee])

        res = self._edit([self.committee, self.other_committee])

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.saved.refresh_from_db()
        self.assertFalse(self.saved.is_distributed)
        self.assertEqual(self.saved.name_visibility, "hidden")

    def test_keeping_the_group_leaves_disclosure_untouched(self):
        res = self._edit([self.committee, self.other_committee])

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.saved.refresh_from_db()
        self.assertTrue(self.saved.is_distributed)
        self.assertEqual(self.saved.name_visibility, "committee")
        self.assertFalse(NameVisibilityAuditEvent.objects.exists())


class RollingPrefixPublishTestCase(APITestCase):
    """Progressive publishing with a pool that grows (rolling admissions).

    The framework enables Monday 2026-04-20 and Wednesday 2026-04-22; the
    draft schedules only the Monday candidate. Publishing the Monday prefix
    must work while the Wednesday candidate still waits, the conflict review
    must survive that prefix publish (new candidates will still need
    checking), and only publishing through the last enabled day demands that
    every active candidate is scheduled.
    """

    client_class = ScheduleRevisionAPIClient

    def setUp(self):
        self.admin_group = Group.objects.create(name="Webkom", lego_id=610)
        self.admin_user = LegoUser.objects.create(username="rolling-admin", lego_id=611)
        Membership.objects.create(
            user=self.admin_user, role=RECRUITING, group=self.admin_group
        )
        self.admission = create_admission(
            created_by=self.admin_user, slug="rolling-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)
        self.admission.groups.add(self.admin_group)
        self.monday_user = LegoUser.objects.create(
            username="rolling-monday", lego_id=612
        )
        self.wednesday_user = LegoUser.objects.create(
            username="rolling-wednesday", lego_id=613
        )
        self.monday_application = UserApplication.objects.create(
            admission=self.admission,
            user=self.monday_user,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.monday_application,
            group=self.admin_group,
            text="Monday application",
        )
        self.wednesday_application = UserApplication.objects.create(
            admission=self.admission,
            user=self.wednesday_user,
            phone_number="87654321",
        )
        GroupApplication.objects.create(
            application=self.wednesday_application,
            group=self.admin_group,
            text="Wednesday application",
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
            slots=["2026-04-20|540", "2026-04-20|600", "2026-04-22|540"],
        )
        self.url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.admin_group.pk,
            },
        )
        self.client.force_authenticate(user=self.admin_user)
        self._create_draft()

    def _schedule_item(self, application, time=540):
        return {
            "candidate": "Client-supplied name",
            "candidate_id": str(application.pk),
            "time": time,
            "panel": [
                {
                    "id": str(self.admin_user.pk),
                    "name": "Client-supplied interviewer",
                }
            ],
        }

    def _create_draft(self, **overrides):
        defaults = {
            "admission": self.admission,
            "group": self.admin_group,
            "schedule": [self._schedule_item(self.monday_application)],
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "enabled_slots": [
                "2026-04-20|540",
                "2026-04-20|600",
                "2026-04-22|540",
            ],
            "panel_size": 1,
            "conflict_review_open": True,
        }
        defaults.update(overrides)
        return SavedSchedule.objects.create(**defaults)

    def _mark_reviewed(self, *applications):
        InterviewAvailability.objects.filter(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
        ).update(
            reviewed_candidate_ids=[str(application.pk) for application in applications]
        )

    def test_prefix_publish_with_waiting_candidate_succeeds(self):
        self._mark_reviewed(self.monday_application)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-21"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_distributed"])
        self.assertEqual(res.data["distributed_through"], "2026-04-21")
        # Wednesday is still enabled but unscheduled - the review must stay
        # open so the next publish can demand a check of the new candidates.
        self.assertTrue(res.data["conflict_review_open"])

    def test_unscoped_publish_stops_at_the_last_scheduled_day(self):
        self._mark_reviewed(self.monday_application)

        res = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_distributed"])
        self.assertEqual(res.data["distributed_through"], "2026-04-21")
        self.assertTrue(res.data["conflict_review_open"])

    def test_publishing_the_last_enabled_day_requires_every_candidate(self):
        self._mark_reviewed(self.monday_application)

        res = self.client.post(
            self.url,
            {"distributed_through": "2026-04-23"},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, res.data)
        self.assertIn("Alle aktive kandidater", str(res.data))
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_deferred_acknowledgment_publishes_with_waiting_candidates(self):
        self._mark_reviewed(self.monday_application)

        res = self.client.post(
            self.url,
            {
                "distributed_through": "2026-04-23",
                "defer_unplaced_candidates": True,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertTrue(res.data["is_distributed"])
        # Acknowledging deferral publishes what exists; the waiting
        # candidate is simply absent, and the review is closed because no
        # enabled days remain beyond the boundary.
        self.assertFalse(res.data["conflict_review_open"])

    def test_review_closes_when_the_final_day_is_published(self):
        self._mark_reviewed(self.monday_application, self.wednesday_application)
        prefix = self.client.post(
            self.url,
            {"distributed_through": "2026-04-21"},
            format="json",
        )
        self.assertEqual(prefix.status_code, status.HTTP_200_OK, prefix.data)

        grown = self.client.post(
            self.url,
            {
                "schedule": [
                    self._schedule_item(self.monday_application, time=540),
                    self._schedule_item(
                        self.wednesday_application, time=2 * 24 * 60 + 540
                    ),
                ],
                "is_distributed": True,
            },
            format="json",
        )
        self.assertEqual(grown.status_code, status.HTTP_200_OK, grown.data)
        self.assertTrue(grown.data["conflict_review_open"])

        final = self.client.post(
            self.url,
            {"distributed_through": "2026-04-23"},
            format="json",
        )

        self.assertEqual(final.status_code, status.HTTP_200_OK, final.data)
        self.assertFalse(final.data["conflict_review_open"])
        self.assertTrue(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_CLOSED,
            ).exists()
        )

    def test_attestations_survive_a_schedule_change(self):
        self._mark_reviewed(self.monday_application, self.wednesday_application)

        res = self.client.post(
            self.url,
            {"schedule": [self._schedule_item(self.monday_application, time=600)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            group=self.admin_group,
            user=self.admin_user,
        )
        # An attestation is a fact about the (interviewer, candidate) pair;
        # moving interviews around must never demand a re-check of people
        # that were already checked.
        self.assertEqual(
            availability.reviewed_candidate_ids,
            [
                str(self.monday_application.pk),
                str(self.wednesday_application.pk),
            ],
        )


class CandidateWithdrawalPrivacyTestCase(TestCase):
    def test_withdrawal_purges_denormalized_candidate_data(self):
        admin = LegoUser.objects.create(username="purge-admin", lego_id=980)
        candidate = LegoUser.objects.create(username="purge-candidate", lego_id=981)
        admission = create_admission(created_by=admin, slug="purge-opptak")
        committee = Group.objects.create(name="Purge committee", lego_id=986)
        admission.groups.add(committee)
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        candidate_id = str(application.pk)
        GroupApplication.objects.create(
            application=application, group=committee, text="Purge application"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
            group=committee,
            schedule=[
                {
                    "candidate_id": candidate_id,
                    "candidate": candidate.username,
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )
        availability = InterviewAvailability.objects.create(
            admission=admission, group=committee, user=admin, conflicts=[candidate_id]
        )
        SolveJob.objects.create(
            admission=admission,
            group=committee,
            requested_by=admin,
            request_data={
                "candidates": [{"id": candidate_id, "name": candidate.username}]
            },
            result={"schedule": [{"candidate_id": candidate_id}]},
            status=SolveJob.STATUS_DONE,
        )
        previous_revision = saved.updated_at

        application.delete()

        saved.refresh_from_db()
        availability.refresh_from_db()
        self.assertEqual(saved.schedule, [])
        self.assertFalse(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "hidden")
        self.assertGreater(saved.updated_at, previous_revision)
        self.assertEqual(availability.conflicts, [])
        self.assertFalse(SolveJob.objects.filter(admission=admission).exists())
        audit_event = NameVisibilityAuditEvent.objects.get(
            admission=admission,
            group=committee,
        )
        self.assertEqual(audit_event.action, NameVisibilityAuditEvent.ACTION_HIDDEN)
        self.assertIsNone(audit_event.actor)
        self.assertEqual(audit_event.actor_username, "system")

    def _withdrawal_fixture(self, slug, lego_base):
        admin = LegoUser.objects.create(username=f"{slug}-admin", lego_id=lego_base)
        withdrawing = LegoUser.objects.create(
            username=f"{slug}-withdrawing", lego_id=lego_base + 1
        )
        scheduled = LegoUser.objects.create(
            username=f"{slug}-scheduled", lego_id=lego_base + 2
        )
        admission = create_admission(created_by=admin, slug=slug)
        committee = Group.objects.create(
            name=f"{slug} committee", lego_id=lego_base + 3
        )
        admission.groups.add(committee)
        withdrawing_application = UserApplication.objects.create(
            admission=admission, user=withdrawing
        )
        GroupApplication.objects.create(
            application=withdrawing_application, group=committee, text="Withdraws"
        )
        scheduled_application = UserApplication.objects.create(
            admission=admission, user=scheduled
        )
        GroupApplication.objects.create(
            application=scheduled_application, group=committee, text="Stays"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
            group=committee,
            schedule=[
                {
                    "candidate_id": str(scheduled_application.pk),
                    "candidate": scheduled.username,
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )
        return withdrawing_application, saved

    def test_full_withdrawal_leaves_untouched_published_plans_alone(self):
        """Withdrawing an application the plan never scheduled must not unpublish it."""
        withdrawing_application, saved = self._withdrawal_fixture(
            "untouched-purge", 960
        )

        withdrawing_application.delete()

        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "committee")
        self.assertEqual(len(saved.schedule), 1)
        self.assertFalse(NameVisibilityAuditEvent.objects.exists())

    def test_partial_withdrawal_of_unscheduled_candidate_keeps_the_plan_published(
        self,
    ):
        withdrawing_application, saved = self._withdrawal_fixture(
            "partial-unscheduled", 966
        )

        withdrawing_application.group_applications.first().delete()

        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "committee")

    def test_partial_withdrawal_cancels_the_slot_and_keeps_plan_published(self):
        withdrawing_application, saved = self._withdrawal_fixture(
            "partial-scheduled", 972
        )
        staying_candidate_id = saved.schedule[0]["candidate_id"]
        saved.schedule = saved.schedule + [
            {
                "candidate_id": str(withdrawing_application.pk),
                "candidate": "withdrawing",
                "time": 600,
                "panel": [],
            }
        ]
        saved.save(update_fields=["schedule"])

        withdrawing_application.group_applications.first().delete()

        saved.refresh_from_db()
        # The dropped committee's interview row is cancelled in place; the
        # published prefix and every other invitation survive it.
        self.assertTrue(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "committee")
        self.assertEqual(
            [item["candidate_id"] for item in saved.schedule],
            [staying_candidate_id],
        )
        self.assertFalse(NameVisibilityAuditEvent.objects.exists())

    def test_full_withdrawal_of_scheduled_candidate_keeps_plan_published(self):
        withdrawing_application, saved = self._withdrawal_fixture("full-scheduled", 973)
        staying_candidate_id = saved.schedule[0]["candidate_id"]
        saved.schedule = saved.schedule + [
            {
                "candidate_id": str(withdrawing_application.pk),
                "candidate": "withdrawing",
                "time": 600,
                "panel": [],
            }
        ]
        saved.save(update_fields=["schedule"])

        withdrawing_application.delete()

        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "committee")
        self.assertEqual(
            [item["candidate_id"] for item in saved.schedule],
            [staying_candidate_id],
        )
        self.assertFalse(NameVisibilityAuditEvent.objects.exists())

    def test_full_withdrawal_prunes_review_list_snapshots(self):
        """Readiness must not keep demanding review of a withdrawn candidate."""
        withdrawing_application, saved = self._withdrawal_fixture("review-prune", 978)
        reviewer = LegoUser.objects.create(
            username="review-prune-reviewer", lego_id=989
        )
        other_id = str(uuid.uuid4())
        review_list = ConflictReviewList.objects.create(
            saved_schedule=saved,
            revision=uuid.uuid4(),
            interviewer=reviewer,
            own_candidate_ids=[str(withdrawing_application.pk), other_id],
            swap_candidate_ids=[str(withdrawing_application.pk)],
        )

        withdrawing_application.delete()

        review_list.refresh_from_db()
        self.assertEqual(review_list.own_candidate_ids, [other_id])
        self.assertEqual(review_list.swap_candidate_ids, [])

    def test_full_withdrawal_prunes_persisted_attestations(self):
        """Attestations are append-only, so a withdrawn candidate's id would
        otherwise sit in reviewed_candidate_ids forever - echoed back by the
        availability GET and tripping the next save of the same row.
        """
        admin = LegoUser.objects.create(username="attest-purge-admin", lego_id=990)
        candidate = LegoUser.objects.create(
            username="attest-purge-candidate", lego_id=991
        )
        admission = create_admission(created_by=admin, slug="attest-purge-opptak")
        committee = Group.objects.create(name="Attest purge", lego_id=992)
        admission.groups.add(committee)
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        GroupApplication.objects.create(
            application=application, group=committee, text="Purge attest"
        )
        availability = InterviewAvailability.objects.create(
            admission=admission,
            group=committee,
            user=admin,
            conflicts=[str(application.pk)],
            reviewed_candidate_ids=[
                str(application.pk),
                "11111111-1111-1111-1111-111111111111",
            ],
        )

        application.delete()

        availability.refresh_from_db()
        # The withdrawn candidate's attestation is gone; unrelated ids stay.
        self.assertEqual(availability.conflicts, [])
        self.assertEqual(
            availability.reviewed_candidate_ids,
            ["11111111-1111-1111-1111-111111111111"],
        )

    def test_withdrawal_clears_legacy_name_only_schedule(self):
        admin = LegoUser.objects.create(username="legacy-admin", lego_id=982)
        candidate = LegoUser.objects.create(username="legacy-candidate", lego_id=983)
        admission = create_admission(created_by=admin, slug="legacy-purge-opptak")
        committee = Group.objects.create(name="Legacy purge committee", lego_id=987)
        admission.groups.add(committee)
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
            group=committee,
            schedule=[
                {
                    "candidate": candidate.username,
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )

        application.delete()

        saved.refresh_from_db()
        self.assertEqual(saved.schedule, [])
        self.assertFalse(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "hidden")

    def test_withdrawal_clears_unmapped_legacy_candidate_id(self):
        admin = LegoUser.objects.create(username="legacy-id-admin", lego_id=984)
        candidate = LegoUser.objects.create(username="renamed-candidate", lego_id=985)
        admission = create_admission(created_by=admin, slug="legacy-id-purge")
        committee = Group.objects.create(name="Legacy id purge committee", lego_id=988)
        admission.groups.add(committee)
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
            group=committee,
            schedule=[
                {
                    "candidate_id": "real-candidate-old-username",
                    "candidate": "Old Candidate Name",
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility="committee",
        )

        application.delete()

        saved.refresh_from_db()
        self.assertEqual(saved.schedule, [])
        self.assertFalse(saved.is_distributed)
        self.assertEqual(saved.name_visibility, "hidden")


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


class SavedScheduleRejectionLoggingTestCase(APITestCase):
    """A rejected save must leave a server-side trace naming the field.

    Without one, a production 400 is only ever visible as a toast the operator
    has already dismissed - the frontend Sentry event carries the status but
    deliberately never the body.
    """

    def setUp(self):
        group = Group.objects.create(name="Webkom", lego_id=700)
        user = LegoUser.objects.create(username="rejection-admin", lego_id=701)
        Membership.objects.create(user=user, role=RECRUITING, group=group)
        self.admission = create_admission(created_by=user, slug="rejection-opptak")
        self.admission.admin_groups.add(group)
        self.admission.groups.add(group)
        self.url = reverse(
            "saved-schedule",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": group.pk,
            },
        )
        self.client.force_authenticate(user=user)

    def _post_and_capture_log(self, payload):
        with mock.patch("admissions.utils.middleware.log.new") as new_log:
            request_log = new_log.return_value
            response = self.client.post(self.url, payload, format="json")
        return response, request_log

    def _rejection_calls(self, request_log):
        return [
            call
            for call in request_log.warning.call_args_list
            if call.args and call.args[0] == "saved_schedule_rejected"
        ]

    def test_serializer_rejection_logs_the_offending_field(self):
        response, request_log = self._post_and_capture_log(
            {"session_duration": 9999, "expected_updated_at": None}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        (call,) = self._rejection_calls(request_log)
        self.assertEqual(call.kwargs["stage"], "serializer")
        self.assertEqual(call.kwargs["fields"], ["session_duration"])
        self.assertEqual(call.kwargs["admission_slug"], self.admission.slug)

    def test_workflow_rejection_is_logged_with_its_own_stage(self):
        with mock.patch(
            "admissions.admissions.schedule_views.update_saved_schedule",
            side_effect=ScheduleInputError({"enabled_slots": ["Ugyldig tidsluke: x"]}),
        ):
            response, request_log = self._post_and_capture_log(
                {"expected_updated_at": None}
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        (call,) = self._rejection_calls(request_log)
        self.assertEqual(call.kwargs["stage"], "workflow")
        self.assertEqual(call.kwargs["fields"], ["enabled_slots"])

    def test_rejection_log_carries_no_error_message_text(self):
        """Messages interpolate slot keys and panel members - keys only."""
        with mock.patch(
            "admissions.admissions.schedule_views.update_saved_schedule",
            side_effect=ScheduleInputError(
                {"schedule": ["Ola Nordmann kan ikke intervjue seg selv"]}
            ),
        ):
            _, request_log = self._post_and_capture_log({"expected_updated_at": None})

        (call,) = self._rejection_calls(request_log)
        self.assertNotIn("Ola Nordmann", str(call))
        self.assertNotIn("intervjue seg selv", str(call))

    def test_accepted_save_logs_no_rejection(self):
        response, request_log = self._post_and_capture_log(
            {
                "start_date": "2026-04-20",
                "session_duration": 60,
                "expected_updated_at": None,
            }
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._rejection_calls(request_log), [])
