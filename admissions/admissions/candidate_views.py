from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    user_is_admission_admin,
    user_is_group_member,
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
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.scheduling_utils import (
    conflict_review_scope,
    decoy_review_scope,
    get_eligible_interviewer_ids,
    get_interviewer_participation,
    get_proposed_candidate_ids_by_interviewer,
    publication_withholds_rows,
    published_candidate_ids,
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
    ):
        phase = ConflictReviewAuditEvent.PHASE_DRAFT
        events = ConflictReviewAuditEvent.objects.filter(
            admission=admission,
            saved_schedule=saved_schedule,
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
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
        )

    def get(self, request, admission_slug, group_id):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        group = get_object_or_404(admission.groups, pk=group_id)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = user_is_interview_admin(admission, group, user)
        is_committee_member = user_is_group_member(group, user)

        if not is_committee_member and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        saved = SavedSchedule.objects.filter(admission=admission, group=group).first()

        conflict_review_open = bool(
            saved is not None
            and saved.conflict_review_open
            and not saved.is_distributed
            and user.id in get_eligible_interviewer_ids(admission, group)
            and user_has_interview_availability(admission, group, user.id)
        )
        # A schedule belongs to exactly one committee now, so "can this
        # viewer see candidate identities" is just: do they run this
        # committee's workflow, or has this committee's own recruiter
        # published names to it.
        committee_revealed = bool(
            saved is not None
            and saved.is_distributed
            and saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        hide_identity = (
            not is_admin
            and not is_interview_admin
            and not conflict_review_open
            and not committee_revealed
        )

        applications = UserApplication.objects.filter(
            admission=admission, group_applications__group=group
        ).distinct()
        # Workflow operators always keep the full pool: the solve payload is
        # built from this list, and they see the pool before review opens and
        # after publish anyway.
        collapsed_to_review_scope = (
            conflict_review_open and not is_admin and not is_interview_admin
        )
        if not is_admin and not is_interview_admin:
            if conflict_review_open:
                # The names shown must match the list they are asked to
                # confirm, or a swap partner appears as an unknown candidate.
                applications = applications.filter(
                    pk__in=conflict_review_scope(saved, user.id)
                )
            elif committee_revealed:
                if publication_withholds_rows(saved):
                    # A partial publish withholds rows, so it withholds those
                    # candidates' names too.
                    applications = applications.filter(
                        pk__in=published_candidate_ids(saved)
                    )
            else:
                applications = applications.none()
        applications = applications.select_related("user").order_by(
            "user__first_name", "user__last_name", "user__username"
        )
        if hide_identity:
            payload = []
        else:
            if not is_admin and conflict_review_open:
                self._audit_conflict_review_access(admission, saved, user)
            payload = [
                {
                    "id": str(application.pk),
                    "name": application.user.get_full_name()
                    or application.user.username,
                }
                for application in applications
            ]
            if collapsed_to_review_scope:
                # Same list, same request: a filler that only shows up on
                # a separate call would be distinguishable by timing.
                payload += [
                    {"id": entry["token"], "name": entry["name"]}
                    for entry in decoy_review_scope(saved, user.id)
                ]
                # One combined ordering - fillers clustered at the tail would
                # label themselves.
                payload.sort(key=lambda entry: (entry["name"].casefold(), entry["id"]))

        return Response(payload, status=status.HTTP_200_OK)


class NameVisibilityAuditView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "schedule"

    def get(self, request, admission_slug, group_id):
        admission = get_object_or_404(Admission, slug=admission_slug)
        group = get_object_or_404(admission.groups, pk=group_id)
        request.user.__class__ = LegoUser
        if not user_is_interview_admin(admission, group, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        events = NameVisibilityAuditEvent.objects.filter(
            admission=admission, saved_schedule__group=group
        ).select_related("group", "actor")[: constants.MAX_NAME_VISIBILITY_AUDIT_EVENTS]
        serializer = NameVisibilityAuditEventSerializer(events, many=True)
        return Response(serializer.data)
