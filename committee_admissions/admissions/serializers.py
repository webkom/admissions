from rest_framework import serializers
from committee_admissions.admissions.models import Admission, Committee, UserApplication, CommitteeApplication
from django.contrib.auth.models import User


class AdmissionSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Admission
        fields = ('title', 'open_from', 'public_deadline', 'application_deadline', 'is_closed', 'is_appliable')


class CommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = ('name', 'description', 'response_label', 'logo')


class UserApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = UserApplication
        fields = ('admission', 'user', 'text', 'time_sent', 'is_editable', 'is_sendable', 'applied_within_deadline',
                  'sent', 'has_committee_application')


class CommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CommitteeApplication
        fields = ('application', 'committee', 'text')


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'email', 'is_staff')
