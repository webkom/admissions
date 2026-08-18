from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    get_user_candidate_visible_groups,
    user_is_admission_admin,
    user_is_committee_member,
    user_is_interview_admin,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    InterviewAvailability,
    LegoUser,
    NameVisibilityAuditEvent,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.scheduling_utils import (
    get_eligible_interviewer_ids,
    get_interviewer_participation,
    get_proposed_candidate_ids_by_interviewer,
    user_has_interview_availability,
)
from admissions.admissions.serializers import NameVisibilityAuditEventSerializer


class InterviewCandidatesView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "candidate_read"

    def _audit_conflict_review_access(
        self,
        admission,
        saved_schedule,
        user,
        phase=ConflictReviewAuditEvent.PHASE_DRAFT,
    ):
        events = ConflictReviewAuditEvent.objects.filter(
            admission=admission,
            phase=phase,
        )
        latest_opened = events.filter(
            action=ConflictReviewAuditEvent.ACTION_OPENED
        ).first()
        prior_view = events.filter(
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
            actor_id=user.id,
        )
        if latest_opened is not None:
            prior_view = prior_view.filter(created_at__gte=latest_opened.created_at)
        if prior_view.exists():
            return
        ConflictReviewAuditEvent.objects.create(
            admission=admission,
            saved_schedule=saved_schedule,
            actor=user,
            actor_username=user.username,
            subject_user=user,
            subject_username=user.username,
            phase=phase,
            collection_revision=(
                saved_schedule.conflict_collection_revision
                if phase == ConflictReviewAuditEvent.PHASE_COLLECTION
                else None
            ),
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
        )

    def get(self, request, admission_slug):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = user_is_interview_admin(admission, user)
        is_committee_member = user_is_committee_member(admission, user)

        if not is_committee_member and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        saved = None
        try:
            saved = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            pass

        conflict_review_open = bool(
            saved is not None
            and saved.conflict_review_open
            and not saved.is_distributed
            and user.id in get_eligible_interviewer_ids(admission)
            and user_has_interview_availability(admission, user.id)
        )
        conflict_collection_scope_current = False
        if saved is not None and saved.conflict_collection_open:
            current_candidate_ids = {
                str(candidate_id)
                for candidate_id in UserApplication.objects.filter(
                    admission=admission
                ).values_list("pk", flat=True)
            }
            participation = get_interviewer_participation(admission, saved)
            current_participant_ids = {
                str(user_id)
                for user_id, state in participation.items()
                if state == InterviewAvailability.PARTICIPATION_PARTICIPATING
            }
            conflict_collection_scope_current = current_candidate_ids == set(
                saved.conflict_collection_candidate_ids
            ) and current_participant_ids == set(
                saved.conflict_collection_participant_ids
            )
        conflict_collection_open = bool(
            saved is not None
            and saved.conflict_collection_open
            and conflict_collection_scope_current
            and not saved.is_distributed
            and str(user.id) in saved.conflict_collection_participant_ids
        )
        collection_candidate_ids = set()
        if conflict_collection_open:
            own_application_ids = set(
                str(application_id)
                for application_id in UserApplication.objects.filter(
                    admission=admission,
                    user=user,
                ).values_list("pk", flat=True)
            )
            collection_candidate_ids = (
                set(saved.conflict_collection_candidate_ids) - own_application_ids
            )
        visible_groups = get_user_candidate_visible_groups(admission, saved, user)
        hide_identity = (
            not is_admin
            and not conflict_collection_open
            and not conflict_review_open
            and not visible_groups.exists()
        )

        applications = UserApplication.objects.filter(admission=admission)
        if not is_admin:
            if conflict_collection_open:
                applications = applications.filter(pk__in=collection_candidate_ids)
            elif conflict_review_open:
                applications = applications.filter(
                    pk__in=get_proposed_candidate_ids_by_interviewer(saved).get(
                        str(user.id), set()
                    )
                )
            else:
                applications = applications.filter(
                    group_applications__group__in=visible_groups
                ).distinct()
        applications = applications.select_related("user").order_by(
            "user__first_name", "user__last_name", "user__username"
        )
        if hide_identity:
            payload = []
        else:
            if not is_admin:
                if conflict_collection_open:
                    self._audit_conflict_review_access(
                        admission,
                        saved,
                        user,
                        ConflictReviewAuditEvent.PHASE_COLLECTION,
                    )
                elif conflict_review_open:
                    self._audit_conflict_review_access(admission, saved, user)
            payload = [
                {
                    "id": str(application.pk),
                    "name": application.user.get_full_name()
                    or application.user.username,
                }
                for application in applications
            ]

        return Response(payload, status=status.HTTP_200_OK)


class NameVisibilityAuditView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "schedule"

    def get(self, request, admission_slug):
        admission = get_object_or_404(Admission, slug=admission_slug)
        request.user.__class__ = LegoUser
        if not user_is_admission_admin(admission, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        events = NameVisibilityAuditEvent.objects.filter(
            admission=admission
        ).select_related("group", "actor")[: constants.MAX_NAME_VISIBILITY_AUDIT_EVENTS]
        serializer = NameVisibilityAuditEventSerializer(events, many=True)
        return Response(serializer.data)
