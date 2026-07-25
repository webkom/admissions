import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.models import SolveJob
from admissions.admissions.solve_schedule import solve_schedule

log = get_logger()


class Command(BaseCommand):
    help = "Process queued interview-schedule solve jobs (SolveJob)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--poll-interval",
            type=float,
            default=2.0,
            help="Seconds to wait between polls when the queue is empty.",
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run one maintenance+claim cycle and exit. Intended for tests.",
        )

    def handle(self, *args, **options):
        poll_interval = options["poll_interval"]
        run_once = options["once"]
        log.info("solver_worker_started", poll_interval=poll_interval)
        while True:
            self._reap_stale_jobs()
            processed = self._claim_and_run()
            if run_once:
                return
            if not processed:
                self._cleanup_old_jobs()
                time.sleep(poll_interval)

    def _reap_stale_jobs(self):
        """Fail jobs stuck in RUNNING far longer than a solve can take — the
        worker that claimed them must have crashed or been restarted, so the
        client should stop waiting on them."""
        cutoff = timezone.now() - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS)
        reaped = SolveJob.objects.filter(
            status=SolveJob.STATUS_RUNNING, started_at__lt=cutoff
        ).update(
            status=SolveJob.STATUS_ERROR,
            error="Solve-worker stoppet uventet. Prøv å kjøre på nytt.",
            finished_at=timezone.now(),
        )
        if reaped:
            log.warning("solve_jobs_reaped", count=reaped)

    def _cleanup_old_jobs(self):
        """Prune finished jobs so the table doesn't grow without bound."""
        cutoff = timezone.now() - timedelta(days=constants.SOLVE_JOB_RETENTION_DAYS)
        deleted, _ = SolveJob.objects.filter(
            status__in=(
                SolveJob.STATUS_DONE,
                SolveJob.STATUS_ERROR,
                SolveJob.STATUS_CANCELLED,
            ),
            finished_at__lt=cutoff,
        ).delete()
        if deleted:
            log.info("solve_jobs_cleaned", count=deleted)

    def _claim_and_run(self):
        """Claim the oldest pending job and run it. Returns True if one ran.

        The claim happens inside a transaction with a row lock so several
        workers can run side by side without grabbing the same job; the solve
        itself runs outside the lock so a long solve never holds it.
        """
        skip_locked = connection.features.has_select_for_update_skip_locked
        with transaction.atomic():
            job = (
                SolveJob.objects.select_for_update(skip_locked=skip_locked)
                .filter(status=SolveJob.STATUS_PENDING)
                .order_by("created_at")
                .first()
            )
            if job is None:
                return False
            job.status = SolveJob.STATUS_RUNNING
            job.started_at = timezone.now()
            job.save(update_fields=["status", "started_at"])

        self._run(job)
        return True

    def _run(self, job):
        data = job.request_data or {}
        result = None
        error = ""
        new_status = SolveJob.STATUS_DONE
        try:
            result = solve_schedule(
                candidates_data=data.get("candidates", []),
                interviewers_data=data.get("interviewers", []),
                panel_size=data["panel_size"],
                options_data=data.get("options", {}),
                locked_assignments_data=data.get("locked_assignments", []),
                all_slots_data=data.get("all_slots", []),
                blocks_data=data.get("blocks", []),
                previous_schedule_data=data.get("previous_schedule", []),
            )
        except Exception as exc:
            log.exception("solve_job_failed", job_id=str(job.id))
            error = str(exc)
            new_status = SolveJob.STATUS_ERROR

        # Only write back if the job is still RUNNING; a concurrent cancel
        # (status -> CANCELLED) must win and not be overwritten by the result.
        updated = SolveJob.objects.filter(
            id=job.id, status=SolveJob.STATUS_RUNNING
        ).update(
            result=result,
            status=new_status,
            error=error,
            finished_at=timezone.now(),
        )
        log.info(
            "solve_job_finished",
            job_id=str(job.id),
            status=new_status if updated else SolveJob.STATUS_CANCELLED,
        )
