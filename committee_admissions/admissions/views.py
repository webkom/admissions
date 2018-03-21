from rest_framework import viewsets
from committee_admissions.admissions.models import Admission, Committee, UserApplication, CommitteeApplication
from committee_admissions.admissions.serializers import (
    AdmissionPublicSerializer, AdminAdmissionSerializer, CommitteeSerializer, UserSerializer,
    UserApplicationSerializer, CommitteeApplicationSerializer
)
from django.contrib.auth.models import User


class AdmissionViewSet(viewsets.ModelViewSet):
    queryset = Admission.objects.all()

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


class CommitteeApplicationViewSet(viewsets.ModelViewSet):
    queryset = CommitteeApplication.objects.all()
    serializer_class = CommitteeApplicationSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
