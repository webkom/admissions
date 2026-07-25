import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import (
    InterfaceError,
    OperationalError,
    close_old_connections,
    connection,
    models,
    transaction,
)
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.models import Admission, SavedSchedule, SolveJob
from admissions.admissions.schedule_validation import canonicalize_solver_payload
from admissions.admissions.solve_schedule import solve_schedule

log = get_logger()

WRITE_BACK_ATTEMPTS = 3
WRITE_BACK_RETRY_SECONDS = 1.0


def _refresh_db_connection():
    """Drop a stale or broken DB connection so the next query reconnects.

    Django only refreshes connections on request signals, which a long-lived
    management command never receives. Closing inside an atomic block is
    unrecoverable, so refresh is skipped while one is active."""
    if not connection.in_atomic_block:
        close_old_connections()


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
            try:
                self._reap_stale_jobs()
                self._cleanup_old_jobs()
                processed = self._claim_and_run()
                if run_once:
                    return
                if not processed:
                    time.sleep(poll_interval)
            except (InterfaceError, OperationalError):
                # A transient DB error (restart, failover, idle-timeout) must
                # not kill the worker: drop the broken connection so the next
                # cycle reconnects, wait, and keep polling. In --once mode the
                # error propagates instead so tests fail loudly.
                if run_once:
                    raise
                log.exception("solver_worker_cycle_failed")
                _refresh_db_connection()
                time.sleep(poll_interval)

    def _reap_stale_jobs(self):
        """Fail jobs stuck in RUNNING far longer than a solve can take — the
        worker that claimed them must have crashed or been restarted, so the
        client should stop waiting on them."""
        cutoff = timezone.now() - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS)
        reaped = SolveJob.objects.filter(
            models.Q(status=SolveJob.STATUS_RUNNING, started_at__lt=cutoff)
            | models.Q(status=SolveJob.STATUS_PENDING, created_at__lt=cutoff)
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
            if data.get("rehydrate"):
                with transaction.atomic():
                    admission = Admission.objects.select_for_update().get(
                        pk=job.admission_id
                    )
                    saved = SavedSchedule.objects.get(admission=admission)
                    baseline_updated_at = parse_datetime(
                        data.get("baseline_updated_at") or ""
                    )
                    if (
                        baseline_updated_at is not None
                        and saved.updated_at != baseline_updated_at
                    ):
                        result = {
                            "status": "ERROR",
                            "schedule": [],
                            "unplaceable": [],
                            "locked_conflicts": [],
                            "error": (
                                "Planen ble endret mens løsningen ble beregnet. "
                                "Beregn løsningene på nytt."
                            ),
                        }
                        data = None
                    else:
                        canonical = canonicalize_solver_payload(
                            admission, saved, data, job.requested_by
                        )
                        data = {
                            **data,
                            **canonical,
                            "previous_schedule": saved.schedule or [],
                        }
            if data is not None:
                result = solve_schedule(
                    candidates_data=data.get("candidates", []),
                    interviewers_data=data.get("interviewers", []),
                    panel_size=data["panel_size"],
                    options_data=data.get("options", {}),
                    locked_assignments_data=data.get("locked_assignments", []),
                    all_slots_data=data.get("all_slots"),
                    blocks_data=data.get("blocks", []),
                    block_metadata_data=data.get("block_metadata", []),
                    previous_schedule_data=data.get("previous_schedule", []),
                )
        except Exception as exc:
            log.exception(
                "solve_job_failed",
                job_id=str(job.id),
                error_type=type(exc).__name__,
            )
            error = "Solveren feilet under kjøring."
            new_status = SolveJob.STATUS_ERROR

        # The solve can hold the CPU for minutes while the DB connection sits
        # idle; reconnect if it went stale so the write-back doesn't fail.
        _refresh_db_connection()

        updated = self._write_back(job, result, new_status, error)
        log.info(
            "solve_job_finished",
            job_id=str(job.id),
            status=new_status if updated else SolveJob.STATUS_CANCELLED,
        )

    def _write_back(self, job, result, new_status, error):
        """Persist the finished result, retrying briefly on transient DB
        errors so a completed solve is not lost; raises after the final
        attempt (the job is then reaped as stale). Only writes if the job is
        still RUNNING; a concurrent cancel (status -> CANCELLED) must win
        and not be overwritten by the result."""
        for attempt in range(1, WRITE_BACK_ATTEMPTS + 1):
            try:
                return SolveJob.objects.filter(
                    id=job.id, status=SolveJob.STATUS_RUNNING
                ).update(
                    result=result,
                    status=new_status,
                    error=error,
                    finished_at=timezone.now(),
                )
            except (InterfaceError, OperationalError):
                log.exception(
                    "solve_job_write_back_failed",
                    job_id=str(job.id),
                    attempt=attempt,
                )
                _refresh_db_connection()
                if attempt == WRITE_BACK_ATTEMPTS:
                    raise
                time.sleep(WRITE_BACK_RETRY_SECONDS)
