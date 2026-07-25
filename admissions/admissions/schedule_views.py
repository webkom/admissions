from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions.admission_access import (
    get_representing_groups,
    schedule_response_context,
    user_is_admission_admin,
    user_is_committee_member,
    user_is_interview_admin,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import Admission, LegoUser, SavedSchedule
from admissions.admissions.schedule_workflow import (
    ScheduleInputError,
    ScheduleNotFound,
    SchedulePermissionDenied,
    ScheduleRevisionConflict,
    ensure_window_fields,
    update_saved_schedule,
)
from admissions.admissions.serializers import (
    SavedScheduleSerializer,
    SaveScheduleInputSerializer,
)


class SavedScheduleView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "schedule"

    def _get_admission_and_check(self, request, admission_slug, require_admin=False):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return None, False, False, False, Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        representing_groups = get_representing_groups(admission, user)
        is_recruiter = representing_groups.exists()

        is_interview_admin = user_is_interview_admin(admission, user)

        if require_admin and not is_interview_admin:
            return (
                None,
                is_admin,
                is_recruiter,
                is_interview_admin,
                Response(status=status.HTTP_403_FORBIDDEN),
            )

        if (
            not is_admin
            and not is_recruiter
            and not user_is_committee_member(admission, user)
        ):
            return (
                None,
                is_admin,
                is_recruiter,
                is_interview_admin,
                Response(status=status.HTTP_403_FORBIDDEN),
            )

        return admission, is_admin, is_recruiter, is_interview_admin, None

    def _schedule_response(
        self, saved, admission, user, is_admin, is_recruiter, is_interview_admin
    ):
        ensure_window_fields(saved)
        return Response(
            SavedScheduleSerializer(
                saved,
                context=schedule_response_context(
                    admission,
                    saved,
                    user,
                    is_admin,
                    is_recruiter,
                    is_interview_admin,
                ),
            ).data
        )

    def get(self, request, admission_slug):
        admission, is_admin, is_recruiter, is_interview_admin, err = self._get_admission_and_check(
            request, admission_slug
        )
        if err:
            return err

        try:
            saved = admission.saved_schedule
            return self._schedule_response(
                saved,
                admission,
                request.user,
                is_admin,
                is_recruiter,
                is_interview_admin,
            )
        except SavedSchedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    @transaction.atomic
    def post(self, request, admission_slug):
        admission, is_admin, is_recruiter, is_interview_admin, err = self._get_admission_and_check(
            request, admission_slug
        )
        if err:
            return err

        serializer = SaveScheduleInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = update_saved_schedule(
                admission=admission,
                user=request.user,
                data=serializer.validated_data,
                is_admin=is_interview_admin,
                is_admission_admin=is_admin,
                is_recruiter=is_recruiter,
            )
        except SchedulePermissionDenied:
            return Response(status=status.HTTP_403_FORBIDDEN)
        except ScheduleNotFound:
            return Response(status=status.HTTP_404_NOT_FOUND)
        except ScheduleRevisionConflict:
            return Response(
                {"detail": "Planen ble endret av noen andre. Last inn siden på nytt."},
                status=status.HTTP_409_CONFLICT,
            )
        except ScheduleInputError as exc:
            return Response(exc.errors, status=status.HTTP_400_BAD_REQUEST)

        return self._schedule_response(
            result.saved_schedule,
            result.admission,
            request.user,
            is_admin,
            is_recruiter,
            is_interview_admin,
        )
