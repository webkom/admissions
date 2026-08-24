"""Admission-level serializers."""

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers

from pydantic import ValidationError as PydanticValidationError

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    APPLICATION_VIEW_MODE_NONE,
    get_application_view_mode,
    revoke_removed_group_disclosures,
    user_is_admission_admin,
)
from admissions.admissions.json_models import InputModelList
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    Membership,
    UserApplication,
)
from admissions.admissions.serializers.groups import (
    AdmissionGroupContentSerializer,
    AdmissionScopedGroupSerializer,
    GroupSerializer,
    ManageAdmissionGroupSerializer,
)


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
            "actor_id": None,
            "has_application": False,
            "is_privileged": False,
            "is_admin": False,
            "is_recruiter": False,
            "committee_role": None,
            "committee_groups": [],
            "committee_group_details": [],
            "represented_groups": [],
            "application_view_mode": APPLICATION_VIEW_MODE_NONE,
        }
        request = self.context.get("request")
        if (
            not request
            or not hasattr(request, "user")
            or not request.user.is_authenticated
        ):
            return res
        res["actor_id"] = str(request.user.pk)
        res["has_application"] = UserApplication.objects.filter(
            user=request.user.pk, admission=obj.pk
        ).exists()
        committee_groups = list(obj.groups.all())
        roles_by_group = {}
        for group_pk, role in (
            Membership.objects.filter(user=request.user.pk, group__in=committee_groups)
            .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
            .values_list("group", "role")
        ):
            roles_by_group.setdefault(group_pk, set()).add(role)

        is_leader = False
        is_recruiting = False
        is_committee_member = False
        for group in committee_groups:
            roles = roles_by_group.get(group.pk)
            if not roles:
                continue
            res["committee_groups"].append(group.name)
            group_role = (
                constants.LEADER
                if constants.LEADER in roles
                else (
                    constants.RECRUITING
                    if constants.RECRUITING in roles
                    else constants.MEMBER
                )
            )
            # Scheduling is committee-scoped, so the frontend needs each
            # group's id (not just its name) to link into that committee's
            # own /schedule/<group_id> route - for every committee role, not
            # just recruiters/leaders, since ordinary members reach their own
            # committee's schedule too. The role travels with it because a
            # person can be a recruiter of one committee and a plain member of
            # another within the same admission - the admission-wide
            # committee_role below can't tell those two apart.
            res["committee_group_details"].append(
                {"pk": str(group.pk), "name": group.name, "role": group_role}
            )
            is_committee_member = True
            if roles.intersection((constants.LEADER, constants.RECRUITING)):
                res["is_privileged"] = True
                res["represented_groups"].append(group.name)
            if constants.LEADER in roles:
                is_leader = True
            if constants.RECRUITING in roles:
                is_recruiting = True

        res["is_recruiter"] = is_leader or is_recruiting
        if is_leader:
            res["committee_role"] = constants.LEADER
        elif is_recruiting:
            res["committee_role"] = constants.RECRUITING
        elif is_committee_member:
            res["committee_role"] = constants.MEMBER

        # Defer to the same check the permission classes use. This repeated
        # the query inline and omitted CO_LEADER, so an admin-group co-leader
        # was served by every admin endpoint while userdata reported them
        # unprivileged - the frontend gates the admin actions on exactly this
        # flag, so they saw neither "Admin panel" nor "Velg intervjutider".
        if user_is_admission_admin(obj, request.user):
            res["is_privileged"] = True
            res["is_admin"] = True
        res["application_view_mode"] = get_application_view_mode(obj, request.user)
        return res


class AdmissionPublicSerializer(AdmissionListPublicSerializer):
    groups = AdmissionScopedGroupSerializer(many=True)

    class Meta(AdmissionListPublicSerializer.Meta):
        fields = AdmissionListPublicSerializer.Meta.fields + ("groups",)
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}


class AdminCreateUpdateAdmissionSerializer(serializers.HyperlinkedModelSerializer):
    legacy_general_fields = ("header_fields",)

    def __init__(self, *args, **kwargs):
        """If object is being updated don't allow slug to be changed."""
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields.get("slug").read_only = True

    created_by = serializers.PrimaryKeyRelatedField(
        default=serializers.CurrentUserDefault(), read_only=True
    )
    admin_groups = serializers.PrimaryKeyRelatedField(
        many=True, required=False, queryset=Group.objects.all()
    )
    groups = serializers.PrimaryKeyRelatedField(
        many=True, required=True, queryset=Group.objects.all()
    )
    group_questions = serializers.DictField(
        child=serializers.ListField(), required=False, write_only=True
    )
    group_content = serializers.DictField(
        child=AdmissionGroupContentSerializer(),
        required=False,
        write_only=True,
    )

    def to_internal_value(self, data):
        legacy_fields = set(data.keys()).intersection(self.legacy_general_fields)
        if legacy_fields:
            raise serializers.ValidationError(
                {
                    field: "Generelle spørsmål støttes ikke. "
                    "Bruk spørsmål for den aktuelle komiteen."
                    for field in legacy_fields
                }
            )
        return super().to_internal_value(data)

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
            "group_questions",
            "group_content",
            "created_by",
        )
        extra_kwargs = {"slug": {"min_length": 4}}

    def validate(self, attrs):
        instance = self.instance
        open_from = attrs.get("open_from", getattr(instance, "open_from", None))
        public_deadline = attrs.get(
            "public_deadline", getattr(instance, "public_deadline", None)
        )
        closed_from = attrs.get("closed_from", getattr(instance, "closed_from", None))

        errors = {}
        if open_from and public_deadline and public_deadline <= open_from:
            errors["public_deadline"] = "Søknadsfristen må være etter åpningen."
        if public_deadline and closed_from and closed_from < public_deadline:
            errors["closed_from"] = "Stengingen kan ikke være før søknadsfristen."

        has_admin_groups = (
            bool(attrs["admin_groups"])
            if "admin_groups" in attrs
            else bool(instance and instance.admin_groups.exists())
        )
        has_groups = (
            bool(attrs["groups"])
            if "groups" in attrs
            else bool(instance and instance.groups.exists())
        )
        if not has_admin_groups:
            errors["admin_groups"] = "Velg minst én admin-gruppe."
        if not has_groups:
            errors["groups"] = "Velg minst én gruppe som har opptak."

        group_questions = attrs.get("group_questions")
        if group_questions is not None:
            configured_groups = attrs.get(
                "groups", instance.groups.all() if instance else []
            )
            configured_group_ids = {str(group.pk) for group in configured_groups}
            unknown_group_ids = set(group_questions) - configured_group_ids
            if unknown_group_ids:
                errors["group_questions"] = "Spørsmål må høre til en valgt gruppe."
            else:
                normalized_questions = {}
                try:
                    for group_id, fields in group_questions.items():
                        normalized_questions[group_id] = InputModelList(
                            fields
                        ).model_dump()
                except PydanticValidationError:
                    errors["group_questions"] = "Spørsmålsoppsettet er ugyldig."
                else:
                    attrs["group_questions"] = normalized_questions

        group_content = attrs.get("group_content")
        if group_content is not None:
            configured_groups = attrs.get(
                "groups", instance.groups.all() if instance else []
            )
            configured_group_ids = {str(group.pk) for group in configured_groups}
            unknown_group_ids = set(group_content) - configured_group_ids
            if unknown_group_ids:
                errors["group_content"] = "Komitéinnhold må høre til en valgt gruppe."
        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    @transaction.atomic
    def update_or_create(self, pk, validated_data):
        input_admin_groups = validated_data.pop("admin_groups", None)
        input_groups = validated_data.pop("groups", None)
        input_group_questions = validated_data.pop("group_questions", None)
        input_group_content = validated_data.pop("group_content", None)
        admission, _ = Admission.objects.update_or_create(
            pk=pk, defaults=validated_data
        )
        if input_admin_groups is not None:
            admission.admin_groups.set(input_admin_groups)
        if input_groups is not None:
            request = self.context.get("request")
            revoke_removed_group_disclosures(
                admission,
                input_groups,
                getattr(request, "user", None),
            )
            admission.groups.set(input_groups)
        if input_group_questions is not None:
            for group_id, fields in input_group_questions.items():
                AdmissionGroup.objects.filter(
                    admission=admission, group_id=group_id
                ).update(header_fields=fields)
        if input_group_content is not None:
            for group_id, content in input_group_content.items():
                update_fields = {
                    "committee_info": content["committee_info"],
                    "application_guidance": content["application_guidance"],
                }
                if "interview_description" in content:
                    update_fields["interview_description"] = content[
                        "interview_description"
                    ]
                AdmissionGroup.objects.filter(
                    admission=admission,
                    group_id=group_id,
                ).update(**update_fields)
        return admission

    def create(self, validated_data):
        return self.update_or_create(None, validated_data)

    def update(self, instance, validated_data):
        return self.update_or_create(instance.pk, validated_data)


class AdminAdmissionSerializer(serializers.ModelSerializer):
    admin_groups = GroupSerializer(many=True)
    groups = AdmissionScopedGroupSerializer(many=True)
    userdata = serializers.SerializerMethodField()

    class Meta:
        model = Admission
        fields = (
            "title",
            "slug",
            "description",
            "admin_groups",
            "groups",
            "open_from",
            "public_deadline",
            "closed_from",
            "is_open",
            "is_closed",
            "is_appliable",
            "userdata",
        )
        lookup_field = "slug"
        extra_kwargs = {"url": {"lookup_field": "slug"}}

    def get_userdata(self, obj):
        res = {
            "actor_id": None,
            "has_application": False,
            "is_privileged": False,
            "is_admin": False,
            "application_view_mode": APPLICATION_VIEW_MODE_NONE,
        }
        request = self.context.get("request")
        if (
            not request
            or not hasattr(request, "user")
            or not request.user.is_authenticated
        ):
            return res
        res["actor_id"] = str(request.user.pk)
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
        # Same shared check as the public serializer, and for the same reason:
        # this loop omitted CO_LEADER, so an admin-group co-leader was served
        # by this very endpoint while being told they were not an admin.
        if user_is_admission_admin(obj, request.user):
            res["is_privileged"] = True
            res["is_admin"] = True
        res["application_view_mode"] = get_application_view_mode(obj, request.user)
        return res


class ManageAdmissionSerializer(AdminAdmissionSerializer):
    groups = ManageAdmissionGroupSerializer(many=True)
