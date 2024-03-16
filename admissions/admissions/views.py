from datetime import datetime

from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Prefetch, Q
from django.http import HttpResponse
from django.utils import timezone
from django.views.generic.base import TemplateView
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.serializers import (
    AdminAdmissionSerializer,
    AdminGroupUpdateSerializer,
    AdminUserApplicationSerializer,
    ManageAdmissionCreateUpdateSerializer,
    PublicAdmissionDetailSerializer,
    PublicAdmissionListSerializer,
    PublicApplicationSerializer,
    PublicGroupSerializer,
)
from admissions.utils.email import send_message

from .authentication import SessionAuthentication
from .permissions import (
    AdmissionPermissions,
    ApplicationPermissions,
    GroupApplicationPermissions,
    GroupPermissions,
    IsCreatorOfObject,
    IsStaff,
    IsWebkom,
)


def user_is_admission_admin(admission, user):
    for group in admission.admin_groups.all():
        if Membership.objects.filter(user=user.pk, group=group.pk).exists():
            return True
    return False


def get_representing_group(admission, user):
    for group in admission.groups.all():
        if (
            Membership.objects.filter(user=user.pk, group=group.pk)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .exists()
        ):
            return group
    return None


class AppView(TemplateView):
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["settings"] = settings
        # :rip:
        # beacuse of proxy model
        if self.request.user.is_authenticated:
            self.request.user.__class__ = LegoUser
        return context


################## PUBLIC VIEWS ##################


class PublicAdmissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Admission.objects.all()
    authentication_classes = [SessionAuthentication]
    permission_classes = [AdmissionPermissions]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return PublicAdmissionDetailSerializer

        return PublicAdmissionListSerializer


class PublicApplicationViewSet(
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PublicApplicationSerializer

    def get_object(self):
        user = self.request.user
        if user.is_anonymous:
            return UserApplication.objects.none()
        user.__class__ = LegoUser
        admission = Admission.objects.get(slug=self.kwargs.get("admission_slug", None))

        return UserApplication.objects.get(admission=admission, user=user)

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            admission_slug=self.kwargs.get("admission_slug", None),
        )

    def notify_recruiters_on_delete(self, instance):
        serializer = self.get_serializer(instance)
        applied_groups = [
            (group.get("group").get("pk"), group.get("group").get("name"))
            for group in serializer.data.get("group_applications")
        ]
        recruiters = {}
        for group_pk, group_name in applied_groups:
            group_recruiters = Membership.objects.filter(
                Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                group=group_pk,
            )
            recruiters[group_name] = [
                recruiter.user.email for recruiter in group_recruiters
            ]

        admission_slug = self.kwargs.get("admission_slug", None)
        admission = Admission.objects.get(slug=admission_slug)
        for group, group_recruiters in recruiters.items():
            send_message(admission, group, group_recruiters)

    def perform_destroy(self, instance):
        self.notify_recruiters_on_delete(instance)
        instance.delete()


################## ADMIN VIEWS ##################


class AdminGroupViewSet(
    mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Group.objects.all()
    serializer_class = AdminGroupUpdateSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


class AdminApplicationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]
    serializer_class = AdminUserApplicationSerializer
    lookup_field = "application_pk"

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ["delete_group_application"]:
            permission_classes = [GroupApplicationPermissions]
        else:
            permission_classes = [permissions.IsAuthenticated, ApplicationPermissions]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        admission_slug = self.kwargs.get("admission_slug", None)
        admission = Admission.objects.get(slug=admission_slug)
        user = self.request.user
        if user.is_anonymous:
            return UserApplication.objects.none()
        user.__class__ = LegoUser
        # Check membership in admin groups
        if user_is_admission_admin(admission, user):
            return (
                super()
                .get_queryset()
                .filter(admission__slug=admission_slug)
                .prefetch_related("group_applications", "group_applications__group")
            )
        # Check membership in admission groups
        representing_group = get_representing_group(admission, user)
        if representing_group is not None:
            qs = GroupApplication.objects.filter(
                group=representing_group
            ).select_related("group")

            return (
                super()
                .get_queryset()
                .filter(
                    group_applications__group=representing_group,
                    admission__slug=admission_slug,
                )
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

    @action(detail=True, methods=["DELETE"], url_path="group/(?P<group_pk>[^/.]+)")
    def delete_group_application(
        self, request, admission_slug, group_pk, application_pk=None
    ):
        try:
            admission_slug = self.kwargs.get("admission_slug", None)
            admission = Admission.objects.get(slug=admission_slug)
            request.user.__class__ = LegoUser

            representing_group = get_representing_group(admission, request.user)
            if user_is_admission_admin(admission, request.user):
                group = Group.objects.get(pk=group_pk)
            elif representing_group is not None:
                group = representing_group
            else:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            GroupApplication.objects.get(
                application=application_pk, group=group
            ).delete()

            if not GroupApplication.objects.filter(application=application_pk).exists():
                # If this is the only application the user had left, we can
                # delete the entire userApplication
                UserApplication.objects.get(pk=application_pk).delete()
            return Response(status=status.HTTP_200_OK)

        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)


################## MANAGE VIEWS ##################


class ManageGroupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Group.objects.all()
    serializer_class = PublicGroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


class ManageAdmissionViewSet(viewsets.ModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [
        permissions.IsAuthenticated,
        IsWebkom | (IsStaff & IsCreatorOfObject),
    ]
    http_method_names = ["get", "post", "patch", "delete"]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.request.method == "GET":
            return AdminAdmissionSerializer
        elif self.request.method == "POST" or self.request.method == "PATCH":
            return ManageAdmissionCreateUpdateSerializer

    def get_queryset(self):
        qs = Admission.objects.all().order_by("open_from")
        if not self.request.user.is_member_of_webkom:
            return qs.filter(created_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        admission = self.get_object()
        if admission.closed_from > timezone.make_aware(datetime.now()):
            return Response(
                data={"message": "Opptaket kan ikke slettes før det har stengt"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
