from django.contrib.auth.models import User
from rest_framework import serializers
from django.utils import timezone

from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication
)


class AdmissionPublicSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Admission
        fields = ('is_open', 'open_from', 'public_deadline', 'application_deadline', 'is_closed')


class AdminAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    applications = UserApplication.objects.all()

    class Meta:
        model = Admission
        fields = (
            'url', 'pk', 'title', 'open_from', 'public_deadline', 'application_deadline', 'is_closed',
            'is_appliable', 'applications', 'is_open'
        )


class CommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = ('url', 'pk', 'name', 'description', 'response_label', 'logo')


class CommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CommitteeApplication
        fields = ('url', 'pk', 'application', 'committee', 'text')


class UserApplicationSerializer(serializers.HyperlinkedModelSerializer):
    committee_applications = CommitteeApplicationSerializer(many=True)

    class Meta:
        model = UserApplication
        fields = (
            'url', 'pk', 'admission', 'user', 'text', 'time_sent', 'is_editable', 'is_sendable',
            'applied_within_deadline', 'sent', 'committee_applications'
        )


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = ('url', 'pk', 'username', 'first_name', 'last_name', 'email', 'is_staff')


class ApplicationCreateUpdateSerializer(serializers.HyperlinkedModelSerializer):

    class Meta:
        model = UserApplication
        fields = (
            'text',
        )

    def create(self, validated_data):
        user = validated_data.pop('user')
        print(user, vars(user))

        priority_text = validated_data.pop('text')

        admission = [obj for obj in Admission.objects.all() if obj.is_open][0]

        user_application, created = UserApplication.objects.update_or_create(admission=admission,
                                                                             user=user,
                                                                             defaults={"text": priority_text})
        # Hohohoho, makan til spagetti kode! Lukter krasj i lang vei nå vettu, null validation, security flaws delux <3
        # What can I say, works for now
        applications = self.initial_data.pop("applications")

        # Så, lag committee applications
        for committee_name, text in applications.items():
            print(committee_name, text)

            committee = Committee.objects.get(name__iexact=committee_name)
            application, created = CommitteeApplication.objects.update_or_create(application=user_application, committee=committee,
                                                          defaults={"text": text})
            print(application.text, created)

        print(user_application.committee_applications)

        return user_application

