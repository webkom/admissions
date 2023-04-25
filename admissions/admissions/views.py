from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Prefetch
from django.http import HttpResponse
from django.views.generic.base import TemplateView
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from admissions.utils.email import send_message
from admissions.admissions import constants
from django.db.models import Q

from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    UserApplication,
    Membership
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


class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ["mine", "create"]:
            permission_classes = [permissions.IsAuthenticated]
        elif self.action in ["delete_group_application"]:
            permission_classes = [GroupApplicationPermissions]
        else:
            permission_classes = [permissions.IsAuthenticated, ApplicationPermissions]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        admission_id = self.kwargs.get("admission_pk", None)
        user = self.request.user
        if user.is_anonymous:
            return User.objects.none()
        user.__class__ = LegoUser
        if not user.is_privileged:
            return User.objects.none()
        if user.is_superuser:
            return (
                super()
                .get_queryset()
                .filter(admission=admission_id)
                .prefetch_related("group_applications", "group_applications__group")
            )

        group = user.representative_of_group
        qs = GroupApplication.objects.filter(group=group).select_related("group")

        return (
            super()
            .get_queryset()
            .filter(group_applications__group=group, admission=admission_id)
            .prefetch_related(
                Prefetch(
                    "group_applications",
                    queryset=qs,
                    to_attr="group_applications_filtered",
                )
            )
        )

    def get_serializer_class(self):
        if self.action in ("create"):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        admission_id = self.kwargs.get("admission_pk", None)
        serializer.save(user=self.request.user, admission_id=admission_id)

    @action(detail=True, methods=["DELETE"], url_name="delete_group_application")
    def delete_group_application(self, request, admission_pk, pk=None):
        try:
            self.request.user.__class__ = LegoUser
            group = None
            if request.user.is_superuser:
                group_name = request.query_params.get("group", None)
                group = Group.objects.get(name=group_name)
            else:
                group = request.user.representative_of_group
            if group is None:
                return Response(status=status.HTTP_400_BAD_REQUEST)

            GroupApplication.objects.get(application=pk, group=group).delete()

            if not GroupApplication.objects.filter(application=pk).exists():
                # If this is the only application the user had left, we can
                # delete the entire userApplication
                UserApplication.objects.get(pk=pk).delete()

            return Response(status=status.HTTP_200_OK)

        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)

    @action(detail=False, methods=["GET", "DELETE"])
    def mine(self, request, admission_pk):
        try:
            if request.method == "GET":
                instance = UserApplication.objects.get(
                    user=request.user, admission=admission_pk
                )
                serializer = self.get_serializer(instance)
                return Response(serializer.data)
            elif request.method == "DELETE":
                instance = UserApplication.objects.get(
                    user=request.user, admission=admission_pk
                )
                serializer = self.get_serializer(instance)
                groups = [group.get("group").get("pk") for group in serializer.data.get("group_applications")]
                recruiters = Membership.objects.all().filter(Q(role=constants.RECRUITING), group__in=groups)
                admission = Admission.objects.get(pk = admission_pk).title
                send_message(admission, recruiters)
                print(instance[0])
                instance.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)


class AdminAdmissionViewSet(viewsets.ModelViewSet):
    queryset = Admission.objects.all().order_by("open_from")
    authentication_classes = [SessionAuthentication]
    permission_classes = [
        permissions.IsAuthenticated,
        IsWebkom | (IsStaff & IsCreatorOfObject),
    ]
    http_method_names = ["get", "post", "patch"]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return AdminAdmissionSerializer
        elif self.request.method == "POST" or self.request.method == "PATCH":
            return AdminCreateUpdateAdmissionSerializer

    def get_queryset(self):
        if self.request.user.is_member_of_webkom:
            return self.queryset
        return self.queryset.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
