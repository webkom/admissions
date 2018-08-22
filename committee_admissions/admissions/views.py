from django.conf import settings
from django.contrib.auth.models import User
from django.db.models import Prefetch
from django.http import Http404
from django.views.generic.base import TemplateView
from rest_framework import permissions, viewsets
from rest_framework.decorators import list_route
from rest_framework.response import Response

from committee_admissions.admissions import constants
from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, LegoUser, UserApplication
)
from committee_admissions.admissions.serializers import (
    AdminAdmissionSerializer, AdmissionPublicSerializer, ApplicationCreateUpdateSerializer,
    CommitteeSerializer, UserApplicationSerializer
)

from .authentication import SessionAuthentication
from .permissions import AdmissionPermissions, ApplicationPermissions, CommitteePermissions


class AppView(TemplateView):
    template_name = 'index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['settings'] = settings
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
        if self.action == 'list':
            user = self.request.user
            if user and user.is_staff:
                return AdminAdmissionSerializer

        return AdmissionPublicSerializer


class CommitteeViewSet(viewsets.ModelViewSet):
    queryset = Committee.objects.all()
    serializer_class = CommitteeSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, CommitteePermissions]


class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]

    def get_permissions(self):
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ['mine', 'create']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated, ApplicationPermissions]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        if user.is_anonymous:
            return User.objects.none()
        user.__class__ = LegoUser
        if not user.is_board_member:
            return User.objects.none()
        if user.is_superuser:
            return super().get_queryset().prefetch_related(
                'committee_applications', 'committee_applications__committee'
            )

        committee = user.leader_of_committee
        qs = CommitteeApplication.objects.filter(committee=committee).select_related('committee')

        return super().get_queryset().filter(committee_applications__committee=committee
                                             ).prefetch_related(
                                                 Prefetch(
                                                     'committee_applications', queryset=qs,
                                                     to_attr='committee_applications_filtered'
                                                 )
                                             )

    def get_serializer_class(self):
        if self.action in ('create'):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @list_route(methods=['GET'])
    def mine(self, request):
        try:
            instance = UserApplication.objects.get(user=request.user)
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
        except UserApplication.DoesNotExist:
            raise Http404
