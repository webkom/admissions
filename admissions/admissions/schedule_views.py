from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions.admission_access import (
    get_representing_groups,
    schedule_response_context,
    user_is_admission_admin,
    user_is_group_member,
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
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.serializers import (
    SavedScheduleSerializer,
    SaveScheduleInputSerializer,
)
from admissions.admissions.session_renewal import renew_session


class SavedScheduleView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "schedule"

    def _get_admission_and_check(
        self, request, admission_slug, group_id, require_admin=False
    ):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return (
                None,
                None,
                False,
                False,
                False,
                Response(status=status.HTTP_404_NOT_FOUND),
            )

        group = get_object_or_404(admission.groups, pk=group_id)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        representing_groups = get_representing_groups(admission, user)
        is_recruiter = representing_groups.exists()

        is_interview_admin = user_is_interview_admin(admission, group, user)

        if require_admin and not is_interview_admin:
            return (
                None,
                None,
                is_admin,
                is_recruiter,
                is_interview_admin,
                Response(status=status.HTTP_403_FORBIDDEN),
            )

        if (
            not is_interview_admin
            and not is_recruiter
            and not user_is_group_member(group, user)
        ):
            return (
                None,
                None,
                is_admin,
                is_recruiter,
                is_interview_admin,
                Response(status=status.HTTP_403_FORBIDDEN),
            )

        return admission, group, is_admin, is_recruiter, is_interview_admin, None

    def _schedule_response(self, saved, admission, is_interview_admin):
        ensure_window_fields(saved)
        return Response(
            SavedScheduleSerializer(
                saved,
                context=schedule_response_context(admission, saved, is_interview_admin),
            ).data
        )

    def get(self, request, admission_slug, group_id):
        admission, group, is_admin, is_recruiter, is_interview_admin, err = (
            self._get_admission_and_check(request, admission_slug, group_id)
        )
        if err:
            return err

        saved = SavedSchedule.objects.filter(admission=admission, group=group).first()
        if saved is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return self._schedule_response(saved, admission, is_interview_admin)

    @transaction.atomic
    def post(self, request, admission_slug, group_id):
        admission, group, is_admin, is_recruiter, is_interview_admin, err = (
            self._get_admission_and_check(request, admission_slug, group_id)
        )
        if err:
            return err

        serializer = SaveScheduleInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = update_saved_schedule(
                admission=admission,
                group=group,
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

        # A save is proof of a present human, same as an application submit.
        # Without this the interviewer and admin write flows were the only
        # real activity in the product that never slid the session window,
        # so a long planning session expired mid-edit.
        renew_session(request)

        return self._schedule_response(
            result.saved_schedule, result.admission, is_interview_admin
        )
