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
    AdminCreateUpdateAdmissionSerializer,
    AdmissionListPublicSerializer,
    AdmissionPublicSerializer,
    ApplicationCreateUpdateSerializer,
    GroupSerializer,
    UserApplicationSerializer,
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


class AdmissionViewSet(viewsets.ModelViewSet):
    queryset = Admission.objects.all()
    authentication_classes = [SessionAuthentication]
    permission_classes = [AdmissionPermissions]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "list":
            user = self.request.user
            if user and user.is_staff:
                return AdminAdmissionSerializer
        elif self.action == "retrieve":
            return AdmissionPublicSerializer

        return AdmissionListPublicSerializer


class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


##################################################
################## PUBLIC VIEWS ##################
##################################################


class PublicApplicationViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = UserApplication.objects.none()
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ("create"):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        admission_slug = self.kwargs.get("admission_slug", None)
        serializer.save(user=self.request.user, admission_slug=admission_slug)

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
                instance.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)


#################################################
################## ADMIN VIEWS ##################
#################################################


class AdminApplicationViewSet(
    mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]
    serializer_class = UserApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ["delete_group_application"]:
            self.permission_classes.append(GroupApplicationPermissions)
        else:
            self.permission_classes.append(ApplicationPermissions)
        return super(AdminApplicationViewSet, self).get_permissions()

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

    def destroy(self, request, *args, **kwargs):
        admission_slug = self.kwargs.get("admission_slug", None)
        admission = Admission.objects.get(slug=admission_slug)
        self.request.user.__class__ = LegoUser

        group_id = request.query_params.get("groupId", None)
        user_is_admin = user_is_admission_admin(admission, self.request.user)

        # Only admins can delete UserApplication objects
        if group_id is None:
            if user_is_admin:
                return super().destroy(request, *args, **kwargs)
            else:
                return Response(status=status.HTTP_400_BAD_REQUEST)

        # Verify that the user is permitted to delete the group application
        representing_group = get_representing_group(admission, self.request.user)
        if not user_is_admin and (
            representing_group is None or str(representing_group.pk) != group_id
        ):
            return Response(
                status=status.HTTP_403_FORBIDDEN,
                data="You are not permitted to delete applications for this group",
            )

        # Perform the deletion
        user_application = self.get_object()
        GroupApplication.objects.get(
            application=user_application.pk, group=group_id
        ).delete()

        # Delete the UserApplication if all GroupApplications are deleted
        if not GroupApplication.objects.filter(
            application=user_application.pk
        ).exists():
            self.perform_destroy(user_application)

        return Response(status=status.HTTP_204_NO_CONTENT)


##################################################
################## MANAGE VIEWS ##################
##################################################


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
            return AdminCreateUpdateAdmissionSerializer

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
