from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions.admission_access import user_is_admission_admin
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import Admission, LegoUser, SavedSchedule, SolveJob
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_solver_payload,
)
from admissions.admissions.schedule_windows import enabled_windows_to_slots
from admissions.admissions.serializers import (
    ScheduleRequestsSerializer,
    SolveJobSerializer,
)
from admissions.admissions.solve_jobs import (
    active_solve_job,
    build_solve_request,
    cancel_solve_job,
    enqueue_solve_job,
)


class SolveScheduleView(APIView):
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

        existing = active_solve_job(admission)
        if existing is not None:
            return Response(
                SolveJobSerializer(existing).data, status=status.HTTP_202_ACCEPTED
            )

        try:
            previous_schedule = admission.saved_schedule.schedule or []
        except SavedSchedule.DoesNotExist:
            previous_schedule = []

        request_data = build_solve_request(data, synthetic_input, previous_schedule)
        job = enqueue_solve_job(admission, user, request_data)
        return Response(SolveJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SolveJobStatusView(APIView):
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

    def delete(self, request, job_id):
        job, err = self._get_authorized_job(request, job_id)
        if err:
            return err
        job = cancel_solve_job(job)
        return Response(SolveJobSerializer(job).data)
