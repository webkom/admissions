from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

from django.core.management import call_command
from django.db import InterfaceError, OperationalError
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.utils import timezone

from admissions.admissions import constants
from admissions.admissions.models import (
    Group,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
)
from admissions.admissions.solve_jobs import cancel_solve_job
from admissions.admissions.tests.utils import create_admission
from admissions.utils.management.commands import run_solver_worker
from admissions.utils.management.commands.run_solver_worker import Command


class WorkerStopped(BaseException):
    """Raised from a patched hook to break out of the worker's infinite loop.

    Deliberately a BaseException (like KeyboardInterrupt) so the worker's
    own transient-error handling cannot swallow it."""


class WorkerLoopResilienceTestCase(SimpleTestCase):
    """A transient DB error must not kill the long-lived worker loop."""

    def test_loop_survives_a_transient_db_error_while_claiming(self):
        with mock.patch.object(Command, "_reap_stale_jobs"), mock.patch.object(
            Command, "_cleanup_old_jobs"
        ), mock.patch.object(
            Command,
            "_claim_and_run",
            side_effect=[OperationalError("connection lost"), WorkerStopped()],
        ), mock.patch.object(
            run_solver_worker, "_refresh_db_connection"
        ) as refresh, mock.patch.object(
            run_solver_worker.time, "sleep"
        ) as sleep:
            with self.assertRaises(WorkerStopped):
                call_command("run_solver_worker")

        refresh.assert_called_once()
        sleep.assert_called_once_with(2.0)

    def test_loop_survives_a_transient_db_error_while_reaping(self):
        with mock.patch.object(
            Command,
            "_reap_stale_jobs",
            side_effect=[OperationalError("server closed the connection"), None],
        ), mock.patch.object(Command, "_cleanup_old_jobs"), mock.patch.object(
            Command, "_claim_and_run", side_effect=WorkerStopped()
        ), mock.patch.object(
            run_solver_worker.time, "sleep"
        ):
            with self.assertRaises(WorkerStopped):
                call_command("run_solver_worker")

    def test_loop_survives_a_closed_database_connection(self):
        with mock.patch.object(Command, "_reap_stale_jobs"), mock.patch.object(
            Command, "_cleanup_old_jobs"
        ), mock.patch.object(
            Command,
            "_claim_and_run",
            side_effect=[InterfaceError("connection closed"), WorkerStopped()],
        ), mock.patch.object(
            run_solver_worker.time, "sleep"
        ):
            with self.assertRaises(WorkerStopped):
                call_command("run_solver_worker")

    def test_once_mode_propagates_errors(self):
        """--once is for tests, which must fail loudly instead of retrying."""
        with mock.patch.object(Command, "_reap_stale_jobs"), mock.patch.object(
            Command, "_cleanup_old_jobs"
        ), mock.patch.object(
            Command, "_claim_and_run", side_effect=OperationalError("boom")
        ):
            with self.assertRaises(OperationalError):
                call_command("run_solver_worker", once=True)


class WorkerFailureHandlingTestCase(SimpleTestCase):
    def test_loop_propagates_unexpected_errors(self):
        with mock.patch.object(Command, "_reap_stale_jobs"), mock.patch.object(
            Command, "_cleanup_old_jobs"
        ), mock.patch.object(
            Command, "_claim_and_run", side_effect=RuntimeError("worker bug")
        ), mock.patch.object(
            run_solver_worker.time, "sleep", side_effect=WorkerStopped()
        ):
            with self.assertRaisesRegex(RuntimeError, "worker bug"):
                call_command("run_solver_worker")

    def test_write_back_propagates_unexpected_errors_without_retrying(self):
        with mock.patch.object(
            SolveJob.objects, "filter", side_effect=RuntimeError("worker bug")
        ), mock.patch.object(
            run_solver_worker.time, "sleep", side_effect=WorkerStopped()
        ):
            with self.assertRaisesRegex(RuntimeError, "worker bug"):
                Command()._write_back(
                    SimpleNamespace(id="job-id"),
                    result=None,
                    new_status=SolveJob.STATUS_DONE,
                    error="",
                )

    def test_write_back_retries_a_closed_database_connection(self):
        update_query = mock.Mock()
        update_query.update.return_value = 1
        with mock.patch.object(
            SolveJob.objects,
            "filter",
            side_effect=[InterfaceError("connection closed"), update_query],
        ), mock.patch.object(
            run_solver_worker, "_refresh_db_connection"
        ), mock.patch.object(
            run_solver_worker.time, "sleep"
        ):
            updated = Command()._write_back(
                SimpleNamespace(id="job-id"),
                result=None,
                new_status=SolveJob.STATUS_DONE,
                error="",
            )

        self.assertEqual(updated, 1)


class WriteBackResilienceTestCase(TestCase):
    """A connection dropped during the CPU-bound solve must not discard the
    finished result or leave the job stuck in RUNNING forever."""

    def setUp(self):
        self.user = LegoUser.objects.create(username="resilience-admin", lego_id=970)
        self.group = Group.objects.create(name="Resilience admins", lego_id=971)
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role=constants.RECRUITING,
        )
        self.admission = create_admission(
            created_by=self.user, slug="resilience-opptak"
        )
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)

    def _create_job(self, **overrides):
        defaults = {
            "admission": self.admission,
            "group": self.group,
            "requested_by": self.user,
            "request_data": {"panel_size": 1},
            "status": SolveJob.STATUS_RUNNING,
            "started_at": timezone.now(),
        }
        defaults.update(overrides)
        return SolveJob.objects.create(**defaults)

    def test_write_back_retries_and_saves_the_result(self):
        job = self._create_job()
        result = {
            "status": "SUCCESS",
            "schedule": [],
            "_solver_metrics": {
                "solver_engine_version": "v2",
                "placed_count": 0,
            },
        }
        real_filter = SolveJob.objects.filter
        attempts = []

        def flaky_filter(*args, **kwargs):
            attempts.append(1)
            if len(attempts) == 1:
                raise OperationalError("server closed the connection unexpectedly")
            return real_filter(*args, **kwargs)

        with mock.patch.object(
            run_solver_worker, "solve_schedule", return_value=result
        ), mock.patch.object(
            SolveJob.objects, "filter", side_effect=flaky_filter
        ), mock.patch.object(
            run_solver_worker.time, "sleep"
        ):
            Command()._run(job)

        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_DONE)
        self.assertEqual(job.result, result)
        self.assertNotIn("_solver_metrics", job.result)
        self.assertEqual(
            job.solver_metrics,
            {
                "solver_engine_version": "v2",
                "placed_count": 0,
            },
        )
        self.assertEqual(len(attempts), 2)

    def test_cancelled_job_rejects_a_late_worker_write_back(self):
        job = self._create_job()
        SolveJob.objects.filter(pk=job.pk).update(
            status=SolveJob.STATUS_CANCELLED,
            request_data={},
            result=None,
            finished_at=timezone.now(),
        )

        updated = Command()._write_back(
            job,
            result={"status": "SUCCESS", "schedule": [{"candidate": "late"}]},
            new_status=SolveJob.STATUS_DONE,
            error="",
        )

        self.assertEqual(updated, 0)
        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_CANCELLED)
        self.assertEqual(job.request_data, {})
        self.assertIsNone(job.result)

    def test_worker_rejects_a_baseline_that_changes_after_enqueue(self):
        saved = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-07-27",
            is_distributed=False,
        )
        baseline = saved.updated_at.isoformat()
        SavedSchedule.objects.filter(pk=saved.pk).update(
            updated_at=timezone.now() + timedelta(seconds=1)
        )
        job = self._create_job(
            request_data={
                "rehydrate": True,
                "baseline_updated_at": baseline,
            }
        )

        with mock.patch.object(run_solver_worker, "solve_schedule") as solver:
            Command()._run(job)

        solver.assert_not_called()
        job.refresh_from_db()
        saved.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_DONE)
        self.assertEqual(job.result["status"], "ERROR")
        self.assertIn("endret", job.result["error"])
        self.assertEqual(saved.schedule, [])
        self.assertFalse(saved.is_distributed)

    def test_write_back_gives_up_after_bounded_attempts(self):
        job = self._create_job()
        attempts = []

        def dead_filter(*args, **kwargs):
            attempts.append(1)
            raise OperationalError("connection already closed")

        with mock.patch.object(
            run_solver_worker,
            "solve_schedule",
            return_value={"status": "SUCCESS", "schedule": []},
        ), mock.patch.object(
            SolveJob.objects, "filter", side_effect=dead_filter
        ), mock.patch.object(
            run_solver_worker.time, "sleep"
        ):
            with self.assertRaises(OperationalError):
                Command()._run(job)

        self.assertEqual(len(attempts), run_solver_worker.WRITE_BACK_ATTEMPTS)
        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_RUNNING)

    def test_loop_survives_write_back_exhaustion_and_the_job_is_reaped(self):
        job = self._create_job(status=SolveJob.STATUS_PENDING, started_at=None)

        with mock.patch.object(
            run_solver_worker,
            "solve_schedule",
            return_value={"status": "SUCCESS", "schedule": []},
        ), mock.patch.object(
            Command, "_write_back", side_effect=OperationalError("gone")
        ), mock.patch.object(
            run_solver_worker.time,
            "sleep",
            side_effect=[None, WorkerStopped()],
        ):
            with self.assertRaises(WorkerStopped):
                call_command("run_solver_worker")

        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_RUNNING)

        SolveJob.objects.filter(id=job.id).update(
            started_at=timezone.now()
            - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS + 60)
        )
        call_command("run_solver_worker", once=True)
        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_ERROR)


class IncumbentPreviewMixin:
    def setUp(self):
        self.user = LegoUser.objects.create(username="preview-admin", lego_id=980)
        self.group = Group.objects.create(name="Preview admins", lego_id=981)
        Membership.objects.create(
            user=self.user, group=self.group, role=constants.RECRUITING
        )
        self.admission = create_admission(created_by=self.user, slug="preview-opptak")
        self.admission.admin_groups.add(self.group)
        self.admission.groups.add(self.group)

    def _create_job(self):
        return SolveJob.objects.create(
            admission=self.admission,
            group=self.group,
            requested_by=self.user,
            request_data={"panel_size": 1, "options": {}},
            request_fingerprint="fp-preview",
            status=SolveJob.STATUS_RUNNING,
            started_at=timezone.now(),
        )


class IncumbentPublisherTestCase(IncumbentPreviewMixin, TransactionTestCase):
    """The publisher writes from its own thread, hence its own connection.

    That is the whole point of it - a Django connection is thread-local, and
    CP-SAT calls back on solver threads - but it also means these cases need
    committed data, not a wrapping test transaction.
    """

    def test_a_preview_reaches_the_job_row_while_it_is_still_running(self):
        job = self._create_job()
        publisher = run_solver_worker.IncumbentPublisher(job.id)
        try:
            # True: nothing has told the solver to stop.
            self.assertTrue(publisher.submit({"status": "SUCCESS", "schedule": []}))
        finally:
            # close() flushes the pending write before joining the thread.
            publisher.close()

        job.refresh_from_db()
        self.assertEqual(job.preview_result, {"status": "SUCCESS", "schedule": []})
        self.assertIsNotNone(job.preview_updated_at)

    def test_cancelling_stops_the_solver_and_keeps_the_best_plan(self):
        job = self._create_job()
        best = {"status": "SUCCESS", "schedule": [{"candidate": "a"}]}
        publisher = run_solver_worker.IncumbentPublisher(job.id)
        publisher.submit(best)
        publisher.close()

        cancel_solve_job(job)

        stopped = run_solver_worker.IncumbentPublisher(job.id)
        # The first submit still answers with the cached verdict; the write it
        # triggers is what discovers the cancellation.
        stopped.submit({"status": "SUCCESS", "schedule": []})
        stopped.close()
        self.assertFalse(stopped.submit({"status": "SUCCESS", "schedule": []}))

        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_CANCELLED)
        # cancel_solve_job clears `result` but deliberately leaves the preview,
        # so "stop and use this plan" does not throw the solve away.
        self.assertIsNone(job.result)
        self.assertEqual(job.preview_result, best)


class IncumbentPreviewTestCase(IncumbentPreviewMixin, TestCase):
    def test_a_preview_carries_the_context_that_makes_it_adoptable(self):
        job = self._create_job()
        published = []

        def solve_publishing_once(*args, **kwargs):
            kwargs["on_incumbent"]({"status": "SUCCESS", "schedule": []})
            return {"status": "SUCCESS", "schedule": [], "_solver_metrics": {}}

        with mock.patch.object(
            run_solver_worker, "solve_schedule", side_effect=solve_publishing_once
        ), mock.patch.object(
            run_solver_worker.IncumbentPublisher,
            "submit",
            autospec=True,
            side_effect=lambda self, payload: published.append(payload) is None or True,
        ):
            Command()._run(job)

        self.assertEqual(len(published), 1)
        preview = published[0]
        self.assertEqual(preview["request_fingerprint"], "fp-preview")
        self.assertIn("policy_snapshot", preview)
        self.assertIn("deviation_review", preview)

    def test_the_final_result_clears_the_live_preview(self):
        job = self._create_job()
        SolveJob.objects.filter(pk=job.pk).update(
            preview_result={"status": "SUCCESS", "schedule": []},
            preview_updated_at=timezone.now(),
        )

        with mock.patch.object(
            run_solver_worker,
            "solve_schedule",
            return_value={"status": "SUCCESS", "schedule": [], "_solver_metrics": {}},
        ):
            Command()._run(job)

        job.refresh_from_db()
        self.assertEqual(job.status, SolveJob.STATUS_DONE)
        self.assertIsNone(job.preview_result)
        self.assertIsNone(job.preview_updated_at)
