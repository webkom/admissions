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
from admissions.admissions.schedule_invalidation import (
    publication_is_invalidated_by_availability,
)
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_solver_payload,
    ensure_conflict_collection_ready,
)
from admissions.admissions.scheduling_utils import get_interviewer_participation
from admissions.admissions.serializers import SolveJobSerializer, SolveOptionsSerializer
from admissions.admissions.solve_jobs import planning_input_fingerprint
from admissions.admissions.tests.utils import (
    ScheduleRevisionAPIClient,
    create_admission,
)
from admissions.admissions.views import panel_gender_code
from admissions.oauth import update_custom_user_details
from admissions.utils.management.commands.run_solver_worker import Command


@override_settings(ADMISSIONS_SCHEDULER_ENABLED=False)
class SchedulerFeatureGateTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission(slug="disabled-scheduler")

    def test_all_scheduler_endpoints_fail_closed(self):
        job_id = uuid.uuid4()
        urls = [
            reverse("solve-schedule"),
            reverse("latest-solve-job"),
            reverse("solve-job", kwargs={"job_id": job_id}),
            reverse("solve-job-apply", kwargs={"job_id": job_id}),
            reverse(
                "saved-schedule",
                kwargs={"admission_slug": self.admission.slug},
            ),
            reverse(
                "interview-availability",
                kwargs={"admission_slug": self.admission.slug},
            ),
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            ),
            reverse(
                "name-visibility-audit",
                kwargs={"admission_slug": self.admission.slug},
            ),
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_503_SERVICE_UNAVAILABLE,
                )
                self.assertEqual(
                    str(response.data["detail"]),
                    "Intervjuplanleggeren er ikke tilgjengelig ennå. "
                    "Prøv igjen senere.",
                )


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
        self.candidate_user = LegoUser.objects.create(
            username="hardening-candidate", lego_id=602
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate_user,
            phone_number="12345678",
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin_user,
            slots=["2026-04-20|540", "2026-04-20|600"],
        )
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
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

    def _create_saved(self, *, with_completed_collection=True, **overrides):
        defaults = {
            "admission": self.admission,
            "schedule": self._schedule(),
            "start_date": "2026-04-20",
            "end_date": "2026-04-24",
            "session_duration": 60,
            "enabled_slots": ["2026-04-20|540", "2026-04-20|600"],
            "panel_size": 1,
            "is_distributed": True,
        }
        defaults.update(overrides)
        saved = SavedSchedule.objects.create(**defaults)
        has_explicit_collection_state = any(
            key.startswith("conflict_collection_") for key in overrides
        )
        if (
            with_completed_collection
            and saved.schedule
            and not has_explicit_collection_state
        ):
            revision = uuid.uuid4()
            candidate_ids = {
                str(candidate_id)
                for candidate_id in UserApplication.objects.filter(
                    admission=self.admission
                ).values_list("pk", flat=True)
            }
            participant_ids = {
                str(user_id)
                for user_id, participation in get_interviewer_participation(
                    self.admission,
                    saved,
                ).items()
                if participation == InterviewAvailability.PARTICIPATION_PARTICIPATING
            }
            saved.conflict_collection_open = False
            saved.conflict_collection_revision = revision
            saved.conflict_collection_candidate_ids = sorted(candidate_ids)
            saved.conflict_collection_participant_ids = sorted(participant_ids)
            saved.save(
                update_fields=[
                    "conflict_collection_open",
                    "conflict_collection_revision",
                    "conflict_collection_candidate_ids",
                    "conflict_collection_participant_ids",
                ]
            )
            applications_by_user = {
                str(user_id): str(application_id)
                for application_id, user_id in UserApplication.objects.filter(
                    admission=self.admission
                ).values_list("pk", "user_id")
            }
            for participant_id in participant_ids:
                reviewed_ids = set(candidate_ids)
                own_application_id = applications_by_user.get(participant_id)
                if own_application_id is not None:
                    reviewed_ids.discard(own_application_id)
                InterviewAvailability.objects.filter(
                    admission=self.admission,
                    user_id=participant_id,
                ).update(
                    conflict_collection_review_revision=revision,
                    conflict_collection_reviewed_candidate_ids=sorted(reviewed_ids),
                )
        return saved

    def _mark_reviewed(self, *applications):
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            reviewed_candidate_ids=[str(application.pk) for application in applications]
        )

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

    def test_framework_change_resets_draft_before_conflict_collection(self):
        saved = self._create_saved(
            is_distributed=False,
            with_completed_collection=False,
        )

        response = self.client.post(
            self.url,
            {
                "session_duration": 30,
                "schedule": self._schedule(time=600),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["session_duration"], 30)
        self.assertEqual(response.data["schedule"], [])
        self.assertFalse(response.data["is_distributed"])
        saved.refresh_from_db()
        self.assertEqual(saved.schedule, [])

    def test_framework_reset_clears_completed_collection_lifecycle(self):
        saved = self._create_saved(is_distributed=False)
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            user=self.admin_user,
        )
        self.assertIsNotNone(saved.conflict_collection_revision)
        self.assertIsNotNone(availability.conflict_collection_review_revision)

        response = self.client.post(
            self.url,
            {
                "schedule": self._schedule(),
                "session_duration": 30,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["schedule"], [])
        self.assertFalse(response.data["conflict_collection_open"])
        self.assertIsNone(response.data["conflict_collection_revision"])
        self.assertEqual(response.data["conflict_collection_candidate_ids"], [])
        self.assertEqual(response.data["conflict_collection_participant_ids"], [])
        availability.refresh_from_db()
        self.assertIsNone(availability.conflict_collection_review_revision)
        self.assertEqual(
            availability.conflict_collection_reviewed_candidate_ids,
            [],
        )

    def test_no_op_schedule_save_preserves_availability_revision(self):
        saved = self._create_saved()
        availability = InterviewAvailability.objects.get(
            admission=self.admission,
            user=self.admin_user,
        )
        availability_revision = availability.updated_at

        response = self.client.post(
            self.url,
            {"expected_updated_at": saved.updated_at.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        availability.refresh_from_db()
        self.assertEqual(availability.updated_at, availability_revision)

    def test_admin_cannot_open_conflict_collection_without_a_draft(self):
        saved = self._create_saved(is_distributed=False, schedule=[])

        res = self.client.post(
            self.url,
            {"conflict_collection_open": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            res.data["conflict_collection_open"],
            ["Lag et planutkast før kandidatnavn åpnes."],
        )
        saved.refresh_from_db()
        self.assertFalse(saved.conflict_collection_open)
        self.assertIsNone(saved.conflict_collection_revision)
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_OPENED,
                phase=ConflictReviewAuditEvent.PHASE_COLLECTION,
            ).exists()
        )

    def test_admin_can_open_conflict_collection_from_an_existing_draft(self):
        self._create_saved(is_distributed=False)

        res = self.client.post(
            self.url,
            {"conflict_collection_open": True},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["conflict_review_open"])
        self.assertTrue(res.data["conflict_collection_open"])
        self.assertEqual(
            res.data["conflict_collection_participant_ids"],
            [str(self.admin_user.pk)],
        )
        self.assertTrue(res.data["conflict_collection_revision"])
        self.assertTrue(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_OPENED,
                phase=ConflictReviewAuditEvent.PHASE_COLLECTION,
            ).exists()
        )

    def test_participating_admin_can_submit_their_own_conflicts(self):
        revision = uuid.uuid4()
        self._create_saved(
            is_distributed=False,
            schedule=[],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )

        response = self.client.post(
            reverse(
                "interview-availability",
                kwargs={"admission_slug": self.admission.slug},
            ),
            {
                "conflicts": [str(self.application.pk)],
                "conflict_collection_reviewed_candidate_ids": [
                    str(self.application.pk)
                ],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["conflict_collection_complete"])
        self.assertEqual(response.data["conflicts"], [str(self.application.pk)])
        event = ConflictReviewAuditEvent.objects.get(
            admission=self.admission,
            phase=ConflictReviewAuditEvent.PHASE_COLLECTION,
            action=ConflictReviewAuditEvent.ACTION_SUBMITTED,
        )
        self.assertEqual(event.actor_id, self.admin_user.pk)
        self.assertEqual(event.subject_user_id, self.admin_user.pk)

    def test_current_collection_cannot_close_before_every_participant_confirms(self):
        revision = uuid.uuid4()
        saved = self._create_saved(
            is_distributed=False,
            schedule=[],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )

        response = self.client.post(
            self.url,
            {
                "conflict_collection_open": False,
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflict_collection_open", response.data)
        saved.refresh_from_db()
        self.assertTrue(saved.conflict_collection_open)

    def test_stale_collection_can_close_so_it_can_be_reopened(self):
        revision = uuid.uuid4()
        saved = self._create_saved(
            is_distributed=False,
            schedule=[],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        late_candidate = LegoUser.objects.create(
            username="late-close-candidate",
            lego_id=604,
        )
        UserApplication.objects.create(
            admission=self.admission,
            user=late_candidate,
        )

        response = self.client.post(
            self.url,
            {
                "conflict_collection_open": False,
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["conflict_collection_open"])

    def test_solver_rejects_a_stale_completed_conflict_collection(self):
        revision = uuid.uuid4()
        saved = self._create_saved(
            is_distributed=False,
            schedule=[],
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            conflict_collection_review_revision=revision,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
        )
        ensure_conflict_collection_ready(self.admission, saved)

        late_candidate = LegoUser.objects.create(
            username="late-conflict-candidate",
            lego_id=603,
        )
        UserApplication.objects.create(
            admission=self.admission,
            user=late_candidate,
        )

        with self.assertRaises(ScheduleValidationError) as error:
            ensure_conflict_collection_ready(self.admission, saved)

        self.assertEqual(error.exception.field, "conflict_collection_open")
        self.assertIn("Kandidatlisten er endret", error.exception.message)

    def test_solver_rejects_an_incomplete_closed_conflict_collection(self):
        revision = uuid.uuid4()
        saved = self._create_saved(
            is_distributed=False,
            schedule=[],
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )

        with self.assertRaises(ScheduleValidationError) as error:
            ensure_conflict_collection_ready(self.admission, saved)

        self.assertEqual(error.exception.field, "conflict_collection_open")
        self.assertIn("må fullføre", error.exception.message)

    def test_publish_is_blocked_until_open_conflict_review_is_complete(self):
        self._create_saved(
            is_distributed=False,
            conflict_review_open=True,
            with_completed_collection=False,
        )

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
        revision = uuid.uuid4()
        SavedSchedule.objects.filter(admission=self.admission).update(
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            conflict_collection_review_revision=revision,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
        )

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

    def test_saving_first_timed_draft_keeps_candidate_names_hidden(self):
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
        self.assertFalse(res.data["conflict_review_open"])
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                action=ConflictReviewAuditEvent.ACTION_OPENED,
                phase=ConflictReviewAuditEvent.PHASE_DRAFT,
            ).exists()
        )

    def test_completed_collection_satisfies_publish_without_second_review(self):
        revision = uuid.uuid4()
        self._create_saved(
            is_distributed=False,
            conflict_review_open=False,
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            conflict_collection_review_revision=revision,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
            reviewed_candidate_ids=[],
        )

        response = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_distributed"])
        self.assertFalse(response.data["conflict_review_open"])

    def test_stale_collection_blocks_publish(self):
        revision = uuid.uuid4()
        self._create_saved(
            is_distributed=False,
            conflict_review_open=False,
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            conflict_collection_review_revision=revision,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
        )
        late_candidate = LegoUser.objects.create(
            username="late-publish-candidate",
            lego_id=605,
        )
        UserApplication.objects.create(
            admission=self.admission,
            user=late_candidate,
        )

        response = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("schedule", response.data)
        self.assertFalse(
            SavedSchedule.objects.get(admission=self.admission).is_distributed
        )

    def test_open_collection_blocks_manual_draft_changes(self):
        revision = uuid.uuid4()
        self._create_saved(
            is_distributed=False,
            conflict_review_open=False,
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )

        response = self.client.post(
            self.url,
            {"schedule": self._schedule(time=600)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["conflict_collection_open"],
            ["Fullfør inhabilitetskontrollen før du lager et nytt forslag."],
        )

    def test_draft_without_collection_blocks_manual_changes(self):
        self._create_saved(
            is_distributed=False,
            with_completed_collection=False,
        )

        response = self.client.post(
            self.url,
            {"schedule": self._schedule(time=600)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["conflict_collection_open"],
            ["Åpne og fullfør inhabilitetskontrollen i Planutkast først."],
        )

    def test_draft_without_collection_cannot_be_published(self):
        self._create_saved(
            is_distributed=False,
            with_completed_collection=False,
        )

        response = self.client.post(
            self.url,
            {"is_distributed": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["schedule"],
            ["Åpne og fullfør inhabilitetskontrollen i Planutkast først."],
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
        second_interviewer = LegoUser.objects.create(
            username="second-interviewer", lego_id=604
        )
        self.admission.groups.add(self.admin_group)
        Membership.objects.create(
            user=second_interviewer, role=MEMBER, group=self.admin_group
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
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
        self.assertIn("Alle aktive kandidater", str(res.data))

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
            admission=self.admission, requested_by=self.user, request_data={}
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            SolveJob.objects.create(
                admission=self.admission,
                requested_by=self.user,
                request_data={},
                status=SolveJob.STATUS_RUNNING,
            )

    def test_finished_job_does_not_block_a_new_enqueue(self):
        SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_DONE,
        )

        res = self._solve({})

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(SolveJob.objects.filter(admission=self.admission).count(), 2)

    def test_enqueue_losing_the_race_rejects_a_different_winning_job(self):
        winner = SolveJob.objects.create(
            admission=self.admission, requested_by=self.user, request_data={}
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

    def _schedule_assignment(self, *panel_users):
        return {
            "candidate_id": str(self.application.pk),
            "candidate": self.applicant.username,
            "time": 540,
            "panel": [
                {"id": str(user.pk), "name": user.username} for user in panel_users
            ],
        }

    def _open_conflict_review(self):
        return self._create_saved_schedule(
            conflict_review_open=True,
            conflict_collection_revision=uuid.uuid4(),
            enabled_slots=["2026-04-21|540"],
            schedule=[self._schedule_assignment(self.member)],
        )

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
                user=self.member,
            ).exists()
        )

        self.client.force_authenticate(user=self.admin_user)
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

    def test_recruiter_cannot_see_peer_conflict_relationships(self):
        self._create_saved_schedule(name_visibility="committee")
        candidate_id = str(self.application.pk)
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=[candidate_id],
            reviewed_candidate_ids=[candidate_id],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.recruiter,
            slots=["2026-04-21|540"],
            conflicts=[candidate_id],
            reviewed_candidate_ids=[candidate_id],
        )
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_user = {str(item["user_id"]): item for item in response.data}
        self.assertEqual(by_user[str(self.member.pk)]["conflicts"], [])
        self.assertEqual(
            by_user[str(self.member.pk)]["reviewed_candidate_ids"],
            [],
        )
        self.assertEqual(
            by_user[str(self.recruiter.pk)]["conflicts"],
            [candidate_id],
        )
        self.assertEqual(
            by_user[str(self.recruiter.pk)]["reviewed_candidate_ids"],
            [candidate_id],
        )

    def test_non_admin_reads_unknown_experience_but_admin_reads_classification(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )
        self.client.force_authenticate(user=self.member)

        member_response = self.client.get(self.url)

        self.assertEqual(member_response.status_code, status.HTTP_200_OK)
        self.assertEqual(member_response.data[0]["experience_level"], "unknown")

        self.client.force_authenticate(user=self.admin_user)
        admin_response = self.client.get(self.url)

        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        by_user = {str(item["user_id"]): item for item in admin_response.data}
        self.assertEqual(
            by_user[str(self.member.pk)]["experience_level"],
            "experienced",
        )

    def test_unassigned_experience_change_advances_revision_and_preserves_approval(
        self,
    ):
        saved_schedule = self._create_saved_schedule()
        approval = ScheduleDeviationApproval.objects.create(
            admission=self.admission,
            saved_schedule=saved_schedule,
            actor=self.admin_user,
            actor_username=self.admin_user.username,
            schedule_fingerprint="a" * 64,
            deviation_fingerprint="b" * 64,
            policy_snapshot={},
            availability_generation=saved_schedule.availability_generation,
            layout_version=saved_schedule.layout_version,
        )
        previous_revision = saved_schedule.updated_at
        self.client.force_authenticate(user=self.admin_user)

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
        self.assertTrue(
            ScheduleDeviationApproval.objects.filter(pk=approval.pk).exists()
        )

    def test_only_experienced_assignee_downgrade_unpublishes(self):
        saved = self._create_saved_schedule(
            is_distributed=True,
            solver_options={"require_experienced_panel": True},
            schedule=[self._schedule_assignment(self.member)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "experience_level": InterviewAvailability.EXPERIENCE_INEXPERIENCED,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertFalse(saved.is_distributed)

    def test_experience_downgrade_preserves_panel_with_another_experienced_member(
        self,
    ):
        saved = self._create_saved_schedule(
            is_distributed=True,
            solver_options={"require_experienced_panel": True},
            schedule=[self._schedule_assignment(self.member, self.recruiter)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.recruiter,
            experience_level=InterviewAvailability.EXPERIENCE_EXPERIENCED,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "experience_level": InterviewAvailability.EXPERIENCE_INEXPERIENCED,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)

    def test_experience_upgrade_preserves_publication(self):
        saved = self._create_saved_schedule(
            is_distributed=True,
            solver_options={"require_experienced_panel": True},
            schedule=[self._schedule_assignment(self.member)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            experience_level=InterviewAvailability.EXPERIENCE_INEXPERIENCED,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "experience_level": InterviewAvailability.EXPERIENCE_EXPERIENCED,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)

    def test_conflict_change_advances_the_schedule_revision(self):
        revision = uuid.uuid4()
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin_user,
            slots=["2026-04-21|540"],
        )
        saved_schedule = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "time": 540,
                    "panel": [{"id": str(self.admin_user.pk)}],
                }
            ],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.admin_user.pk)],
        )
        previous_revision = saved_schedule.updated_at
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        saved_schedule.refresh_from_db()
        self.assertGreater(saved_schedule.updated_at, previous_revision)

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

    def test_unknown_reviewed_candidate_id_is_rejected(self):
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"reviewed_candidate_ids": ["00000000-0000-0000-0000-000000000000"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reviewed_candidate_ids", res.data)

    def test_member_can_review_only_proposed_candidates_without_seeing_draft_times(
        self,
    ):
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
            user=self.member,
            slots=["2026-04-21|540"],
        )
        self.client.force_authenticate(user=self.member)

        candidates_res = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        schedule_res = self.client.get(
            reverse(
                "saved-schedule",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        review_res = self.client.post(
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

        self.assertEqual(candidates_res.status_code, status.HTTP_200_OK)
        candidates_by_id = {item["id"]: item for item in candidates_res.data}
        self.assertEqual(
            set(candidates_by_id),
            {str(self.application.pk)},
        )
        self.assertEqual(schedule_res.status_code, status.HTTP_200_OK)
        self.assertTrue(schedule_res.data["conflict_review_open"])
        self.assertEqual(schedule_res.data["schedule"], [])
        self.assertEqual(review_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", review_res.data)
        viewed_event = ConflictReviewAuditEvent.objects.get(
            admission=self.admission,
            actor=self.member,
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
        )
        self.assertEqual(viewed_event.saved_schedule_id, schedule_res.data["id"])
        self.assertFalse(
            ConflictReviewAuditEvent.objects.filter(
                admission=self.admission,
                actor=self.member,
                action=ConflictReviewAuditEvent.ACTION_SUBMITTED,
            ).exists()
        )

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
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=[str(other_application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.url,
            {
                "conflicts": [],
                "reviewed_candidate_ids": [str(self.application.pk)],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        availability.refresh_from_db()
        self.assertEqual(availability.conflicts, [str(other_application.pk)])

    def test_stale_collection_submission_is_rejected_without_changing_conflicts(self):
        revision = uuid.uuid4()
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.member.pk)],
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=[],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        late_user = LegoUser.objects.create(
            username="late-collection-candidate",
            lego_id=640,
        )
        UserApplication.objects.create(
            user=late_user,
            admission=self.admission,
        )
        self.client.force_authenticate(user=self.member)

        candidates_response = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        availability_response = self.client.get(self.url)
        response = self.client.post(
            self.url,
            {
                "conflicts": [str(self.application.pk)],
                "conflict_collection_reviewed_candidate_ids": [
                    str(self.application.pk)
                ],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(candidates_response.status_code, status.HTTP_200_OK)
        self.assertEqual(candidates_response.data, [])
        me = next(item for item in availability_response.data if item["is_me"])
        self.assertEqual(me["conflict_collection_candidate_ids"], [])
        self.assertEqual(me["conflicts"], [])
        self.assertEqual(me["reviewed_candidate_ids"], [])
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        availability.refresh_from_db()
        self.assertEqual(availability.conflicts, [])
        self.assertIsNone(availability.conflict_collection_review_revision)

    def test_participant_with_zero_available_slots_can_complete_collection(self):
        revision = uuid.uuid4()
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.member.pk)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=[],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        self.client.force_authenticate(user=self.member)

        candidates_response = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        response = self.client.post(
            self.url,
            {
                "conflicts": [],
                "conflict_collection_reviewed_candidate_ids": [
                    str(self.application.pk)
                ],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(candidates_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [candidate["id"] for candidate in candidates_response.data],
            [str(self.application.pk)],
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["conflict_collection_complete"])

    def test_self_only_participant_can_confirm_an_empty_collection_scope(self):
        self.application.delete()
        own_application = UserApplication.objects.create(
            user=self.member,
            admission=self.admission,
        )
        revision = uuid.uuid4()
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(own_application.pk)],
            conflict_collection_participant_ids=[str(self.member.pk)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        self.client.force_authenticate(user=self.member)

        before = self.client.get(self.url)
        me = next(item for item in before.data if item["is_me"])
        response = self.client.post(
            self.url,
            {
                "conflicts": [],
                "conflict_collection_reviewed_candidate_ids": [],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(me["conflict_collection_candidate_ids"], [])
        self.assertEqual(
            str(me["conflict_collection_revision"]),
            str(revision),
        )
        self.assertFalse(me["conflict_collection_complete"])
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["conflict_collection_complete"])

    def test_member_can_review_snapshot_candidates_during_open_collection(self):
        other_group = Group.objects.create(name="Andre innsamling", lego_id=636)
        self.admission.groups.add(other_group)
        other_user = LegoUser.objects.create(
            username="other-collection-candidate", lego_id=637
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
        revision = uuid.uuid4()
        self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[
                str(self.application.pk),
                str(other_application.pk),
            ],
            conflict_collection_participant_ids=[str(self.member.pk)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=1,
        )
        self.client.force_authenticate(user=self.member)

        candidates_response = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        availability_response = self.client.get(self.url)
        schedule_response = self.client.get(
            reverse(
                "saved-schedule",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        review_response = self.client.post(
            self.url,
            {
                "conflicts": [str(other_application.pk)],
                "conflict_collection_reviewed_candidate_ids": [
                    str(self.application.pk),
                    str(other_application.pk),
                ],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(candidates_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["id"] for item in candidates_response.data},
            {str(self.application.pk), str(other_application.pk)},
        )
        me = next(item for item in availability_response.data if item["is_me"])
        self.assertEqual(
            set(me["conflict_collection_candidate_ids"]),
            {str(self.application.pk), str(other_application.pk)},
        )
        self.assertFalse(me["conflict_collection_complete"])
        self.assertEqual(schedule_response.status_code, status.HTTP_200_OK)
        self.assertIsNone(schedule_response.data["conflict_collection_revision"])
        self.assertEqual(
            schedule_response.data["conflict_collection_candidate_ids"], []
        )
        self.assertEqual(
            schedule_response.data["conflict_collection_participant_ids"], []
        )
        self.assertEqual(review_response.status_code, status.HTTP_200_OK)
        self.assertTrue(review_response.data["conflict_collection_complete"])
        self.assertEqual(
            review_response.data["conflicts"],
            [str(other_application.pk)],
        )

    def test_closed_collection_revokes_member_candidate_scope(self):
        revision = uuid.uuid4()
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            conflict_collection_open=False,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.member.pk)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        self.client.force_authenticate(user=self.member)

        candidates_response = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        schedule_response = self.client.get(
            reverse(
                "saved-schedule",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        review_response = self.client.post(
            self.url,
            {
                "conflict_collection_reviewed_candidate_ids": [
                    str(self.application.pk)
                ],
                "conflict_collection_revision": str(revision),
            },
            format="json",
        )

        self.assertEqual(candidates_response.status_code, status.HTTP_200_OK)
        self.assertEqual(candidates_response.data, [])
        self.assertEqual(schedule_response.status_code, status.HTTP_200_OK)
        self.assertIsNone(schedule_response.data["conflict_collection_revision"])
        self.assertEqual(
            schedule_response.data["conflict_collection_candidate_ids"], []
        )
        self.assertEqual(
            schedule_response.data["conflict_collection_participant_ids"], []
        )
        self.assertEqual(review_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(
            "conflict_collection_reviewed_candidate_ids",
            review_response.data,
        )

    def test_nonparticipant_schedule_hides_conflict_collection_scope(self):
        revision = uuid.uuid4()
        self._create_saved_schedule(
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.recruiter.pk)],
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.get(
            reverse(
                "saved-schedule",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["conflict_collection_revision"])
        self.assertEqual(response.data["conflict_collection_candidate_ids"], [])
        self.assertEqual(response.data["conflict_collection_participant_ids"], [])

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
            user=self.member,
            slots=[],
            reviewed_candidate_ids=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        candidates_res = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
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
        self.assertEqual(candidates_res.data, [])
        self.assertEqual(availability_res.status_code, status.HTTP_200_OK)
        me = next(item for item in availability_res.data if item["is_me"])
        self.assertEqual(me["proposed_candidate_ids"], [])
        self.assertEqual(me["affected_assignment_count"], 0)
        self.assertFalse(me["conflict_review_complete"])
        self.assertEqual(review_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unassigned_new_candidate_does_not_invalidate_proposal_review(self):
        self._open_conflict_review()
        InterviewAvailability.objects.create(
            admission=self.admission,
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

    def test_legacy_real_candidate_conflict_id_is_rejected(self):
        self._create_saved_schedule(name_visibility="committee")
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {"conflicts": [f"real-candidate-{self.applicant.username}"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)

    def test_admin_cannot_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.admin_user,
            ).exists()
        )

    def test_recruiter_cannot_save_conflicts_before_names_released(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {"conflicts": [str(self.application.pk)]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=self.recruiter,
            ).exists()
        )

    def test_recruiter_cannot_save_conflict_for_an_unrepresented_candidate(self):
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

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("conflicts", res.data)

    def test_recruiter_sees_only_represented_group_availability(self):
        other_group = Group.objects.create(name="Annen komite", lego_id=628)
        self.admission.groups.add(other_group)
        other_member = LegoUser.objects.create(username="other-member", lego_id=629)
        Membership.objects.create(user=other_member, role=MEMBER, group=other_group)
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=other_member,
            slots=["2026-04-21|540"],
            conflicts=[],
        )
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {row["username"] for row in res.data},
            {"hardening-member", "hardening-recruiter"},
        )

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

    def test_member_cannot_edit_conflicts_from_published_schedule(self):
        self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
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
        saved_schedule = self._create_saved_schedule(
            enabled_slots=["2026-04-22|600"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY,
        )
        saved_schedule.revealed_groups.add(other_group)
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.recruiter,
            conflicts=[str(self.application.pk), str(other_application.pk)],
        )
        saved_schedule.revealed_groups.remove(other_group)
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
        post_response = self.client.post(
            self.url,
            {"slots": ["2026-04-22|600"]},
            format="json",
        )

        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data[0]["gender"], "")
        self.assertEqual(post_response.status_code, status.HTTP_200_OK)
        self.assertEqual(post_response.data["gender"], "")

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

    def test_empty_conflict_update_is_rejected_while_names_are_hidden(self):
        self._create_saved_schedule(name_visibility="hidden")
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.post(self.url, {"conflicts": []}, format="json")

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        saved = InterviewAvailability.objects.get(
            admission=self.admission, user=self.member
        )
        self.assertEqual(saved.conflicts, [str(self.application.pk)])

    def test_hidden_conflicts_are_redacted_from_member(self):
        self._create_saved_schedule(name_visibility="committee", is_distributed=False)
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            conflicts=[str(self.application.pk)],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data[0]["conflicts"], [])

    def test_saving_slots_marks_self_as_participating(self):
        self._create_saved_schedule(enabled_slots=["2026-04-21|540"])
        self.client.force_authenticate(user=self.member)

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

    def test_admin_opt_out_unpublishes_an_assigned_interviewer_and_keeps_draft(
        self,
    ):
        collection_revision = uuid.uuid4()
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            conflict_review_open=True,
            conflict_collection_open=True,
            conflict_collection_revision=collection_revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.member.pk)],
            schedule=[self._schedule_assignment(self.member)],
        )
        saved.revealed_groups.add(self.committee_group)
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
            conflict_collection_review_revision=collection_revision,
        )
        approval = ScheduleDeviationApproval.objects.create(
            admission=self.admission,
            saved_schedule=saved,
            actor=self.admin_user,
            actor_username=self.admin_user.username,
            schedule_fingerprint="a" * 64,
            deviation_fingerprint="b" * 64,
            policy_snapshot={},
            availability_generation=saved.availability_generation,
            layout_version=saved.layout_version,
        )
        pending_job = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin_user,
            request_data={"candidate": "private"},
        )
        completed_job = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin_user,
            status=SolveJob.STATUS_DONE,
            request_data={"candidate": "private"},
            result={"status": "SUCCESS"},
            finished_at=timezone.now(),
        )
        original_schedule = saved.schedule
        original_revision = saved.updated_at
        self.client.force_authenticate(user=self.admin_user)

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
        self.assertFalse(saved.is_distributed)
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )
        self.assertFalse(saved.conflict_review_open)
        self.assertFalse(saved.conflict_collection_open)
        self.assertEqual(saved.conflict_collection_revision, collection_revision)
        self.assertEqual(
            saved.conflict_collection_candidate_ids,
            [str(self.application.pk)],
        )
        self.assertEqual(
            saved.conflict_collection_participant_ids,
            [str(self.member.pk)],
        )
        availability.refresh_from_db()
        self.assertEqual(
            availability.conflict_collection_reviewed_candidate_ids,
            [str(self.application.pk)],
        )
        self.assertEqual(
            availability.conflict_collection_review_revision,
            collection_revision,
        )
        self.assertFalse(saved.revealed_groups.exists())
        self.assertGreater(saved.updated_at, original_revision)
        self.assertFalse(
            ScheduleDeviationApproval.objects.filter(pk=approval.pk).exists()
        )
        pending_job.refresh_from_db()
        self.assertEqual(pending_job.status, SolveJob.STATUS_CANCELLED)
        self.assertEqual(pending_job.request_data, {})
        self.assertIsNone(pending_job.result)
        completed_job.refresh_from_db()
        self.assertIsNotNone(completed_job.discarded_at)
        self.assertEqual(completed_job.result, {"status": "SUCCESS"})
        visibility_event = NameVisibilityAuditEvent.objects.get(
            saved_schedule=saved,
            group=self.committee_group,
        )
        self.assertEqual(visibility_event.actor, self.admin_user)
        self.assertEqual(
            visibility_event.action,
            NameVisibilityAuditEvent.ACTION_HIDDEN,
        )
        closure_events = ConflictReviewAuditEvent.objects.filter(
            saved_schedule=saved,
            action=ConflictReviewAuditEvent.ACTION_CLOSED,
        )
        self.assertEqual(closure_events.count(), 2)
        self.assertEqual(
            set(closure_events.values_list("phase", flat=True)),
            {
                ConflictReviewAuditEvent.PHASE_DRAFT,
                ConflictReviewAuditEvent.PHASE_COLLECTION,
            },
        )
        self.assertTrue(all(event.actor == self.admin_user for event in closure_events))

    def test_admin_opt_out_for_unassigned_interviewer_preserves_publication(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            schedule=[self._schedule_assignment(self.member)],
        )
        saved.revealed_groups.add(self.committee_group)
        approval = ScheduleDeviationApproval.objects.create(
            admission=self.admission,
            saved_schedule=saved,
            actor=self.admin_user,
            actor_username=self.admin_user.username,
            schedule_fingerprint="c" * 64,
            deviation_fingerprint="d" * 64,
            policy_snapshot={},
            availability_generation=saved.availability_generation,
            layout_version=saved.layout_version,
        )
        pending_job = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin_user,
            request_data={"candidate": "private"},
        )
        original_revision = saved.updated_at
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            self.url,
            {
                "user_id": str(self.recruiter.pk),
                "participation": "not_participating",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        self.assertTrue(
            saved.revealed_groups.filter(pk=self.committee_group.pk).exists()
        )
        self.assertGreater(saved.updated_at, original_revision)
        self.assertTrue(
            ScheduleDeviationApproval.objects.filter(pk=approval.pk).exists()
        )
        pending_job.refresh_from_db()
        self.assertEqual(pending_job.status, SolveJob.STATUS_CANCELLED)
        self.assertFalse(
            NameVisibilityAuditEvent.objects.filter(saved_schedule=saved).exists()
        )

    def test_removing_an_assigned_slot_unpublishes_the_plan(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540", "2026-04-21|600"],
            is_distributed=True,
            schedule=[self._schedule_assignment(self.member)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540", "2026-04-21|600"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|600"],
                "expected_availability_generation": saved.availability_generation,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertFalse(saved.is_distributed)
        self.assertEqual(saved.schedule, [self._schedule_assignment(self.member)])

    def test_adding_an_unrelated_slot_keeps_an_assigned_plan_published(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540", "2026-04-21|600"],
            is_distributed=True,
            schedule=[self._schedule_assignment(self.member)],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540", "2026-04-21|600"],
                "expected_availability_generation": saved.availability_generation,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)

    def test_only_conflicts_for_the_assigned_candidate_invalidate_publication(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
            is_distributed=True,
            schedule=[self._schedule_assignment(self.member)],
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            conflicts=["unrelated-candidate"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        saved.refresh_from_db()
        previous_values = {
            "slots": ["2026-04-21|540"],
            "conflicts": [],
            "participation": InterviewAvailability.PARTICIPATION_PARTICIPATING,
            "submitted_grid_generation": saved.availability_generation,
        }

        self.assertFalse(
            publication_is_invalidated_by_availability(
                saved,
                target_availability=availability,
                previous_values=previous_values,
            )
        )
        availability.conflicts = [str(self.application.pk)]
        self.assertTrue(
            publication_is_invalidated_by_availability(
                saved,
                target_availability=availability,
                previous_values=previous_values,
            )
        )

    def test_identical_availability_retry_is_a_true_no_op(self):
        saved = self._create_saved_schedule(
            enabled_slots=["2026-04-21|540"],
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member,
            slots=["2026-04-21|540"],
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
            submitted_grid_generation=saved.availability_generation,
        )
        approval = ScheduleDeviationApproval.objects.create(
            admission=self.admission,
            saved_schedule=saved,
            actor=self.admin_user,
            actor_username=self.admin_user.username,
            schedule_fingerprint="e" * 64,
            deviation_fingerprint="f" * 64,
            policy_snapshot={},
            availability_generation=saved.availability_generation,
            layout_version=saved.layout_version,
        )
        pending_job = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin_user,
            request_data={"candidate": "private"},
        )
        row_revision = availability.updated_at
        schedule_revision = saved.updated_at
        self.client.force_authenticate(user=self.member)

        response = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "expected_availability_generation": saved.availability_generation,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        availability.refresh_from_db()
        saved.refresh_from_db()
        pending_job.refresh_from_db()
        self.assertEqual(availability.updated_at, row_revision)
        self.assertEqual(saved.updated_at, schedule_revision)
        self.assertEqual(pending_job.status, SolveJob.STATUS_PENDING)
        self.assertTrue(
            ScheduleDeviationApproval.objects.filter(pk=approval.pk).exists()
        )

    def test_admin_cannot_set_participation_for_non_roster_user(self):
        self._create_saved_schedule()
        outsider = LegoUser.objects.create(
            username="availability-outsider",
            lego_id=629,
        )
        self.client.force_authenticate(user=self.admin_user)

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
        GroupApplication.objects.create(
            application=self.application,
            group=self.committee_group,
            text="Arrkom application",
        )
        self.url = reverse(
            "saved-schedule", kwargs={"admission_slug": self.admission.slug}
        )

    def _create_saved(self, **overrides):
        defaults = {
            "admission": self.admission,
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

    def test_committee_member_sees_only_config_until_distributed(self):
        self._create_saved(is_distributed=False)
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"], [])
        self.assertEqual(res.data["start_date"], "2026-04-20")

    def test_member_can_submit_availability_before_distribution(self):
        self._create_saved(
            is_distributed=False,
            enabled_slots=["2026-04-20|540"],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.post(
            reverse(
                "interview-availability",
                kwargs={"admission_slug": self.admission.slug},
            ),
            {"slots": ["2026-04-20|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_committee_member_receives_redacted_schedule_rows_when_hidden(self):
        self._create_saved(
            is_distributed=True,
            name_visibility="hidden",
            schedule=[
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "time": 8,
                    "panel": [
                        {
                            "id": str(self.member_user.pk),
                            "name": "Client supplied member name",
                        }
                    ],
                }
            ],
        )
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["schedule"]), 1)
        row = res.data["schedule"][0]
        self.assertEqual(row["candidate"], "Skjult kandidat")
        self.assertFalse(row["candidate_visible"])
        self.assertTrue(row["export_uid"])
        self.assertNotIn(str(self.application.pk), row["export_uid"])
        self.assertEqual(row["time"], 8)
        self.assertEqual(
            row["panel"],
            [
                {
                    "id": str(self.member_user.pk),
                    "name": self.member_user.username,
                }
            ],
        )
        self.assertNotIn("candidate_id", row)
        self.assertNotIn("candidate_phone", row)
        self.assertNotIn("interview_status", row)
        self.assertNotIn("interview_status_updated_at", row)
        self.assertNotIn("interview_status_updated_by", row)

    def test_committee_member_sees_names_when_visibility_committee(self):
        self._create_saved(is_distributed=True, name_visibility="committee")
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_repeating_effective_visibility_is_a_true_no_op(self):
        recruiter = LegoUser.objects.create(
            username="visibility-no-op-recruiter",
            lego_id=746,
        )
        Membership.objects.create(
            user=recruiter,
            role=RECRUITING,
            group=self.committee_group,
        )
        saved = self._create_saved()
        self.client.force_authenticate(user=recruiter)
        first = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "expected_updated_at": saved.updated_at.isoformat(),
            },
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        first_revision = first.data["updated_at"]
        first_event_count = NameVisibilityAuditEvent.objects.filter(
            saved_schedule=saved,
        ).count()

        repeated = self.client.post(
            self.url,
            {
                "name_visibility": "committee",
                "expected_updated_at": first_revision,
            },
            format="json",
        )

        self.assertEqual(repeated.status_code, status.HTTP_200_OK, repeated.data)
        self.assertEqual(repeated.data["updated_at"], first_revision)
        self.assertEqual(
            NameVisibilityAuditEvent.objects.filter(saved_schedule=saved).count(),
            first_event_count,
        )

        self.client.force_authenticate(user=self.admin_user)
        admin_save = self.client.post(
            self.url,
            {
                "session_duration": 30,
                "expected_updated_at": first_revision,
            },
            format="json",
        )
        self.assertEqual(admin_save.status_code, status.HTTP_200_OK, admin_save.data)

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
            key: response.data["schedule"][0].pop(key)
            for key in (
                "interview_status",
                "interview_status_updated_at",
                "interview_status_updated_by",
            )
        }
        export_uid = response.data["schedule"][0].pop("export_uid")
        self.assertEqual(
            response.data["schedule"],
            [
                {
                    "candidate": "Ada",
                    "candidate_id": str(self.application.pk),
                    "candidate_visible": True,
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
        self.assertTrue(workflow_fields["interview_status_updated_at"])
        self.assertEqual(workflow_fields["interview_status_updated_by"], "")
        self.assertRegex(export_uid, r"^[0-9a-f]{40}$")
        self.assertNotIn("candidate_email", response.data["schedule"][0])
        self.assertNotIn("candidate_phone", response.data["schedule"][0])
        self.assertNotContains(response, private_marker)

    def test_recruiter_receives_contact_and_workflow_for_visible_candidate(self):
        recruiter = LegoUser.objects.create(username="workflow-rec", lego_id=745)
        Membership.objects.create(
            user=recruiter, role=RECRUITING, group=self.committee_group
        )
        self.application.interview_status = "confirmed"
        self.application.interview_status_updated_by = recruiter
        self.application.interview_status_updated_by_username = recruiter.username
        self.application.save(
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

    def test_adding_group_with_an_existing_plan_is_rejected_atomically(self):
        other_group = Group.objects.create(name="Newkom", lego_id=740)
        other_member = LegoUser.objects.create(
            username="newkom-member",
            lego_id=741,
        )
        Membership.objects.create(
            user=other_member,
            role=MEMBER,
            group=other_group,
        )
        other_candidate = LegoUser.objects.create(
            username="newkom-candidate",
            first_name="Grace",
            lego_id=742,
        )
        other_application = UserApplication.objects.create(
            admission=self.admission,
            user=other_candidate,
        )
        GroupApplication.objects.create(
            application=other_application,
            group=other_group,
            text="Newkom application",
        )
        saved = self._create_saved(
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
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
        self.client.force_authenticate(user=self.admin_user)

        updated = self.client.patch(
            reverse(
                "manage-admission-detail",
                kwargs={"slug": self.admission.slug},
            ),
            {"groups": [str(self.committee_group.pk), str(other_group.pk)]},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_400_BAD_REQUEST, updated.data)
        self.assertIn("planutkast", str(updated.data))
        self.admission.refresh_from_db()
        self.assertEqual(list(self.admission.groups.all()), [self.committee_group])
        saved.refresh_from_db()
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        self.assertFalse(saved.revealed_groups.exists())

    def test_removing_group_with_an_existing_plan_preserves_disclosure(self):
        retained_group = Group.objects.create(name="Retainedkom", lego_id=743)
        self.admission.groups.add(retained_group)
        saved = self._create_saved(
            name_visibility=SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY
        )
        saved.revealed_groups.add(self.committee_group)
        manage_url = reverse(
            "manage-admission-detail",
            kwargs={"slug": self.admission.slug},
        )
        self.client.force_authenticate(user=self.admin_user)

        removed = self.client.patch(
            manage_url,
            {"groups": [str(retained_group.pk)]},
            format="json",
        )

        self.assertEqual(removed.status_code, status.HTTP_400_BAD_REQUEST, removed.data)
        saved.refresh_from_db()
        self.assertTrue(
            saved.revealed_groups.filter(pk=self.committee_group.pk).exists()
        )
        self.assertFalse(
            NameVisibilityAuditEvent.objects.filter(
                saved_schedule=saved,
                group=self.committee_group,
            ).exists()
        )
        self.assertEqual(
            set(self.admission.groups.values_list("pk", flat=True)),
            {self.committee_group.pk, retained_group.pk},
        )

        self.client.force_authenticate(user=self.member_user)
        member_schedule = self.client.get(self.url)
        self.assertEqual(
            [item["candidate"] for item in member_schedule.data["schedule"]],
            ["Ada"],
        )

    def test_unpublish_then_republish_does_not_restore_global_name_visibility(self):
        slot = "2026-04-20|480"
        InterviewAvailability.objects.create(
            admission=self.admission,
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
        saved.revealed_groups.add(self.committee_group)
        revision = uuid.uuid4()
        saved.conflict_collection_revision = revision
        saved.conflict_collection_candidate_ids = [str(self.application.pk)]
        saved.conflict_collection_participant_ids = [str(self.admin_user.pk)]
        saved.save(
            update_fields=[
                "conflict_collection_revision",
                "conflict_collection_candidate_ids",
                "conflict_collection_participant_ids",
            ]
        )
        InterviewAvailability.objects.filter(
            admission=self.admission,
            user=self.admin_user,
        ).update(
            conflict_collection_review_revision=revision,
            conflict_collection_reviewed_candidate_ids=[str(self.application.pk)],
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
        self.assertFalse(saved.revealed_groups.exists())

        self.client.force_authenticate(user=self.member_user)
        member_schedule = self.client.get(self.url)
        member_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(len(member_schedule.data["schedule"]), 1)
        self.assertEqual(
            member_schedule.data["schedule"][0]["candidate"],
            "Skjult kandidat",
        )
        self.assertFalse(
            member_schedule.data["schedule"][0]["candidate_visible"],
        )
        self.assertEqual(member_candidates.data, [])

        self.client.force_authenticate(user=self.admin_user)
        audit = self.client.get(
            reverse(
                "name-visibility-audit",
                kwargs={"admission_slug": self.admission.slug},
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
        self.assertEqual(saved.name_visibility, "hidden")
        self.assertEqual(list(saved.revealed_groups.all()), [self.committee_group])

        self.client.force_authenticate(user=self.member_user)
        own_schedule = self.client.get(self.url)
        own_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(
            [item["candidate"] for item in own_schedule.data["schedule"]],
            ["Ada", "Skjult kandidat"],
        )
        self.assertFalse(own_schedule.data["schedule"][1]["candidate_visible"])
        self.assertEqual(
            own_candidates.data,
            [{"id": str(self.application.pk), "name": "Ada"}],
        )
        self.assertNotIn("revealed_groups", own_schedule.data)

        self.client.force_authenticate(user=other_member)
        other_schedule = self.client.get(self.url)
        other_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(
            [item["candidate"] for item in other_schedule.data["schedule"]],
            ["Skjult kandidat", "Skjult kandidat"],
        )
        self.assertTrue(
            all(
                not item["candidate_visible"]
                for item in other_schedule.data["schedule"]
            )
        )
        self.assertEqual(other_candidates.data, [])

        audit_url = reverse(
            "name-visibility-audit",
            kwargs={"admission_slug": self.admission.slug},
        )
        self.client.force_authenticate(user=recruiter)
        self.assertEqual(
            self.client.get(audit_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(user=self.member_user)
        self.assertEqual(
            self.client.get(audit_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(user=self.admin_user)
        admin_schedule = self.client.get(self.url)
        self.assertEqual(
            admin_schedule.data["revealed_groups"],
            [
                {
                    "id": str(self.committee_group.pk),
                    "name": self.committee_group.name,
                }
            ],
        )
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
        self.assertEqual(list(saved.revealed_groups.all()), [other_group])

        self.client.force_authenticate(user=self.member_user)
        own_schedule = self.client.get(self.url)
        own_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(
            [item["candidate"] for item in own_schedule.data["schedule"]],
            ["Skjult kandidat", "Skjult kandidat"],
        )
        self.assertTrue(
            all(not item["candidate_visible"] for item in own_schedule.data["schedule"])
        )
        self.assertEqual(own_candidates.data, [])

        self.client.force_authenticate(user=other_member)
        other_schedule = self.client.get(self.url)
        other_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(
            [item["candidate"] for item in other_schedule.data["schedule"]],
            ["Skjult kandidat", "Grace"],
        )
        self.assertEqual(
            other_candidates.data,
            [{"id": str(other_application.pk), "name": "Grace"}],
        )

        self.client.force_authenticate(user=self.admin_user)
        audit = self.client.get(
            reverse(
                "name-visibility-audit",
                kwargs={"admission_slug": self.admission.slug},
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
        self.assertFalse(saved.revealed_groups.exists())

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
        self.assertFalse(saved.revealed_groups.exists())

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
        self.assertFalse(saved.revealed_groups.exists())

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
        self.assertEqual(draft.data["schedule"], [])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(saved.revealed_groups.exists())

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
        self.assertEqual(
            [item["candidate"] for item in res.data["schedule"]],
            ["Ada", "Skjult kandidat"],
        )
        self.assertFalse(res.data["schedule"][1]["candidate_visible"])

    def test_mixed_role_visibility_unions_recruiting_and_revealed_groups(self):
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

        saved = self._create_saved(
            name_visibility="admin_only",
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
        saved.revealed_groups.add(self.committee_group)
        self.client.force_authenticate(user=mixed_user)

        schedule = self.client.get(self.url)
        candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {item["candidate"] for item in schedule.data["schedule"]},
            {"Ada", "Grace", "Skjult kandidat"},
        )
        schedule_by_candidate = {
            item["candidate"]: item for item in schedule.data["schedule"]
        }
        self.assertNotIn("candidate_phone", schedule_by_candidate["Ada"])
        self.assertEqual(
            schedule_by_candidate["Grace"]["candidate_phone"],
            "+47 411 11 111",
        )
        self.assertEqual(
            {item["name"] for item in candidates.data},
            {"Ada", "Grace"},
        )

    def test_admin_sees_names_even_when_hidden(self):
        self._create_saved(is_distributed=True, name_visibility="hidden")
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["schedule"][0]["candidate"], "Ada")

    def test_admin_sees_stable_pseudonyms_until_conflict_collection_opens(self):
        saved = self._create_saved(
            is_distributed=False,
            name_visibility="hidden",
            conflict_collection_open=False,
            conflict_collection_revision=None,
        )
        self.client.force_authenticate(user=self.admin_user)

        schedule = self.client.get(self.url)
        candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(schedule.data["schedule"][0]["candidate"], "Kandidat 1")
        self.assertNotIn("candidate_phone", schedule.data["schedule"][0])
        self.assertEqual(
            candidates.data,
            [{"id": str(self.application.pk), "name": "Kandidat 1"}],
        )
        self.assertNotIn("Ada", str(schedule.data))
        self.assertNotIn("Ada", str(candidates.data))

        saved.conflict_collection_revision = uuid.uuid4()
        saved.save(update_fields=["conflict_collection_revision"])

        revealed_schedule = self.client.get(self.url)
        revealed_candidates = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(
            revealed_schedule.data["schedule"][0]["candidate"],
            "Ada",
        )
        self.assertEqual(revealed_candidates.data[0]["name"], "Ada")

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
            "interview-candidates", kwargs={"admission_slug": self.admission.slug}
        )
        self.availability_url = reverse(
            "interview-availability", kwargs={"admission_slug": self.admission.slug}
        )

    def test_admin_does_not_receive_candidate_gender(self):
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn("gender", res.data[0])

    def test_committee_member_never_sees_candidate_gender(self):
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
        self.assertNotEqual(res.data[0]["name"], "")
        self.assertNotIn("gender", res.data[0])

    def test_hidden_candidate_response_does_not_reveal_count(self):
        self.client.force_authenticate(user=self.member_user)

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_availability_excludes_members_without_an_actionable_workspace(self):
        inactive_member = LegoUser.objects.create(
            username="g-inactive", lego_id=805, gender="male"
        )
        Membership.objects.create(
            user=inactive_member, role=RETIREE, group=self.committee_group
        )
        ordinary_admin_group_member = LegoUser.objects.create(
            username="g-admin-member",
            lego_id=806,
            gender="male",
        )
        Membership.objects.create(
            user=ordinary_admin_group_member,
            role=MEMBER,
            group=self.admin_group,
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin_user,
            slots=["2026-04-20|480"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.member_user,
            slots=["2026-04-20|480"],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.availability_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {row["username"] for row in res.data},
            {"g-admin", "g-member"},
        )
        self.assertEqual(sum(1 for row in res.data if row["has_submitted"]), 2)
        self.assertEqual(sum(1 for row in res.data if not row["has_submitted"]), 0)

    def test_unpublished_committee_visibility_does_not_release_names(self):
        SavedSchedule.objects.create(
            admission=self.admission,
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
            user=self.admin_user,
            slots=[],
        )
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get(self.availability_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        genders = {row["username"]: row["gender"] for row in res.data}
        self.assertEqual(genders.get("g-admin"), "M")
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
            reverse("latest-solve-job"), {"admission_slug": self.admission.slug}
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
            {"admission_slug": self.admission.slug},
        )
        call_command("run_solver_worker", once=True)
        completed = self.client.get(
            reverse("latest-solve-job"),
            {"admission_slug": self.admission.slug},
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
            {"admission_slug": self.admission.slug},
        )
        call_command("run_solver_worker", once=True)
        completed = self.client.get(
            reverse("latest-solve-job"),
            {"admission_slug": self.admission.slug},
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

    def test_worker_does_not_reap_a_pending_job_based_on_queue_age(self):
        stale = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.user,
            request_data={},
            status=SolveJob.STATUS_PENDING,
        )
        SolveJob.objects.filter(id=stale.id).update(
            created_at=timezone.now()
            - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS + 60)
        )

        Command()._reap_stale_jobs()

        stale.refresh_from_db()
        self.assertEqual(stale.status, SolveJob.STATUS_PENDING)

    def test_cleanup_deletes_old_finished_jobs(self):
        old = SolveJob.objects.create(
            admission=self.admission,
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
        candidate = LegoUser.objects.create(
            username="proposal-candidate",
            lego_id=9592,
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=candidate,
        )
        self.saved = SavedSchedule.objects.create(
            admission=self.admission,
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
            user=self.user,
            slots=["2026-04-20|540"],
            submitted_grid_generation=self.saved.availability_generation,
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
        )
        self.client.force_authenticate(user=self.user)

    def _job(self):
        self.saved.refresh_from_db()
        request_data = {
            "baseline_updated_at": self.saved.updated_at.isoformat(),
            "candidates": [{"id": str(self.application.pk)}],
            "interviewers": [{"id": str(self.user.pk)}],
            "panel_size": 1,
            "options": {
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "stop",
                "same_panel_per_block": False,
                "allow_overtime": False,
            },
            "availability_generation": self.saved.availability_generation,
            "layout_version": self.saved.layout_version,
        }
        canonical = canonicalize_solver_payload(
            self.admission,
            self.saved,
            request_data,
            self.user,
        )
        request_data["planning_input_fingerprint"] = planning_input_fingerprint(
            {
                **request_data,
                **canonical,
            },
            self.saved.schedule or [],
        )
        return SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.user,
            status=SolveJob.STATUS_DONE,
            finished_at=timezone.now(),
            request_data=request_data,
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
        self.saved.refresh_from_db()
        self.assertIsNotNone(job.applied_at)
        self.assertEqual(job.applied_schedule_updated_at, self.saved.updated_at)

    def test_retrying_applied_job_rejects_an_unrelated_current_plan(self):
        job = self._job()
        first = self._apply(job)
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        SavedSchedule.objects.filter(pk=self.saved.pk).update(
            schedule=[],
            updated_at=timezone.now(),
        )
        self.saved.refresh_from_db()

        retry = self._apply(job, self.saved.updated_at.isoformat())

        self.assertEqual(retry.status_code, status.HTTP_409_CONFLICT)

    def test_legacy_applied_job_without_a_schedule_receipt_fails_closed(self):
        job = self._job()
        job.applied_at = timezone.now()
        job.save(update_fields=["applied_at"])

        retry = self._apply(job)

        self.assertEqual(retry.status_code, status.HTTP_409_CONFLICT)

    def test_apply_rejects_stale_or_published_draft(self):
        stale_job = self._job()
        SavedSchedule.objects.filter(pk=self.saved.pk).update(updated_at=timezone.now())
        stale = self._apply(stale_job)
        self.assertEqual(stale.status_code, status.HTTP_409_CONFLICT)

        self.saved.refresh_from_db()
        published_job = self._job()
        SavedSchedule.objects.filter(pk=self.saved.pk).update(is_distributed=True)
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

    def test_apply_rejects_while_conflict_collection_is_open(self):
        job = self._job()
        revision = uuid.uuid4()
        SavedSchedule.objects.filter(pk=self.saved.pk).update(
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(self.application.pk)],
            conflict_collection_participant_ids=[str(self.user.pk)],
        )

        response = self._apply(job)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("conflict_collection_open", response.data)
        job.refresh_from_db()
        self.assertIsNone(job.applied_at)
        self.assertIsNotNone(job.discarded_at)
        self.saved.refresh_from_db()
        self.assertEqual(self.saved.schedule, [])

    def test_apply_rejects_replacing_draft_before_collection(self):
        SavedSchedule.objects.filter(pk=self.saved.pk).update(
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "time": 540,
                    "panel": [{"id": str(self.user.pk)}],
                }
            ]
        )
        job = self._job()

        response = self._apply(job)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("conflict_collection_open", response.data)
        job.refresh_from_db()
        self.assertIsNone(job.applied_at)
        self.assertIsNotNone(job.discarded_at)

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
                kwargs={"admission_slug": self.admission.slug},
            ),
            {"panel_size": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(SolveJob.objects.filter(pk=job.pk).exists())


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
        self.candidate = LegoUser.objects.create(
            username="canonical-candidate", lego_id=962, gender="male"
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        SavedSchedule.objects.create(
            admission=self.admission,
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
            user=self.admin,
            slots=["2026-04-20|540"],
        )
        self.client.force_authenticate(user=self.admin)
        self.url = reverse("solve-schedule")

    def _payload(self, candidate_id=None):
        return {
            "admission_slug": self.admission.slug,
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

    def test_first_solve_can_create_anonymous_draft_before_collection(self):
        SavedSchedule.objects.filter(admission=self.admission).update(
            conflict_review_open=True
        )

        res = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(SolveJob.objects.filter(admission=self.admission).exists())

    def test_existing_draft_cannot_be_solved_before_collection(self):
        SavedSchedule.objects.filter(admission=self.admission).update(
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "time": 540,
                    "panel": [{"id": str(self.admin.pk)}],
                }
            ]
        )

        response = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["conflict_collection_open"],
            ["Åpne og fullfør inhabilitetskontrollen i Planutkast først."],
        )
        self.assertFalse(SolveJob.objects.filter(admission=self.admission).exists())

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
        UserApplication.objects.create(admission=self.admission, user=other_user)

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
        self.assertEqual(payload["candidates"][0]["name"], "Kandidat 1")
        self.assertEqual(
            payload["interviewers"][0]["experience_level"],
            InterviewAvailability.EXPERIENCE_UNKNOWN,
        )

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
        self.assertEqual(job.result["schedule"][0]["candidate"], "Kandidat 1")
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
        saved = SavedSchedule.objects.create(
            admission=admission,
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
        saved.revealed_groups.add(committee)
        availability = InterviewAvailability.objects.create(
            admission=admission, user=admin, conflicts=[candidate_id]
        )
        SolveJob.objects.create(
            admission=admission,
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

    def test_withdrawal_clears_legacy_name_only_schedule(self):
        admin = LegoUser.objects.create(username="legacy-admin", lego_id=982)
        candidate = LegoUser.objects.create(username="legacy-candidate", lego_id=983)
        admission = create_admission(created_by=admin, slug="legacy-purge-opptak")
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
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
        application = UserApplication.objects.create(
            admission=admission, user=candidate, phone_number="12345678"
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
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
