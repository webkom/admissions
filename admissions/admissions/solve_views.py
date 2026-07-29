from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    get_representing_groups,
    schedule_response_context,
    user_is_admission_admin,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import Admission, LegoUser, SavedSchedule, SolveJob
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_solver_payload,
)
from admissions.admissions.schedule_windows import enabled_windows_to_slots
from admissions.admissions.schedule_workflow import (
    ScheduleInputError,
    ScheduleRevisionConflict,
    update_saved_schedule,
)
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.serializers import (
    ApplySolveJobSerializer,
    SavedScheduleSerializer,
    ScheduleRequestsSerializer,
    SolveJobSerializer,
)
from admissions.admissions.solve_jobs import (
    ActiveSolveRequestConflict,
    active_solve_job,
    build_solve_request,
    cancel_solve_job,
    enqueue_solve_job,
    planning_input_fingerprint,
)


class SolveScheduleView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "solve_schedule"

    @transaction.atomic
    def post(self, request):
        """Enqueue a solve. The actual solving runs in run_solver_worker, so a
        heavy solve never blocks (or times out) the request — the client gets a
        job id back and polls SolveJobStatusView for the result."""
        admission_slug = request.data.get("admission_slug")
        if not isinstance(admission_slug, str) or not admission_slug:
            return Response(
                {"admission_slug": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        admission = get_object_or_404(Admission, slug=admission_slug)

        user = request.user
        user.__class__ = LegoUser
        if not user_is_admission_admin(admission, user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = ScheduleRequestsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        data["preview_only"] = bool(
            data.get("preview_only") or (data.get("options") or {}).get("repair_mode")
        )
        admission = Admission.objects.select_for_update().get(pk=admission.pk)

        synthetic_input = getattr(settings, "ALLOW_SYNTHETIC_SOLVER_INPUT", False) and (
            data.get("synthetic")
            or getattr(settings, "ALLOW_UNMARKED_SYNTHETIC_SOLVER_INPUT", False)
        )
        if not synthetic_input:
            try:
                saved_config = admission.saved_schedule
            except SavedSchedule.DoesNotExist:
                return Response(
                    {"all_slots": ["Tidsoppsettet må lagres før planlegging."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            baseline_updated_at = data.get("baseline_updated_at")
            if (
                baseline_updated_at is not None
                and saved_config.updated_at != baseline_updated_at
            ):
                return Response(
                    {
                        "baseline_updated_at": [
                            "Planen ble endret. Beregn løsningene på nytt."
                        ]
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if not saved_config.enabled_slots and saved_config.enabled_windows:
                saved_config.enabled_slots = enabled_windows_to_slots(
                    saved_config.enabled_windows, saved_config.session_duration
                )
            submitted_options = request.data.get("options")
            if (
                not isinstance(submitted_options, dict)
                or "require_experienced_panel" not in submitted_options
            ):
                options = dict(data.get("options") or {})
                options["require_experienced_panel"] = bool(
                    (saved_config.solver_options or {}).get(
                        "require_experienced_panel",
                        False,
                    )
                )
                data["options"] = options
            try:
                data.update(
                    canonicalize_solver_payload(
                        admission, saved_config, data, request.user
                    )
                )
            except ScheduleValidationError as exc:
                return Response(
                    {exc.field: [exc.message]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        try:
            previous_schedule = admission.saved_schedule.schedule or []
        except SavedSchedule.DoesNotExist:
            previous_schedule = []

        if not synthetic_input:
            data["availability_generation"] = saved_config.availability_generation
            data["layout_version"] = saved_config.layout_version
            data["baseline_updated_at"] = saved_config.updated_at
            data["auto_apply_if_empty"] = bool(
                not data["preview_only"]
                and not saved_config.schedule
                and not saved_config.is_distributed
            )
        request_data = build_solve_request(data, synthetic_input, previous_schedule)
        try:
            job = enqueue_solve_job(admission, user, request_data)
        except ActiveSolveRequestConflict:
            existing = active_solve_job(admission)
            return Response(
                {
                    "detail": (
                        "En annen beregning kjører med et annet grunnlag. "
                        "Vent til den er ferdig eller avbryt den først."
                    ),
                    "active_job": (
                        SolveJobSerializer(existing).data if existing else None
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(SolveJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SolveJobStatusView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "solve_status"

    def _get_authorized_job(self, request, job_id):
        job = get_object_or_404(SolveJob, id=job_id)
        user = request.user
        user.__class__ = LegoUser
        if not user_is_admission_admin(job.admission, user):
            return None, Response(status=status.HTTP_403_FORBIDDEN)
        return job, None

    def get(self, request, job_id):
        job, err = self._get_authorized_job(request, job_id)
        if err:
            return err
        return Response(SolveJobSerializer(job).data)

    @transaction.atomic
    def delete(self, request, job_id):
        job_stub, err = self._get_authorized_job(request, job_id)
        if err:
            return err
        job = SolveJob.objects.select_for_update().get(pk=job_stub.pk)
        if job.status in SolveJob.ACTIVE_STATUSES:
            job = cancel_solve_job(job)
        elif job.status == SolveJob.STATUS_DONE and job.applied_at is not None:
            return Response(
                {"detail": "Forslaget er allerede brukt."},
                status=status.HTTP_409_CONFLICT,
            )
        elif job.status == SolveJob.STATUS_DONE and job.discarded_at is None:
            job.discarded_at = timezone.now()
            job.save(update_fields=["discarded_at"])
        return Response(SolveJobSerializer(job).data)


class LatestSolveJobView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "solve_status"

    def get(self, request):
        admission_slug = request.query_params.get("admission_slug")
        admission = get_object_or_404(Admission, slug=admission_slug)
        user = request.user
        user.__class__ = LegoUser
        if not user_is_admission_admin(admission, user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        job = (
            SolveJob.objects.filter(admission=admission)
            .filter(
                Q(status__in=SolveJob.ACTIVE_STATUSES)
                | Q(
                    status=SolveJob.STATUS_DONE,
                    applied_at__isnull=True,
                    discarded_at__isnull=True,
                )
            )
            .filter(
                Q(request_data__preview_only=False)
                | Q(request_data__preview_only__isnull=True)
            )
            .order_by("-created_at")
            .first()
        )
        if job is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(SolveJobSerializer(job).data)


class SolveJobApplyView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "solve_schedule"

    @transaction.atomic
    def post(self, request, job_id):
        serializer = ApplySolveJobSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        job_stub = get_object_or_404(SolveJob, id=job_id)
        admission = Admission.objects.select_for_update().get(pk=job_stub.admission_id)
        user = request.user
        user.__class__ = LegoUser
        if not user_is_admission_admin(admission, user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        saved = (
            SavedSchedule.objects.select_for_update()
            .filter(admission=admission)
            .first()
        )
        if saved is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        job = SolveJob.objects.select_for_update().get(pk=job_id)
        if (job.request_data or {}).get("preview_only"):
            return Response(
                {"detail": "Forhåndsvisninger kan ikke brukes direkte."},
                status=status.HTTP_409_CONFLICT,
            )
        if job.status != SolveJob.STATUS_DONE or not isinstance(job.result, dict):
            return Response(
                {"detail": "Forslaget er ikke ferdig beregnet."},
                status=status.HTTP_409_CONFLICT,
            )
        if job.discarded_at is not None:
            return Response(
                {"detail": "Forslaget er forkastet."},
                status=status.HTTP_409_CONFLICT,
            )
        is_admission_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_groups(admission, user).exists()
        if job.applied_at is not None:
            return Response(
                SavedScheduleSerializer(
                    saved,
                    context=schedule_response_context(
                        admission,
                        saved,
                        user,
                        is_admission_admin,
                        is_recruiter,
                        is_admission_admin,
                    ),
                ).data
            )
        if (
            job.finished_at is not None
            and job.finished_at
            + timedelta(days=constants.SOLVE_PROPOSAL_RETENTION_DAYS)
            <= timezone.now()
        ):
            return Response(
                {"detail": "Forslaget er utløpt. Beregn et nytt forslag."},
                status=status.HTTP_409_CONFLICT,
            )
        if saved.is_distributed:
            return Response(
                {"detail": "En publisert plan kan ikke erstattes av et forslag."},
                status=status.HTTP_409_CONFLICT,
            )

        expected = serializer.validated_data["expected_updated_at"]
        request_data = job.request_data or {}
        baseline = parse_datetime(request_data.get("baseline_updated_at") or "")
        if (
            baseline is None
            or baseline != saved.updated_at
            or expected != saved.updated_at
        ):
            return Response(
                {
                    "detail": (
                        "Planutkastet er endret siden forslaget ble beregnet. "
                        "Beregn et nytt forslag."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        expected_planning_fingerprint = request_data.get("planning_input_fingerprint")
        try:
            canonical = canonicalize_solver_payload(
                admission,
                saved,
                request_data,
                user,
            )
            current_planning_fingerprint = planning_input_fingerprint(
                {
                    **request_data,
                    **canonical,
                },
                saved.schedule or [],
            )
        except ScheduleValidationError:
            current_planning_fingerprint = None
        if (
            not expected_planning_fingerprint
            or current_planning_fingerprint != expected_planning_fingerprint
        ):
            job.discarded_at = timezone.now()
            job.save(update_fields=["discarded_at"])
            return Response(
                {
                    "detail": (
                        "Kandidater, intervjuere eller tilgjengelighet er endret "
                        "siden forslaget ble beregnet. Beregn et nytt forslag."
                    ),
                    "schedule": [
                        "Forslaget bygger på et utdatert planleggingsgrunnlag."
                    ],
                },
                status=status.HTTP_409_CONFLICT,
            )

        solve_result = job.result
        if solve_result.get("status") not in ("SUCCESS", "PARTIAL"):
            return Response(
                {"detail": "Forslaget inneholder ingen plan som kan brukes."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            result = update_saved_schedule(
                admission=admission,
                user=user,
                data={
                    "expected_updated_at": expected,
                    "schedule": solve_result.get("schedule") or [],
                    "panel_size": request_data.get("panel_size"),
                    "solver_options": request_data.get("options") or {},
                    "is_distributed": False,
                },
                is_admin=True,
                is_admission_admin=is_admission_admin,
                is_recruiter=is_recruiter,
            )
        except ScheduleRevisionConflict:
            return Response(
                {"detail": "Planutkastet ble endret av noen andre."},
                status=status.HTTP_409_CONFLICT,
            )
        except ScheduleInputError as exc:
            return Response(exc.errors, status=status.HTTP_400_BAD_REQUEST)

        job.applied_at = timezone.now()
        job.save(update_fields=["applied_at"])
        return Response(
            SavedScheduleSerializer(
                result.saved_schedule,
                context=schedule_response_context(
                    result.admission,
                    result.saved_schedule,
                    user,
                    is_admission_admin,
                    is_recruiter,
                    is_admission_admin,
                ),
            ).data
        )
