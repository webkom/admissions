from rest_framework import serializers
from django.contrib.auth.models import User


from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication,
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
            'url', 'pk', 'title', 'open_from', 'public_deadline', 'application_deadline',
            'is_closed', 'is_appliable', 'applications', 'is_open'
        )


class CommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = ('url', 'pk', 'name', 'description', 'response_label', 'detail_link')

    def create(self, validated_data):
        committee, created = Committee.objects.update_or_create(
            name=validated_data.get('name', None),
            defaults={'response_label': validated_data.get('response_label', None),
                      'description': validated_data.get('description', None)})

        print("Made it!", committee)
        return committee


class ShortCommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = (
            'pk',
            'name',
        )


class CommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CommitteeApplication
        fields = ('url', 'pk', 'application', 'committee', 'text')


class ShortCommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    committee = ShortCommitteeSerializer()

    class Meta:
        model = CommitteeApplication
        fields = ('committee', 'text')


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = User
        fields = ('username', 'full_name', 'email')


class UserApplicationSerializer(serializers.HyperlinkedModelSerializer):
    committee_applications = ShortCommitteeApplicationSerializer(many=True)
    user = ShortUserSerializer()

    class Meta:
        model = UserApplication
        fields = (
            'url',
            'pk',
            'user',
            'text',
            'time_sent',
            'applied_within_deadline',
            'committee_applications',
        )


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = User
        fields = (
            'url', 'pk', 'username', 'first_name', 'last_name', 'email', 'is_staff', 'abakus_groups'
        )


class ApplicationCreateUpdateSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = UserApplication
        fields = ('text', )

    def create(self, validated_data):
        user = validated_data.pop('user')
        print(user, vars(user))

        text = validated_data.pop('text')

        admission = [obj for obj in Admission.objects.all() if obj.is_open][0]

        user_application, created = UserApplication.objects.update_or_create(
            admission=admission, user=user, defaults={"text": text}
        )
        # The code smell is strong with this one, young padawan
        applications = self.initial_data.pop("applications")

        for committee_name, text in applications.items():
            print(committee_name, text)

            committee = Committee.objects.get(name__iexact=committee_name)
            application, created = CommitteeApplication.objects.update_or_create(
                application=user_application, committee=committee, defaults={"text": text}
            )
            print(application.text, created)

        print(user_application.committee_applications)

        return user_application
