from django.conf import settings
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.models import User
from django.views.generic.base import TemplateView
from rest_framework import permissions, viewsets

from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication
)
from committee_admissions.admissions.serializers import (
    AdminAdmissionSerializer, AdmissionPublicSerializer, ApplicationCreateUpdateSerializer,
    CommitteeApplicationSerializer, CommitteeSerializer, UserApplicationSerializer, UserSerializer
)


class AppView(TemplateView):
    template_name = 'index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['settings'] = settings
        return context


class AdmissionViewSet(LoginRequiredMixin, viewsets.ModelViewSet):
    queryset = Admission.objects.all()
    permission_classes = [permissions.AllowAny]

    def get_serializer_class(self):
        if self.action == 'list':
            user = self.request.user
            if user and user.is_staff:
                return AdminAdmissionSerializer

        return AdmissionPublicSerializer


class CommitteeViewSet(LoginRequiredMixin, viewsets.ModelViewSet):
    queryset = Committee.objects.all()
    serializer_class = CommitteeSerializer


class ApplicationViewSet(LoginRequiredMixin, viewsets.ModelViewSet):
    queryset = UserApplication.objects.all()
    serializer_class = ApplicationCreateUpdateSerializer
    # authentication_classes = []
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        if self.action in ('create', 'update'):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        print(self.request.user)
        serializer.save(user=self.request.user)


class CommitteeApplicationViewSet(LoginRequiredMixin, viewsets.ModelViewSet):
    queryset = CommitteeApplication.objects.all()
    serializer_class = CommitteeApplicationSerializer


class UserViewSet(LoginRequiredMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
