from django.contrib.auth.models import User
from django.views.generic.base import TemplateView
from django.contrib.auth.mixins import LoginRequiredMixin

from rest_framework import viewsets, permissions

from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication
)
from committee_admissions.admissions.serializers import (
    AdminAdmissionSerializer, AdmissionPublicSerializer, CommitteeApplicationSerializer,
    CommitteeSerializer, UserApplicationSerializer, UserSerializer, ApplicationCreateUpdateSerializer
)

from .permissions import IsOwnerOrReadOnly
from django.http import JsonResponse
from rest_framework.generics import get_object_or_404


class AppView(TemplateView):
    template_name = 'index.html'


def user_has_applied(request, user_application_id, committee_id):
    user_application = get_object_or_404(UserApplication, id=user_application_id)
    committee = get_object_or_404(Committee, id=committee_id)

    query = user_application.has_committee_application(committee)

    return JsonResponse({'has_committee_application': query.exists()})


class AdmissionViewSet(viewsets.ModelViewSet):
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
        print(self.request.user)
        serializer.save(user=self.request.user)


class CommitteeApplicationViewSet(viewsets.ModelViewSet):
    queryset = CommitteeApplication.objects.all()
    serializer_class = CommitteeApplicationSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
