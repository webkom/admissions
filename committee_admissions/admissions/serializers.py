from django.utils import timezone
from rest_framework import serializers

from committee_admissions.admissions.models import (
    Admission,
    Committee,
    CommitteeApplication,
    LegoUser,
    UserApplication,
)


class AdmissionPublicSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Admission
        fields = (
            "is_open",
            "open_from",
            "public_deadline",
            "application_deadline",
            "is_closed",
        )


class AdminAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    applications = UserApplication.objects.all()

    class Meta:
        model = Admission
        fields = (
            "url",
            "pk",
            "title",
            "open_from",
            "public_deadline",
            "application_deadline",
            "is_closed",
            "is_appliable",
            "applications",
            "is_open",
        )


class CommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = (
            "url",
            "pk",
            "name",
            "description",
            "response_label",
            "detail_link",
            "logo",
        )

    def create(self, validated_data):
        committee, created = Committee.objects.update_or_create(
            name=validated_data.get("name", None),
            defaults={
                "response_label": validated_data.get("response_label", None),
                "description": validated_data.get("description", None),
            },
        )

        return committee


class ShortCommitteeSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Committee
        fields = ("pk", "name")


class CommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = CommitteeApplication
        fields = ("url", "pk", "application", "committee", "text")


class ShortCommitteeApplicationSerializer(serializers.HyperlinkedModelSerializer):
    committee = ShortCommitteeSerializer()

    class Meta:
        model = CommitteeApplication
        fields = ("committee", "text")


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


class UserApplicationSerializer(serializers.ModelSerializer):
    committee_applications = serializers.SerializerMethodField()
    text = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    def get_text(self, obj):
        is_filtered = getattr(obj, "committee_applications_filtered", False)
        if is_filtered:
            return None
        return obj.text

    def get_committee_applications(self, obj):
        qs = getattr(obj, "committee_applications_filtered", obj.committee_applications)
        return ShortCommitteeApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = (
            "url",
            "pk",
            "user",
            "text",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "committee_applications",
            "phone_number",
        )


class UserSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = LegoUser
        fields = (
            "url",
            "pk",
            "username",
            "first_name",
            "last_name",
            "email",
            "is_staff",
        )


class ApplicationCreateUpdateSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = UserApplication
        fields = ("text", "pk", "phone_number")

    def create(self, validated_data):
        user = validated_data.pop("user")
        text = validated_data.pop("text")
        phone_number = validated_data.pop("phone_number")

        admission = [obj for obj in Admission.objects.all() if obj.is_open][0]

        user_application, created = UserApplication.objects.update_or_create(
            admission=admission,
            user=user,
            defaults={"text": text, "phone_number": phone_number},
        )
        # The code smell is strong with this one, young padawan
        applications = self.initial_data.pop("applications")

        CommitteeApplication.objects.filter(application=user_application).delete()

        for committee_name, text in applications.items():

            committee = Committee.objects.get(name__iexact=committee_name)
            application, created = CommitteeApplication.objects.update_or_create(
                application=user_application,
                committee=committee,
                defaults={"text": text},
            )

        return user_application
