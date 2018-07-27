from django.contrib.auth.models import User
from django.views.generic.base import TemplateView

from rest_framework import viewsets, permissions

from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication
)
from committee_admissions.admissions.serializers import (
    AdminAdmissionSerializer, AdmissionPublicSerializer, CommitteeApplicationSerializer,
    CommitteeSerializer, UserApplicationSerializer, UserSerializer, ApplicationCreateUpdateSerializer
)

from .permissions import IsOwnerOrReadOnly


class AppView(TemplateView):
    template_name = 'index.html'


class AdmissionViewSet(viewsets.ModelViewSet):
    queryset = Admission.objects.all()
    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        if self.action == 'list':
            user = self.request.user
            if user and user.is_staff:
                return AdminAdmissionSerializer

        return AdmissionPublicSerializer


class CommitteeViewSet(viewsets.ModelViewSet):
    queryset = Committee.objects.all()
    serializer_class = CommitteeSerializer


class UserApplicationViewSet(viewsets.ModelViewSet):
    queryset = UserApplication.objects.all()
    serializer_class = UserApplicationSerializer
    # authentication_classes = []
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]


class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = UserApplication.objects.all()
    serializer_class = ApplicationCreateUpdateSerializer
    # authentication_classes = []
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def get_serializer_class(self):
        if self.action in ('create', 'update'):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CommitteeApplicationViewSet(viewsets.ModelViewSet):
    queryset = CommitteeApplication.objects.all()
    serializer_class = CommitteeApplicationSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
