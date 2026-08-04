import time
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
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
from admissions.admissions.admission_access import (
    lock_user_admission_memberships,
    user_is_admission_admin,
)
from admissions.admissions.models import Admission, LegoUser, SavedSchedule, SolveJob
from admissions.admissions.schedule_policy import (
    build_deviation_review,
    normalize_schedule_policy,
)
from admissions.admissions.schedule_validation import canonicalize_solver_payload
from admissions.admissions.schedule_workflow import (
    ScheduleInputError,
    SchedulePermissionDenied,
    ScheduleRevisionConflict,
    update_saved_schedule,
)
from admissions.admissions.solve_jobs import planning_input_fingerprint
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
        parser.add_argument(
            "--job-id",
            type=uuid.UUID,
            help="Process this pending job. Requires --once and is intended for tests.",
        )

    def handle(self, *args, **options):
        if not getattr(settings, "ADMISSIONS_SCHEDULER_ENABLED", True):
            raise CommandError(
                "Intervjuplanleggeren er deaktivert. Sett "
                "ADMISSIONS_SCHEDULER_ENABLED=true for både web og worker."
            )
        poll_interval = options["poll_interval"]
        run_once = options["once"]
        job_id = options["job_id"]
        if job_id is not None and not run_once:
            raise CommandError("--job-id requires --once.")
        log.info("solver_worker_started", poll_interval=poll_interval)
        while True:
            try:
                self._reap_stale_jobs()
                self._cleanup_old_jobs()
                processed = self._claim_and_run(job_id=job_id)
                if run_once:
                    if job_id is not None and not processed:
                        raise CommandError(
                            f"Pending solve job {job_id} could not be claimed."
                        )
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
        """Fail claimed jobs stuck in RUNNING far longer than a solve can take.

        Queue age is not a worker lease. A healthy worker may legitimately leave
        later jobs pending while earlier solves consume the full runtime budget.
        """
        cutoff = timezone.now() - timedelta(seconds=constants.SOLVE_JOB_STALE_SECONDS)
        reaped = SolveJob.objects.filter(
            status=SolveJob.STATUS_RUNNING,
            started_at__lt=cutoff,
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
        proposal_cutoff = timezone.now() - timedelta(
            days=constants.SOLVE_PROPOSAL_RETENTION_DAYS
        )
        deleted, _ = SolveJob.objects.filter(
            models.Q(
                status__in=(SolveJob.STATUS_ERROR, SolveJob.STATUS_CANCELLED),
                finished_at__lt=cutoff,
            )
            | (
                models.Q(
                    status=SolveJob.STATUS_DONE,
                    finished_at__lt=cutoff,
                )
                & (
                    models.Q(applied_at__isnull=False)
                    | models.Q(discarded_at__isnull=False)
                )
            )
            | models.Q(
                status=SolveJob.STATUS_DONE,
                applied_at__isnull=True,
                discarded_at__isnull=True,
                finished_at__lt=proposal_cutoff,
            )
        ).delete()
        if deleted:
            log.info("solve_jobs_cleaned", count=deleted)

    def _claim_and_run(self, job_id=None):
        """Claim the requested or oldest pending job and run it.

        The claim happens inside a transaction with a row lock so several
        workers can run side by side without grabbing the same job; the solve
        itself runs outside the lock so a long solve never holds it.
        """
        skip_locked = connection.features.has_select_for_update_skip_locked
        with transaction.atomic():
            pending_jobs = SolveJob.objects.select_for_update(
                skip_locked=skip_locked
            ).filter(status=SolveJob.STATUS_PENDING)
            if job_id is not None:
                pending_jobs = pending_jobs.filter(pk=job_id)
            job = pending_jobs.order_by("created_at").first()
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
        solver_metrics = {}
        error = ""
        new_status = SolveJob.STATUS_DONE
        try:
            requested_by = job.requested_by
            if requested_by is None or not user_is_admission_admin(
                job.admission, requested_by
            ):
                raise SchedulePermissionDenied
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
                        canonical_data = {
                            **data,
                            **canonical,
                            "previous_schedule": saved.schedule or [],
                        }
                        expected_planning_fingerprint = data.get(
                            "planning_input_fingerprint"
                        )
                        if (
                            not expected_planning_fingerprint
                            or planning_input_fingerprint(
                                canonical_data,
                                saved.schedule or [],
                            )
                            != expected_planning_fingerprint
                        ):
                            result = {
                                "status": "ERROR",
                                "schedule": [],
                                "unplaceable": [],
                                "locked_conflicts": [],
                                "error": (
                                    "Planleggingsgrunnlaget ble endret mens "
                                    "løsningen ventet. Beregn et nytt forslag."
                                ),
                            }
                            data = None
                        else:
                            data = canonical_data
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
                    include_metrics=True,
                )
                solver_metrics = result.pop("_solver_metrics", {})
                policy = normalize_schedule_policy(data.get("options", {}))
                result["request_fingerprint"] = job.request_fingerprint
                result["policy_snapshot"] = policy.snapshot()
                result["deviation_review"] = build_deviation_review(
                    schedule=result.get("schedule", []),
                    policy=policy,
                    availability_generation=data.get("availability_generation", 1),
                    layout_version=data.get("layout_version", 1),
                )
        except SchedulePermissionDenied:
            error = "Kun opptaksansvarlige kan kjøre intervjusolveren."
            new_status = SolveJob.STATUS_ERROR
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

        updated = self._write_back(
            job, result, new_status, error, solver_metrics=solver_metrics
        )
        if updated and new_status == SolveJob.STATUS_DONE:
            self._auto_apply_empty_draft(job.id)
        log.info(
            "solve_job_finished",
            job_id=str(job.id),
            status=new_status if updated else SolveJob.STATUS_CANCELLED,
        )

    def _auto_apply_empty_draft(self, job_id):
        """Promote a first solve even if the browser that started it closes.

        The baseline, empty-draft check, publication check, and job lifecycle
        are all rechecked under locks. A failed check leaves a normal proposal
        that an administrator can inspect or discard later.
        """
        try:
            with transaction.atomic():
                job_stub = SolveJob.objects.only("admission_id", "requested_by_id").get(
                    pk=job_id
                )
                admission = Admission.objects.select_for_update().get(
                    pk=job_stub.admission_id
                )
                if job_stub.requested_by_id is None:
                    return False
                user = LegoUser.objects.get(pk=job_stub.requested_by_id)
                lock_user_admission_memberships(admission, user)
                saved = SavedSchedule.objects.select_for_update().get(
                    admission=admission
                )
                job = SolveJob.objects.select_for_update().get(pk=job_id)
                if job.admission_id != admission.pk or job.requested_by_id != user.pk:
                    return False
                request_data = job.request_data or {}
                solve_result = job.result if isinstance(job.result, dict) else {}
                baseline = parse_datetime(request_data.get("baseline_updated_at") or "")
                if (
                    not request_data.get("auto_apply_if_empty")
                    or job.status != SolveJob.STATUS_DONE
                    or job.applied_at is not None
                    or job.discarded_at is not None
                    # A deadline-limited partial plan must remain an explicit
                    # proposal. Only a complete, validated plan may be promoted
                    # automatically into an empty draft.
                    or solve_result.get("status") != "SUCCESS"
                    or baseline is None
                    or baseline != saved.updated_at
                    or saved.schedule
                    or saved.is_distributed
                ):
                    return False
                if not user_is_admission_admin(admission, user):
                    return False
                try:
                    canonical = canonicalize_solver_payload(
                        admission,
                        saved,
                        request_data,
                        user,
                    )
                except Exception:
                    return False
                expected_planning_fingerprint = request_data.get(
                    "planning_input_fingerprint"
                )
                if (
                    not expected_planning_fingerprint
                    or planning_input_fingerprint(
                        {
                            **request_data,
                            **canonical,
                        },
                        saved.schedule or [],
                    )
                    != expected_planning_fingerprint
                ):
                    return False
                result = update_saved_schedule(
                    admission=admission,
                    user=user,
                    data={
                        "expected_updated_at": saved.updated_at,
                        "schedule": solve_result.get("schedule") or [],
                        "panel_size": request_data.get("panel_size"),
                        "solver_options": request_data.get("options") or {},
                        "is_distributed": False,
                    },
                )
                job.applied_at = timezone.now()
                job.applied_schedule_updated_at = result.saved_schedule.updated_at
                job.save(update_fields=["applied_at", "applied_schedule_updated_at"])
                log.info("solve_job_auto_applied", job_id=str(job.id))
                return True
        except (
            LegoUser.DoesNotExist,
            SavedSchedule.DoesNotExist,
            SolveJob.DoesNotExist,
            ScheduleInputError,
            SchedulePermissionDenied,
            ScheduleRevisionConflict,
        ):
            log.info("solve_job_auto_apply_skipped", job_id=str(job_id))
            return False
        except Exception:
            log.exception("solve_job_auto_apply_failed", job_id=str(job_id))
            return False

    def _write_back(self, job, result, new_status, error, solver_metrics=None):
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
                    solver_metrics=solver_metrics or {},
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
