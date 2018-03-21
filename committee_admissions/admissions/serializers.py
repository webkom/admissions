from rest_framework import serializers
from committee_admissions.admissions.models import Admission, Committee, UserApplication, CommitteeApplication
from django.contrib.auth.models import User


class AdmissionPublicSerializer(serializers.HyperlinkedModelSerializer):

    class Meta:
        model = Admission
        fields = ('is_open', 'open_from', 'public_deadline', 'application_deadline', 'is_closed')


class AdminAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    applications = UserApplication.objects.all()

    class Meta:
        model = Admission
        fields = ('pk', 'title', 'open_from', 'public_deadline', 'application_deadline', 'is_closed', 'is_appliable',
                  'applications', 'is_open')


class CommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = ('pk', 'name', 'description', 'response_label', 'logo')


class CommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CommitteeApplication
        fields = ('pk', 'application', 'committee', 'text')


class UserApplicationSerializer(serializers.HyperlinkedModelSerializer):
    committee_applications = CommitteeApplicationSerializer(many=True)

    class Meta:
        model = UserApplication
        fields = ('pk', 'admission', 'user', 'text', 'time_sent', 'is_editable', 'is_sendable',
                  'applied_within_deadline', 'sent', 'committee_applications')


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ('pk', 'username', 'first_name', 'last_name', 'email', 'is_staff')
