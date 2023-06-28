from django.core.validators import MinLengthValidator
from django.db.models import Q
from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    description = serializers.CharField(validators=[MinLengthValidator(30)])

    class Meta:
        model = Group
        fields = (
            "pk",
            "name",
            "description",
            "questions",
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
            "groups",
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


class AdmissionPublicSerializer(AdmissionListPublicSerializer):
    groups = GroupSerializer(many=True)

    class Meta(AdmissionListPublicSerializer.Meta):
        fields = AdmissionListPublicSerializer.Meta.fields + ("groups", "questions")
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
    userdata = serializers.SerializerMethodField()

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


class GroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = GroupApplication
        fields = ("url", "pk", "application", "group", "responses")


class ShortGroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    group = ShortGroupSerializer()

    class Meta:
        model = GroupApplication
        fields = ("group", "responses")


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


class UserApplicationSerializer(serializers.ModelSerializer):
    group_applications = serializers.SerializerMethodField()
    # text = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    # def get_text(self, obj):
    #     is_filtered = getattr(obj, "group_applications_filtered", False)
    #     if is_filtered:
    #         return None
    #     return obj.text

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return ShortGroupApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "user",
            "responses",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "group_applications",
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
    group_applications = serializers.SerializerMethodField()

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return ShortGroupApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = ("pk", "responses", "group_applications")

    def _validate(self, group_name: str, questions: dict, responses: dict) -> None:
        error = self._validate_fields(questions, responses)
        if error is not None:
            if group_name == None:
                raise serializers.ValidationError({"responses": error})
            raise serializers.ValidationError({"groupResponses": {group_name: error}})

    def _validate_fields(self, questions: dict, responses: dict) -> dict:
        # Ensure that the received JSON indata matches the requested questions
        editable_questions = list(filter(lambda x: x["type"] != "text", questions))
        if len(editable_questions) != len(responses):
            return "Alle spørsmål ble ikke sendt"
        for question in editable_questions:
            print(responses)
            print(question)
            response_key = next(
                (key for key in responses.keys() if key == question["id"]), None
            )
            if response_key is None:
                return {question["id"]: "Obligatorisk felt ble ikke sendt"}
            response = responses[response_key]
            if response is None:
                return {question["id"]: "Obligatorisk felt"}

    def create(self, validated_data):
        user = validated_data.pop("user")
        responses = validated_data.pop("responses")

        admission = Admission.objects.get(slug=validated_data.get("admission_slug"))

        self._validate(None, admission.questions, responses)

        user_application, created = UserApplication.objects.update_or_create(
            admission=admission, user=user, responses=responses
        )
        # The code smell is strong with this one, young padawan
        group_applications = self.initial_data.pop("group_applications")

        GroupApplication.objects.filter(application=user_application).delete()

        for group_name, group_responses in group_applications.items():
            group = Group.objects.get(name__iexact=group_name)
            self._validate(group_name, group.questions, group_responses)
            application, created = GroupApplication.objects.update_or_create(
                application=user_application, group=group, responses=group_responses
            )

        return user_application
