from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions.admission_access import (
    user_is_admission_admin,
    user_is_committee_member,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.lego_directory import (
    DirectoryAuthenticationRequired,
    DirectoryUnavailable,
    search_members,
)
from admissions.admissions.models import Admission, LegoUser
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin

MIN_QUERY_LENGTH = 2


class MemberSearchView(SchedulerFeatureGateMixin, APIView):
    """Look up Abakus members so an interviewer can declare their fadderbarn.

    Deliberately not reachable by applicants: it is an interviewer tool, and the
    result set is people, not candidates. Nothing here reveals whether anyone
    has applied.
    """

    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "member_search"

    def get(self, request, admission_slug):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser
        if not (
            user_is_committee_member(admission, user)
            or user_is_admission_admin(admission, user)
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        query = (request.query_params.get("q") or "").strip()
        # Too short to be a search, but not an error: the field is debounced and
        # a 400 while someone is still typing is noise.
        if len(query) < MIN_QUERY_LENGTH:
            return Response([])

        try:
            return Response(search_members(user, query))
        except DirectoryAuthenticationRequired:
            # Never a silent empty list: an interviewer who sees no results
            # concludes their fadderbarn is not in Abakus and gives up.
            return Response(
                {
                    "code": "lego_reauth_required",
                    "detail": "Logg inn på nytt for å søke etter medlemmer.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        except DirectoryUnavailable:
            return Response(
                {"detail": "Søk er utilgjengelig akkurat nå."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
