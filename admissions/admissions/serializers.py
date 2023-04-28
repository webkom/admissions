from django.core.validators import MinLengthValidator
from rest_framework import serializers

from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    UserApplication,
)


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    description = serializers.CharField(validators=[MinLengthValidator(30)])
    response_label = serializers.CharField(validators=[MinLengthValidator(30)])

    class Meta:
        model = Group
        fields = (
            "pk",
            "name",
            "description",
            "response_label",
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
            "slug",
            "title",
            "description",
            "is_open",
            "open_from",
            "public_deadline",
            "closed_from",
            "is_closed",
            "is_appliable",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}


class AdmissionPublicSerializer(AdmissionListPublicSerializer):
    groups = GroupSerializer(many=True)

    class Meta(AdmissionListPublicSerializer.Meta):
        fields = AdmissionListPublicSerializer.Meta.fields + ("groups",)
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}


class AdminCreateUpdateAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    def __init__(self, *args, **kwargs):
        """If object is being updated don't allow slug to be changed."""
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields.get("slug").read_only = True

    slug = serializers.SlugField(validators=[MinLengthValidator(4)])
    created_by = serializers.PrimaryKeyRelatedField(
        default=serializers.CurrentUserDefault(), read_only=True
    )
    admin_groups = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Group.objects.all()
    )
    groups = serializers.PrimaryKeyRelatedField(
        many=True, required=True, queryset=Group.objects.all()
    )

    class Meta:
        model = Admission
        fields = (
            "title",
            "slug",
            "description",
            "open_from",
            "public_deadline",
            "closed_from",
            "admin_groups",
            "groups",
            "created_by",
        )

    def update_or_create(self, pk, validated_data):
        input_admin_groups = validated_data.pop("admin_groups")
        input_groups = validated_data.pop("groups")
        admission, created = Admission.objects.update_or_create(
            pk=pk, defaults=validated_data
        )
        admission.admin_groups.set(input_admin_groups)
        admission.groups.set(input_groups)
        return admission

    def create(self, validated_data):
        return self.update_or_create(None, validated_data)

    def update(self, instance, validated_data):
        return self.update_or_create(instance.pk, validated_data)


class AdminAdmissionSerializer(serializers.ModelSerializer):
    applications = UserApplication.objects.all()
    admin_groups = GroupSerializer(many=True)
    groups = GroupSerializer(many=True)

    class Meta:
        model = Admission
        fields = (
            "pk",
            "title",
            "slug",
            "description",
            "admin_groups",
            "groups",
            "open_from",
            "public_deadline",
            "closed_from",
            "applications",
            "is_open",
            "is_closed",
            "is_appliable",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}


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

        admission = Admission.objects.get(slug=validated_data.get("admission_slug"))

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
