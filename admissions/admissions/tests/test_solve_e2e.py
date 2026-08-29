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
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_schedule,
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

    def _enqueue(self, extra_options=None):
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
                    **(extra_options or {}),
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

    def test_joint_interview_request_reaches_the_solver_and_applies(self):
        """candidates_per_session must survive the request serializer, produce a
        genuinely joint plan in the worker, and pass write-back validation.

        Before candidates_per_session was a declared solver option the field was
        silently dropped by SolveOptionsSerializer, so the solver always ran with
        one candidate per slot and canonicalize_schedule rejected any shared
        time. This pins the whole path end to end.
        """
        job_id = self._enqueue(extra_options={"candidates_per_session": 2})
        call_command("run_solver_worker", once=True)

        job = SolveJob.objects.get(id=job_id)
        self.assertEqual(job.status, SolveJob.STATUS_DONE, job.error)
        self.assertEqual((job.result or {}).get("status"), "SUCCESS", job.result)

        schedule = job.result["schedule"]
        rows_by_time = {}
        for row in schedule:
            rows_by_time.setdefault(row["time"], []).append(row)
        # A joint solve is exact: every occupied slot holds two candidates that
        # share one panel, and no slot holds more.
        self.assertTrue(
            any(len(rows) == 2 for rows in rows_by_time.values()),
            "solver did not pack any slot with two candidates",
        )
        for interview_time, rows in rows_by_time.items():
            self.assertLessEqual(
                len(rows), 2, f"slot {interview_time} has {len(rows)} rows"
            )
            panels = {
                frozenset(member["id"] for member in row["panel"]) for row in rows
            }
            self.assertEqual(
                len(panels), 1, f"slot {interview_time} has mismatched panels"
            )

        # An empty first draft auto-applies in the worker, which runs the
        # schedule through canonicalize_schedule - the second place the shared
        # time used to be rejected.
        self.saved.refresh_from_db()
        self.assertEqual(len(self.saved.schedule), len(schedule))
        self.assertIsNotNone(SolveJob.objects.get(id=job_id).applied_at)
        saved_times = {}
        for row in self.saved.schedule:
            saved_times[row["time"]] = saved_times.get(row["time"], 0) + 1
        self.assertTrue(any(count == 2 for count in saved_times.values()))

    def test_joint_interview_plan_passes_publish_validation(self):
        """canonicalize_schedule is the publish-path validator. It must accept a
        persisted joint plan (shared times, shared panel) rather than reject the
        second candidate at each slot."""
        self._enqueue(extra_options={"candidates_per_session": 2})
        call_command("run_solver_worker", once=True)
        self.saved.refresh_from_db()
        self.assertTrue(self.saved.schedule, "auto-apply did not persist a draft")

        common = dict(
            admission=self.admission,
            group=self.group,
            schedule=self.saved.schedule,
            start_date=self.saved.start_date,
            enabled_slots=self.saved.enabled_slots,
            panel_size=self.saved.panel_size,
            request_user_id=None,
            end_date=self.saved.end_date,
            session_duration=self.saved.session_duration,
            day_start_minute=self.saved.day_start_minute,
            day_end_minute=self.saved.day_end_minute,
            chunk_size=self.saved.chunk_size,
            chunk_break_minutes=self.saved.chunk_break_minutes,
            resolved_blocks=self.saved.resolved_blocks,
        )
        canonical = canonicalize_schedule(
            solver_options=self.saved.solver_options,
            require_all_candidates=True,
            **common,
        )
        self.assertEqual(len(canonical), len(self.saved.schedule))

        # The same plan with joint mode off must still be rejected - two rows at
        # one time is only legal because candidates_per_session says so.
        with self.assertRaises(ScheduleValidationError):
            canonicalize_schedule(
                solver_options={
                    **self.saved.solver_options,
                    "candidates_per_session": 1,
                },
                require_all_candidates=False,
                **common,
            )
