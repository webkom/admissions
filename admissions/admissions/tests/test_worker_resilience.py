from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

from django.core.management import call_command
from django.db import InterfaceError, OperationalError
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from admissions.admissions import constants
from admissions.admissions.models import Group, LegoUser, Membership, SolveJob
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


class WorkerStaleJobReapingTestCase(TestCase):
    def test_old_pending_jobs_are_not_reaped_before_a_worker_claims_them(self):
        admission = create_admission(slug="pending-queue-age")
        old_job = SolveJob.objects.create(
            admission=admission,
            status=SolveJob.STATUS_PENDING,
            request_data={},
        )
        SolveJob.objects.filter(pk=old_job.pk).update(
            created_at=timezone.now()
            - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS + 1)
        )

        Command()._reap_stale_jobs()

        old_job.refresh_from_db()
        self.assertEqual(old_job.status, SolveJob.STATUS_PENDING)


class WriteBackResilienceTestCase(TestCase):
    """A connection dropped during the CPU-bound solve must not discard the
    finished result or leave the job stuck in RUNNING forever."""

    def setUp(self):
        self.user = LegoUser.objects.create(username="resilience-admin", lego_id=970)
        self.admin_group = Group.objects.create(name="Resilience admins", lego_id=971)
        Membership.objects.create(
            user=self.user,
            group=self.admin_group,
            role=constants.RECRUITING,
        )
        self.admission = create_admission(
            created_by=self.user, slug="resilience-opptak"
        )
        self.admission.admin_groups.add(self.admin_group)

    def _create_job(self, **overrides):
        defaults = {
            "admission": self.admission,
            "requested_by": self.user,
            "request_data": {"panel_size": 1},
            "status": SolveJob.STATUS_RUNNING,
            "started_at": timezone.now(),
        }
        defaults.update(overrides)
        return SolveJob.objects.create(**defaults)

    def test_write_back_retries_and_saves_the_result(self):
        job = self._create_job()
        result = {"status": "SUCCESS", "schedule": []}
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
        self.assertEqual(len(attempts), 2)

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
