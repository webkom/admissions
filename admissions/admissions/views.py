from django.conf import settings
from django.contrib.auth import logout as auth_logout
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic.base import TemplateView
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    APPLICATION_VIEW_MODE_ADMIN_FULL,
    APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
    get_application_view_mode,
    get_representing_groups,
    user_is_admission_admin,
    user_is_admission_leadership,
    user_is_org_leadership,
    user_represents_group,
)
from admissions.admissions.interview_workflow import (
    InterviewStatusConflict,
    InterviewStatusNotFound,
    update_interview_status,
)
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    GodUser,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.scheduling_utils import panel_gender_code
from admissions.admissions.serializers import (
    AdminAdmissionSerializer,
    AdminCreateUpdateAdmissionSerializer,
    AdministeredAdmissionSerializer,
    AdminUserApplicationSerializer,
    AdmissionGroupContentSerializer,
    AdmissionListPublicSerializer,
    AdmissionPublicSerializer,
    ApplicationCreateUpdateSerializer,
    CommitteeMinimalApplicationSerializer,
    GodUserSerializer,
    GroupSerializer,
    InterviewStatusSerializer,
    InterviewStatusUpdateSerializer,
    ManageAdmissionSerializer,
    UserApplicationSerializer,
)
from admissions.admissions.session_renewal import renew_session, session_expires_at
from admissions.utils.email import send_message

from .authentication import SessionAuthentication
from .permissions import (
    AdminAdmissionPermissions,
    AdmissionPermissions,
    ApplicationPermissions,
    GroupPermissions,
    IsActiveAdminGroupMember,
    IsCreatorOfObject,
    IsOrgLeadership,
    IsStaff,
    IsWebkom,
)

log = get_logger()


def _isoformat_or_blank(value):
    """Empty string, not None: the template context feeds a JSON blob the
    client reads as a plain optional string."""

    return value.isoformat() if value else ""


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AppView(TemplateView):
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["settings"] = settings
        user_data = {
            "id": "",
            "profile_picture": "",
            "full_name": "",
            "representative_of_group": "",
            "is_staff": False,
            "is_member_of_webkom": False,
            "is_org_leadership": False,
        }
        if self.request.user.is_authenticated:
            representative = self.request.user.representative_of_group
            user_data = {
                "id": str(self.request.user.pk),
                "profile_picture": self.request.user.profile_picture or "",
                "full_name": self.request.user.get_full_name(),
                "representative_of_group": (
                    representative.name if representative else ""
                ),
                # is_staff is persisted at login, so it can be stale for a
                # freshly-promoted co-leader until their next login; the live
                # check below is what the manage page should actually key on.
                "is_staff": self.request.user.is_staff,
                "is_member_of_webkom": self.request.user.is_member_of_webkom,
                "is_org_leadership": user_is_org_leadership(self.request.user),
            }
        context["django_data"] = {"user": user_data}
        context["frontend_config"] = {
            "SENTRY_DSN": getattr(settings, "SENTRY_DSN", ""),
            "RELEASE": getattr(settings, "RELEASE", ""),
            "ENVIRONMENT": getattr(settings, "ENVIRONMENT_NAME", ""),
            "API_URL": settings.API_URL,
            "CSRF_COOKIE_NAME": settings.CSRF_COOKIE_NAME,
            # Lets the client warn before the session expires instead of
            # discovering it when a submit fails. Reads the enforced
            # expire_date rather than session.get_expiry_date(), which without
            # _session_expiry set just returns now() + SESSION_COOKIE_AGE and
            # so reported a fresh full window on every single page load.
            "SESSION_EXPIRES_AT": _isoformat_or_blank(
                session_expires_at(self.request)
                if self.request.user.is_authenticated
                else None
            ),
            "SCHEDULER_ENABLED": getattr(
                settings,
                "ADMISSIONS_SCHEDULER_ENABLED",
                True,
            ),
        }
        return context


##################################################
################## PUBLIC VIEWS ##################
##################################################


def logout(request):
    # Protect against cross-site logout nuisance attacks (e.g. <img src="/logout/"> or
    # cross-origin fetches). Allow POST requests, and for GET requests verify that the
    # call originates from the same site via modern Fetch Metadata or Referer.
    if request.method == "POST":
        auth_logout(request)
        return redirect("/")

    sec_fetch_site = request.headers.get("Sec-Fetch-Site")
    if sec_fetch_site in ("cross-site",):
        return redirect("/")

    referer = request.headers.get("Referer")
    if referer:
        from urllib.parse import urlparse

        parsed = urlparse(referer)
        if parsed.netloc and parsed.netloc != request.get_host():
            return redirect("/")

    auth_logout(request)
    return redirect("/")


class PublicAdmissionViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = Admission.objects.all()
    authentication_classes = [SessionAuthentication]
    permission_classes = [AdmissionPermissions]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "application_read"
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AdmissionPublicSerializer

        return AdmissionListPublicSerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)

        # Sorting after the data has been fetched to be able to use the models properties
        serializer_data = sorted(
            serializer.data,
            key=lambda admission: (
                -admission["is_open"],
                -admission["is_appliable"],
                admission["is_closed"],
                admission["public_deadline"],
            ),
        )

        return Response(serializer_data)


class PublicApplicationViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = UserApplication.objects.none()
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "application_write"

    def get_serializer_class(self):
        if self.action in ("create"):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def get_throttles(self):
        # throttle_scope is class-level, so the `mine` GET was spending the
        # submit budget on every portal load.
        if self.action == "create":
            self.throttle_scope = "application_write"
        else:
            self.throttle_scope = "application_read"
        return super().get_throttles()

    def perform_create(self, serializer):
        admission_slug = self.kwargs.get("admission_slug", None)
        serializer.save(user=self.request.user, admission_slug=admission_slug)
        # A submit is proof of a present human, so slide the session window.
        renew_session(self.request)

    @action(detail=False, methods=["GET", "DELETE"])
    def mine(self, request, admission_slug):
        try:
            if request.method == "GET":
                instance = UserApplication.objects.get(
                    user=request.user, admission__slug=admission_slug
                )
                serializer = self.get_serializer(instance)
                return Response(serializer.data)
            elif request.method == "DELETE":
                instance = UserApplication.objects.get(
                    user=request.user, admission__slug=admission_slug
                )
                serializer = self.get_serializer(instance)
                applied_groups = [
                    (group.get("group").get("pk"), group.get("group").get("name"))
                    for group in serializer.data.get("group_applications")
                ]
                recruiters = {}
                for group_pk, group_name in applied_groups:
                    # Distinct addresses, not rows: memberships are unique per
                    # (user, group, ROLE), so somebody who is both leader and
                    # recruiter of a committee has two rows and would otherwise
                    # be mailed twice about the same withdrawal.
                    recruiters[group_name] = list(
                        Membership.objects.filter(
                            Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                            group=group_pk,
                        )
                        .values_list("user__email", flat=True)
                        .distinct()
                    )

                admission = get_object_or_404(Admission, slug=admission_slug)
                admission_title = admission.title
                # Delete first: the user must be able to withdraw even when mail
                # is down. Recruiter notifications are best-effort.
                instance.delete()
                for group, group_recruiters in recruiters.items():
                    try:
                        send_message(admission_title, group, group_recruiters)
                    except Exception:
                        log.exception("withdrawal_notification_failed", group=group)
                return Response(status=status.HTTP_204_NO_CONTENT)
        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)


#################################################
################## ADMIN VIEWS ##################
#################################################


class AdminAdmissionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Admission.objects.all().order_by("title")
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, AdminAdmissionPermissions]
    serializer_class = AdminAdmissionSerializer
    lookup_field = "slug"


class AdminApplicationViewSet(
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]
    serializer_class = AdminUserApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "application_read"

    def get_permissions(self):
        """Instantiate the permissions for this request.

        Build a fresh local list every call — never append to the class-level
        ``permission_classes``, which is shared across all requests in a
        long-lived worker and would otherwise grow unbounded.
        """
        permission_classes = [permissions.IsAuthenticated, ApplicationPermissions]
        return [permission() for permission in permission_classes]

    def get_throttles(self):
        self.throttle_scope = (
            "application_write"
            if getattr(self, "action", None) == "interview_status"
            else "application_read"
        )
        return super().get_throttles()

    def get_application_exposure(self):
        if hasattr(self, "_application_exposure"):
            return self._application_exposure
        admission_slug = self.kwargs.get("admission_slug")
        admission = get_object_or_404(Admission, slug=admission_slug)
        user = self.request.user
        represented_groups = get_representing_groups(admission, user)
        view_mode = get_application_view_mode(admission, user)
        self._application_exposure = (
            admission,
            represented_groups,
            view_mode,
        )
        return self._application_exposure

    def get_serializer_class(self):
        if (
            getattr(self, "action", None) == "list"
            and self.get_application_exposure()[2]
            == APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL
        ):
            return CommitteeMinimalApplicationSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        admission, representing_groups, view_mode = self.get_application_exposure()
        admission_slug = admission.slug
        user = self.request.user
        if user.is_anonymous:
            return UserApplication.objects.none()
        # Check membership in admin groups
        if (
            user_is_admission_admin(admission, user)
            or view_mode == APPLICATION_VIEW_MODE_ADMIN_FULL
        ):
            return (
                super()
                .get_queryset()
                .filter(admission__slug=admission_slug)
                .prefetch_related("group_applications", "group_applications__group")
            )
        if view_mode == APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL:
            qs = GroupApplication.objects.filter(
                group__in=representing_groups
            ).select_related("group")
            return (
                super()
                .get_queryset()
                .filter(
                    group_applications__group__in=representing_groups,
                    admission__slug=admission_slug,
                )
                .distinct()
                .prefetch_related(
                    Prefetch(
                        "group_applications",
                        queryset=qs,
                        to_attr="group_applications_filtered",
                    )
                )
            )
        # Check membership in admission groups
        if representing_groups.exists():
            qs = GroupApplication.objects.filter(
                group__in=representing_groups
            ).select_related("group")

            return (
                super()
                .get_queryset()
                .filter(
                    group_applications__group__in=representing_groups,
                    admission__slug=admission_slug,
                )
                .distinct()
                .prefetch_related(
                    Prefetch(
                        "group_applications",
                        queryset=qs,
                        to_attr="group_applications_filtered",
                    )
                )
            )
        # No permissions
        return UserApplication.objects.none()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.user.is_anonymous:
            return context
        admission, _, view_mode = self.get_application_exposure()
        context["application_view_mode"] = view_mode
        # Narrower than admin_full: a recruiting-role admin sees everything
        # else in this mode, but this one field is for the admin group's
        # actual leadership only.
        context["include_priority_text"] = (
            view_mode == APPLICATION_VIEW_MODE_ADMIN_FULL
            and user_is_admission_leadership(admission, self.request.user)
        )
        return context

    @action(detail=True, methods=["patch"], url_path="interview-status")
    def interview_status(self, request, *args, **kwargs):
        serializer = InterviewStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            application = self.get_object()
        except Http404:
            raise NotFound() from None
        try:
            updated = update_interview_status(
                application,
                serializer.validated_data["interview_status"],
                serializer.validated_data["expected_interview_status_updated_at"],
                request.user,
            )
        except InterviewStatusConflict:
            return Response(
                {"detail": "Statusen ble endret av noen andre. Last inn på nytt."},
                status=status.HTTP_409_CONFLICT,
            )
        except InterviewStatusNotFound:
            raise NotFound() from None
        response_data = InterviewStatusSerializer(updated).data
        if (
            self.get_application_exposure()[2]
            == APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL
        ):
            response_data.pop("interview_status_updated_by", None)
        return Response(response_data)

    def destroy(self, request, *args, **kwargs):
        admission, representing_groups, view_mode = self.get_application_exposure()

        group_id = request.query_params.get("groupId", None)
        user_is_admin = user_is_admission_admin(admission, self.request.user)
        # An admin group that also competes in this admission is confined to
        # its own committee (see get_application_view_mode), so admin standing
        # alone is not enough to delete a whole application here.
        is_committee_minimal = view_mode == APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL

        # Only admins can delete UserApplication objects
        if group_id is None:
            if user_is_admin and not is_committee_minimal:
                return super().destroy(request, *args, **kwargs)
            else:
                return Response(status=status.HTTP_403_FORBIDDEN)

        try:
            group_id = Group._meta.pk.to_python(group_id)
        except (TypeError, ValueError, ValidationError):
            return Response(
                {"groupId": ["Ugyldig gruppe-ID."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verify that the user is permitted to delete the group application
        if (is_committee_minimal or not user_is_admin) and (
            not representing_groups.filter(pk=group_id).exists()
        ):
            return Response(
                status=status.HTTP_403_FORBIDDEN,
                data="You are not permitted to delete applications for this group",
            )

        # Perform the deletion
        user_application = self.get_object()
        group_application = get_object_or_404(
            GroupApplication,
            application=user_application.pk,
            group=group_id,
        )
        group_application.delete()

        # Delete the UserApplication if all GroupApplications are deleted
        if not GroupApplication.objects.filter(
            application=user_application.pk
        ).exists():
            self.perform_destroy(user_application)

        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminGroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


class TerminateCommitteeApplicationsView(APIView):
    """Permanently remove one committee's applications from one admission."""

    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "application_write"

    def post(self, request, admission_slug, group_id):
        admission = get_object_or_404(Admission, slug=admission_slug)
        group = get_object_or_404(admission.groups, pk=group_id)

        if not user_is_admission_admin(admission, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        # An admin group that also competes here may only terminate its own
        # committee - never a rival's (see get_application_view_mode).
        if (
            get_application_view_mode(admission, request.user)
            == APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL
            and not get_representing_groups(admission, request.user)
            .filter(pk=group.pk)
            .exists()
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)

        confirmation_name = request.data.get("confirmation_name")
        if (
            not isinstance(confirmation_name, str)
            or confirmation_name.lower() != group.name.lower()
        ):
            return Response(
                {
                    "confirmation_name": [
                        "Skriv komiténavnet for å bekrefte slettingen."
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            application_ids = list(
                GroupApplication.objects.select_for_update()
                .filter(application__admission=admission, group=group)
                .values_list("application_id", flat=True)
            )
            list(
                UserApplication.objects.select_for_update().filter(
                    pk__in=application_ids
                )
            )
            GroupApplication.objects.filter(
                application_id__in=application_ids, group=group
            ).delete()

            # A candidate may have applied to several committees. Delete the
            # admission-wide application only after its final committee entry
            # has been removed.
            for application in UserApplication.objects.filter(pk__in=application_ids):
                if not application.group_applications.exists():
                    application.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class AdmissionGroupContentView(APIView):
    """Read or write one committee's admission-scoped info text.

    Committee leaders and recruiters can set the text their applicants see
    without needing the global manage-admissions privilege. The endpoint is
    narrow: it writes only the three AdvisoryGroup content fields, and only
    for the one group named in the URL.
    """

    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, admission_slug, group_id):
        super().initial(request, admission_slug, group_id)
        self.admission = get_object_or_404(Admission, slug=admission_slug)
        self.group = get_object_or_404(self.admission.groups, pk=group_id)
        if not user_is_admission_admin(
            self.admission, request.user
        ) and not user_represents_group(self.admission, self.group, request.user):
            raise NotFound()

    def get(self, request, admission_slug, group_id):
        admission_group = AdmissionGroup.objects.filter(
            admission=self.admission, group=self.group
        ).first()
        return Response(
            {
                "committee_info": (
                    admission_group.committee_info if admission_group else None
                ),
                "application_guidance": (
                    admission_group.application_guidance if admission_group else None
                ),
                "interview_description": (
                    admission_group.interview_description if admission_group else None
                ),
            }
        )

    def patch(self, request, admission_slug, group_id):
        serializer = AdmissionGroupContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        # build the update dict from whichever fields were sent
        update_fields = {}
        for field in (
            "committee_info",
            "application_guidance",
            "interview_description",
        ):
            if field in validated:
                update_fields[field] = validated[field]
        if update_fields:
            AdmissionGroup.objects.update_or_create(
                admission=self.admission,
                group=self.group,
                defaults=update_fields,
            )
        return self.get(request, admission_slug, group_id)


##################################################
################## MANAGE VIEWS ##################
##################################################


class GodUserViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Webkom members manage the org-leadership allowlist (LEGO ids).

    Replaces the hardcoded ``constants.GOD_LEGO_IDS`` constant. Only Webkom
    members can read or modify the list. Anonymous users get 401;
    logged-in non-Webkom users get 403.
    """

    queryset = GodUser.objects.all().order_by("created_at")
    serializer_class = GodUserSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsWebkom]
    lookup_field = "lego_id"
    lookup_value_regex = r"\d+"

    def perform_create(self, serializer):
        god_user = serializer.save(added_by=self.request.user)
        LegoUser.objects.filter(lego_id=god_user.lego_id).update(is_staff=True)

    def perform_destroy(self, instance):
        lego_id = instance.lego_id
        instance.delete()
        user = LegoUser.objects.filter(lego_id=lego_id).first()
        if user:
            # Recompute is_staff: only True if user is Webkom or a leader in STAFF_LEADER_GROUPS
            user.is_staff = user.is_member_of_webkom or any(
                m.group.name in constants.STAFF_LEADER_GROUPS
                and m.role == constants.LEADER
                for m in user.membership_set.select_related("group").all()
            )
            user.save(update_fields=["is_staff"])


class ManageAdmissionViewSet(viewsets.ModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [
        permissions.IsAuthenticated,
        IsWebkom | IsOrgLeadership | (IsStaff & IsCreatorOfObject),
    ]
    http_method_names = ["get", "post", "patch", "delete"]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.request.method == "GET":
            return ManageAdmissionSerializer
        elif self.request.method == "POST" or self.request.method == "PATCH":
            return AdminCreateUpdateAdmissionSerializer

    def get_queryset(self):
        # The organisation's own leadership (god-listed LEGO ids) oversees
        # every admission just like the tool-admin committee does - someone
        # who is not in Webkom must still see (and manage) every opptak, not
        # only the ones they happened to create.
        qs = Admission.objects.all().order_by("title")
        if not (
            self.request.user.is_member_of_webkom
            or user_is_org_leadership(self.request.user)
        ):
            return qs.filter(created_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        admission = self.get_object()
        if admission.closed_from > timezone.now():
            return Response(
                data={"message": "Opptaket kan ikke slettes før det har stengt"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class AdministeredAdmissionListView(generics.ListAPIView):
    """Admissions the current user can read but cannot edit.

    Gated by ``IsActiveAdminGroupMember``: active admission admins and
    participating committee leaders/recruiters reach this endpoint.
    Webkom members and God users have their own manage pane and
    short-circuit to an empty list here.
    """

    serializer_class = AdministeredAdmissionSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, IsActiveAdminGroupMember]

    def get_queryset(self):
        user = self.request.user
        if user.is_member_of_webkom or user_is_org_leadership(user):
            return Admission.objects.none()
        return (
            Admission.objects.filter(
                Q(
                    admin_groups__membership__user=user,
                )
                | Q(
                    groups__membership__user=user,
                    groups__membership__role__in=constants.ADMISSION_ADMIN_ROLES,
                )
            )
            .exclude(
                admin_groups__membership__role__in=constants.INACTIVE_MEMBERSHIP_ROLES
            )
            .distinct()
            .order_by("title")
        )


class ManageGroupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user_is_org_leadership(user) or user.is_member_of_webkom:
            return self.queryset
        return self.queryset.filter(membership__user=user).distinct()
