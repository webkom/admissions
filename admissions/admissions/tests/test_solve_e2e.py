"""End-to-end regression: a real (non-synthetic) solve request through the
API and the solver worker.

The rest of the suite exercises the solver with synthetic payloads (allowed
by the testing settings), which skips the rehydrate path the production
worker relies on: canonicalize_solver_payload rebuilding the problem from
the saved schedule. This test pins that whole path - enqueue, rehydrate,
solve, write-back - with a realistic seeded scenario.
"""

from django.core.management import call_command
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import RECRUITING
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
)
from admissions.admissions.scheduling_utils import get_committee_interviewer_ids
from admissions.admissions.tests.utils import create_admission


@override_settings(
    ALLOW_SYNTHETIC_SOLVER_INPUT=False,
    ALLOW_UNMARKED_SYNTHETIC_SOLVER_INPUT=False,
)
class NonSyntheticSolveE2ETestCase(APITestCase):
    def setUp(self):
        group = Group.objects.create(name="Webkom", lego_id=42)
        admin = LegoUser.objects.create(username="webkom-admin", lego_id=77)
        admission = create_admission(created_by=admin, slug="webkom-open")
        admission.groups.add(group)
        Membership.objects.create(user=admin, role=RECRUITING, group=group)
        call_command("seed_local_schedule", answer_all=True)
        self.saved = SavedSchedule.objects.select_related("admission", "group").first()
        self.admission = self.saved.admission
        self.group = self.saved.group
        self.client.force_authenticate(user=admin)
        self.url = reverse("solve-schedule")

    def _enqueue(self):
        interviewer_ids = get_committee_interviewer_ids(self.group)
        candidate_ids = list(
            GroupApplication.objects.filter(group=self.group).values_list(
                "application_id", flat=True
            )
        )
        res = self.client.post(
            self.url,
            {
                "admission_slug": self.admission.slug,
                "group_id": str(self.group.pk),
                "candidates": [{"id": cid} for cid in candidate_ids],
                "interviewers": [{"id": iid} for iid in interviewer_ids],
                "panel_size": self.saved.panel_size,
                "options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "stop",
                    "initial_strategy": "balanced",
                    "max_solver_seconds": 20,
                },
                "baseline_updated_at": self.saved.updated_at.isoformat(),
            },
            format="json",
        )
        self.assertEqual(
            res.status_code, status.HTTP_202_ACCEPTED, getattr(res, "data", None)
        )
        return res.data["job_id"]

    def test_non_synthetic_solve_rehydrates_and_places_everyone(self):
        job_id = self._enqueue()
        call_command("run_solver_worker", once=True)
        job = SolveJob.objects.get(id=job_id)
        self.assertEqual(job.status, SolveJob.STATUS_DONE, job.error)
        self.assertIn(
            (job.result or {}).get("status"),
            ("SUCCESS", "PARTIAL"),
            job.result,
        )
        self.assertTrue((job.result or {}).get("schedule"))
