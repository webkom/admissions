from django.utils import timezone
from rest_framework import serializers

from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    UserApplication,
)


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = (
            "pk",
            "name",
            "description",
            "detail_link",
            "logo",
        )

    def create(self, validated_data):
        group, created = Group.objects.update_or_create(
            name=validated_data.get("name", None),
            defaults={
                "description": validated_data.get("description", None),
            },
        )

        return group


class ShortGroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ("pk", "name")


class AdmissionListPublicSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Admission
        fields = (
            "pk",
            "title",
            "description",
            "is_open",
            "open_from",
            "public_deadline",
            "closed_from",
            "is_closed",
            "is_appliable",
        )


class AdmissionPublicSerializer(AdmissionListPublicSerializer):
    groups = GroupSerializer(many=True)

    class Meta(AdmissionListPublicSerializer.Meta):
        fields = AdmissionListPublicSerializer.Meta.fields + ("groups",)


class AdminCreateUpdateAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    groups = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.all())
    created_by = serializers.PrimaryKeyRelatedField(
        default=serializers.CurrentUserDefault(), read_only=True
    )

    class Meta:
        model = Admission
        fields = (
            "title",
            "description",
            "open_from",
            "public_deadline",
            "closed_from",
            "groups",
            "created_by",
        )

    def update_or_create(self, pk, validated_data):
        input_groups = validated_data.pop("groups")
        admission, created = Admission.objects.update_or_create(
            pk=pk, defaults=validated_data
        )
        admission.groups.set(input_groups)
        return admission

    def create(self, validated_data):
        return self.update_or_create(None, validated_data)

    def update(self, instance, validated_data):
        return self.update_or_create(instance.pk, validated_data)


class AdminAdmissionSerializer(serializers.ModelSerializer):
    applications = UserApplication.objects.all()
    groups = GroupSerializer(many=True)

    class Meta:
        model = Admission
        fields = (
            "pk",
            "title",
            "description",
            "groups",
            "open_from",
            "public_deadline",
            "closed_from",
            "applications",
            "is_open",
            "is_closed",
            "is_appliable",
        )


class GroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = GroupApplication
        fields = ("url", "pk", "application", "group", "text")


class ShortGroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    group = ShortGroupSerializer()

    class Meta:
        model = GroupApplication
        fields = ("group", "text")


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


class UserApplicationSerializer(serializers.ModelSerializer):
    group_applications = serializers.SerializerMethodField()
    text = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    def get_text(self, obj):
        is_filtered = getattr(obj, "group_applications_filtered", False)
        if is_filtered:
            return None
        return obj.text

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return ShortGroupApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "user",
            "text",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "group_applications",
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

        admission = Admission.objects.get(pk=validated_data.get("admission_id"))

        user_application, created = UserApplication.objects.update_or_create(
            admission=admission,
            user=user,
            defaults={"text": text, "phone_number": phone_number},
        )
        # The code smell is strong with this one, young padawan
        applications = self.initial_data.pop("applications")

        GroupApplication.objects.filter(application=user_application).delete()

        for group_name, text in applications.items():
            group = Group.objects.get(name__iexact=group_name)
            application, created = GroupApplication.objects.update_or_create(
                application=user_application,
                group=group,
                defaults={"text": text},
            )

        return user_application
