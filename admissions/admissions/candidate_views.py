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
    NameVisibilityAuditEvent,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.scheduling_utils import (
    publication_withholds_rows,
    published_candidate_ids,
)
from admissions.admissions.serializers import NameVisibilityAuditEventSerializer


class InterviewCandidatesView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "candidate_read"

    def get(self, request, admission_slug, group_id):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        group = get_object_or_404(admission.groups, pk=group_id)

        user = request.user

        is_interview_admin = user_is_interview_admin(admission, group, user)
        is_committee_member = user_is_group_member(group, user)

        if not is_committee_member and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        saved = SavedSchedule.objects.filter(admission=admission, group=group).first()
        published = bool(saved is not None and saved.is_distributed)

        # A schedule belongs to exactly one committee now, so "can this
        # viewer see candidate identities" is just: do they run this
        # committee's workflow, or has this committee's own recruiter
        # published names to it.
        committee_revealed = bool(
            saved is not None
            and published
            and saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        hide_identity = not is_interview_admin and not committee_revealed

        # Members only ever see the published plan: until it is published
        # they have no standing to see any applicant data at all - not the
        # pool, and not a review scope. The published plan is the only
        # thing recruiters hand them.
        if not is_interview_admin:
            if not published:
                return Response([], status=status.HTTP_200_OK)

        applications = UserApplication.objects.filter(
            admission=admission, group_applications__group=group
        ).distinct()
        # Workflow operators always keep the full pool: the solve payload is
        # built from this list, and they see the pool before review opens and
        # after publish anyway. Members (post-publication only, see above)
        # get the published rows when names are revealed - withholds and all
        # - and nothing at all otherwise.
        if not is_interview_admin:
            if committee_revealed:
                if publication_withholds_rows(saved):
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

    def get(self, request, admission_slug, group_id):
        admission = get_object_or_404(Admission, slug=admission_slug)
        group = get_object_or_404(admission.groups, pk=group_id)
        if not user_is_interview_admin(admission, group, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        events = NameVisibilityAuditEvent.objects.filter(
            admission=admission, saved_schedule__group=group
        ).select_related("group", "actor")[: constants.MAX_NAME_VISIBILITY_AUDIT_EVENTS]
        serializer = NameVisibilityAuditEventSerializer(events, many=True)
        return Response(serializer.data)
