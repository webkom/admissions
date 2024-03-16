from django.core.validators import MinLengthValidator
from django.db.models import Q
from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.json_models import (
    InputModelList,
    InputResponseModel,
    validators,
)
from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.utils.email import send_message

################## USER SERIALIZERS ##################


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


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


################## PUBLIC SERIALIZERS ##################


class PublicAdmissionListSerializer(serializers.HyperlinkedModelSerializer):
    groups = serializers.PrimaryKeyRelatedField(read_only=True, many=True)
    userdata = serializers.SerializerMethodField()

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
            "userdata",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}

    def get_userdata(self, obj):
        res = {
            "has_application": False,
            "is_privileged": False,
            "is_admin": False,
        }
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            return res
        res["has_application"] = UserApplication.objects.filter(
            user=request.user.pk, admission=obj.pk
        ).exists()
        for group in obj.groups.all():
            if (
                Membership.objects.filter(user=request.user.pk, group=group.pk)
                .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
                .exists()
            ):
                res["is_privileged"] = True
        for group in obj.admin_groups.all():
            if Membership.objects.filter(user=request.user.pk, group=group.pk).exists():
                res["is_privileged"] = True
                res["is_admin"] = True
        return res


class PublicGroupSerializer(serializers.ModelSerializer):
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


class PublicAdmissionDetailSerializer(PublicAdmissionListSerializer):
    groups = PublicGroupSerializer(many=True)

    class Meta(PublicAdmissionListSerializer.Meta):
        fields = PublicAdmissionListSerializer.Meta.fields + (
            "header_fields",
            "groups",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}


class PublicApplicationSerializer(serializers.HyperlinkedModelSerializer):
    question_json_schema = InputModelList
    response_json_schema = InputResponseModel

    class Meta:
        model = UserApplication
        fields = ("text", "pk", "phone_number", "header_fields_response")

    def validate_header_fields_response(self, value):
        try:
            self.response_json_schema(value)
        except Exception as errors:
            raise serializers.ValidationError(errors)

        admission_slug = self.context["request"].parser_context["kwargs"][
            "admission_slug"
        ]
        admission = Admission.objects.get(slug=admission_slug)

        for header_field in admission.header_fields:
            if "id" not in header_field:
                continue
            if header_field["id"] not in value and header_field["required"]:
                serializers.ValidationError("Missing required answer")
            if header_field["type"] in validators:
                for validator in validators[header_field["type"]]:
                    validator().validate(header_field, value[header_field["id"]])
        return value

    def create(self, validated_data):
        user = validated_data.pop("user")
        text = validated_data.pop("text")
        phone_number = validated_data.pop("phone_number")
        header_fields_response = self.response_json_schema(
            validated_data.pop("header_fields_response")
        ).model_dump()

        admission = Admission.objects.get(slug=validated_data.get("admission_slug"))

        user_application, created = UserApplication.objects.update_or_create(
            admission=admission,
            user=user,
            defaults={
                "text": text,
                "phone_number": phone_number,
                "header_fields_response": header_fields_response,
            },
        )

        # The code smell is strong with this one, young padawan
        applications = self.initial_data.pop("applications")
        groups = [
            Group.objects.get(name__iexact=group) for group in applications.keys()
        ]
        removed_applications = GroupApplication.objects.filter(
            application=user_application
        ).exclude(group__in=groups)
        removed_groups = [application.group for application in removed_applications]
        removed_applications.delete()

        for group in removed_groups:
            group_recruiters = Membership.objects.filter(
                Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                group=group.pk,
            )
            recruiters = [recruiter.user.email for recruiter in group_recruiters]
            send_message(admission, group.name, recruiters)

        for group_name, text in applications.items():
            group = Group.objects.get(name__iexact=group_name)
            application, created = GroupApplication.objects.update_or_create(
                application=user_application,
                group=group,
                defaults={"text": text},
            )

        return user_application


################## ADMIN SERIALIZERS ##################


class AdminGroupUpdateSerializer(serializers.ModelSerializer):
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


class AdminGroupListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = (
            "pk",
            "name",
            "logo",
        )


class AdminAdmissionSerializer(serializers.ModelSerializer):
    applications = UserApplication.objects.all()
    admin_groups = AdminGroupListSerializer(many=True)
    groups = AdminGroupListSerializer(many=True)
    userdata = serializers.SerializerMethodField()

    class Meta:
        model = Admission
        fields = (
            "title",
            "slug",
            "description",
            "header_fields",
            "admin_groups",
            "groups",
            "open_from",
            "public_deadline",
            "closed_from",
            "applications",
            "is_open",
            "is_closed",
            "is_appliable",
            "userdata",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}

    def get_userdata(self, obj):
        res = {
            "has_application": False,
            "is_privileged": False,
            "is_admin": False,
        }
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            return res
        res["has_application"] = UserApplication.objects.filter(
            user=request.user.pk, admission=obj.pk
        ).exists()
        for group in obj.groups.all():
            if (
                Membership.objects.filter(user=request.user.pk, group=group.pk)
                .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
                .exists()
            ):
                res["is_privileged"] = True
        for group in obj.admin_groups.all():
            if Membership.objects.filter(user=request.user.pk, group=group.pk).exists():
                res["is_privileged"] = True
                res["is_admin"] = True
        return res


class AdminShortGroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ("pk", "name")


class AdminGroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    group = AdminShortGroupSerializer()

    class Meta:
        model = GroupApplication
        fields = ("group", "text")


class AdminUserApplicationSerializer(serializers.ModelSerializer):
    group_applications = serializers.SerializerMethodField()
    text = serializers.SerializerMethodField()
    header_fields_response = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    def get_text(self, obj):
        # Hide value from non-admission-admins
        is_filtered = getattr(obj, "group_applications_filtered", False)
        if is_filtered:
            return None
        return obj.text

    def get_header_fields_response(self, obj):
        # Hide value from non-admission-admins
        is_filtered = getattr(obj, "group_applications_filtered", False)
        if is_filtered:
            return {}
        return obj.header_fields_response

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return AdminGroupApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "user",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "text",
            "phone_number",
            "header_fields_response",
            "group_applications",
        )


################## MANAGE SERIALIZERS ##################


class ManageAdmissionCreateUpdateSerializer(serializers.HyperlinkedModelSerializer):
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
            "header_fields",
            "open_from",
            "public_deadline",
            "closed_from",
            "admin_groups",
            "groups",
            "created_by",
        )

    def update_or_create(self, pk, validated_data):
        schema = InputModelList
        if pk is None or "header_fields" in validated_data:
            try:
                header_fields = schema(validated_data["header_fields"])
                validated_data["header_fields"] = header_fields.model_dump()
            except Exception as errors:
                raise serializers.ValidationError(errors)

        if pk is None or "admin_groups" in validated_data:
            input_admin_groups = validated_data.pop("admin_groups")
        if pk is None or "groups" in validated_data:
            input_groups = validated_data.pop("groups")
        admission, _ = Admission.objects.update_or_create(
            pk=pk, defaults=validated_data
        )
        if pk is None or "admin_groups" in validated_data:
            admission.admin_groups.set(input_admin_groups)
        if pk is None or "groups" in validated_data:
            admission.groups.set(input_groups)
        return admission

    def create(self, validated_data):
        return self.update_or_create(None, validated_data)

    def update(self, instance, validated_data):
        return self.update_or_create(instance.pk, validated_data)
