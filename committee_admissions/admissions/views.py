from rest_framework import viewsets
from committee_admissions.admissions.models import Admission, Committee, UserApplication, CommitteeApplication
from committee_admissions.admissions.serializers import (AdmissionSerializer, CommitteeSerializer,
                                                         UserApplicationSerializer, CommitteeApplicationSerializer)


class AdmissionViewSet(viewsets.ModelViewSet):
    queryset = Admission.objects.all()
    serializer_class = AdmissionSerializer


class CommitteeViewSet(viewsets.ModelViewSet):
    queryset = Committee.objects.all()
    serializer_class = AdmissionSerializer


class UserApplicationViewSet(viewsets.ModelViewSet):
    queryset = UserApplication.objects.all()
    serializer_class = AdmissionSerializer


class CommitteeApplicationViewSet(viewsets.ModelViewSet):
    queryset = CommitteeApplication.objects.all()
    serializer_class = AdmissionSerializer
