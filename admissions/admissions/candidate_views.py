from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    candidate_identity_is_revealed,
    get_candidate_pseudonyms,
    get_user_candidate_visible_groups,
    user_is_admission_admin,
    user_is_committee_member,
    user_is_interview_admin,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    LegoUser,
    NameVisibilityAuditEvent,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.scheduling_utils import (
    get_eligible_interviewer_ids,
    user_has_interview_availability,
)
from admissions.admissions.serializers import NameVisibilityAuditEventSerializer


class InterviewCandidatesView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "candidate_read"

    def _audit_conflict_review_access(self, admission, saved_schedule, user):
        events = ConflictReviewAuditEvent.objects.filter(admission=admission)
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
        candidate_identity_revealed = candidate_identity_is_revealed(saved)

        conflict_review_open = bool(
            saved is not None
            and saved.conflict_review_open
            and candidate_identity_revealed
            and not saved.is_distributed
            and user.id in get_eligible_interviewer_ids(admission)
            and user_has_interview_availability(admission, user.id)
        )
        visible_groups = get_user_candidate_visible_groups(admission, saved, user)
        pseudonymize_identity = is_admin and not candidate_identity_revealed
        hide_identity = not is_admin and (
            not candidate_identity_revealed
            or (not conflict_review_open and not visible_groups.exists())
        )

        applications = UserApplication.objects.filter(admission=admission)
        if not is_admin and not conflict_review_open:
            applications = applications.filter(
                group_applications__group__in=visible_groups
            ).distinct()
        applications = applications.select_related("user")
        if pseudonymize_identity:
            applications = applications.order_by("created_at", "pk")
        else:
            applications = applications.order_by(
                "user__first_name", "user__last_name", "user__username"
            )
        if hide_identity:
            payload = []
        else:
            if conflict_review_open and not is_admin:
                self._audit_conflict_review_access(admission, saved, user)
            pseudonyms = (
                get_candidate_pseudonyms(admission) if pseudonymize_identity else {}
            )
            payload = [
                {
                    "id": str(application.pk),
                    "name": (
                        pseudonyms[str(application.pk)]
                        if pseudonymize_identity
                        else application.user.get_full_name()
                        or application.user.username
                    ),
                }
                for application in applications
            ]

        return Response(payload, status=status.HTTP_200_OK)


class NameVisibilityAuditView(APIView):
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
