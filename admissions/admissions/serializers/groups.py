"""Group, admission-group content, and group-application serializers.

This module owns the serializer family that describes a Group and how it is
projected for an admission or an application. ``get_admission_group_relation``
is the shared cache used by both ``AdmissionScopedGroupSerializer`` and
``ShortGroupApplicationSerializer``.
"""

from typing import Any, Optional

from django.core.validators import MinLengthValidator
from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    GroupApplication,
)


class GroupSerializer(serializers.HyperlinkedModelSerializer):
    description = serializers.CharField(validators=[MinLengthValidator(30)])
    response_label = serializers.CharField(validators=[MinLengthValidator(30)])
    # Committee / revue / other, so a picker listing every group at once can
    # sort them into the split the person choosing actually thinks in.
    category = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = (
            "pk",
            "name",
            "description",
            "response_label",
            "detail_link",
            "logo",
            "category",
        )
        # name/detail_link/logo mirror the upstream Lego group — keep them
        # read-only so a recruiter can't repoint logo/detail_link at a phishing
        # URL shown to applicants. Only description/response_label are editable.
        read_only_fields = ("name", "detail_link", "logo")

    def get_category(self, obj):
        return constants.group_category(obj.name)

    def create(self, validated_data):
        group, created = Group.objects.update_or_create(
            name=validated_data.get("name", None),
            defaults={
                "description": validated_data.get("description", None),
            },
        )

        return group


def get_admission_group_relation(admission, group_id):
    cache_attribute = "_serialized_admission_groups_by_group_id"
    relations_by_group_id = getattr(admission, cache_attribute, None)
    if relations_by_group_id is None:
        relations_by_group_id = {
            relation.group_id: relation
            for relation in AdmissionGroup.objects.filter(admission=admission)
        }
        setattr(admission, cache_attribute, relations_by_group_id)
    return relations_by_group_id.get(group_id)


class AdmissionScopedGroupSerializer(GroupSerializer):
    """Expose the content configured for this group in this admission."""

    description = serializers.SerializerMethodField()
    response_label = serializers.SerializerMethodField()
    interview_description = serializers.SerializerMethodField()
    header_fields = serializers.SerializerMethodField()

    class Meta(GroupSerializer.Meta):
        fields = GroupSerializer.Meta.fields + (
            "header_fields",
            "interview_description",
        )

    def get_admission_group(self, obj):
        admission = self.root.instance
        if not isinstance(admission, Admission):
            return None
        return get_admission_group_relation(admission, obj.pk)

    def get_description(self, obj):
        admission_group = self.get_admission_group(obj)
        if admission_group is None or admission_group.committee_info is None:
            return obj.description
        return admission_group.committee_info

    def get_response_label(self, obj):
        admission_group = self.get_admission_group(obj)
        if admission_group is None or admission_group.application_guidance is None:
            return obj.response_label
        return admission_group.application_guidance

    def get_interview_description(self, obj):
        admission_group = self.get_admission_group(obj)
        return admission_group.interview_description if admission_group else None

    def get_header_fields(self, obj):
        admission_group = self.get_admission_group(obj)
        return (admission_group.header_fields or []) if admission_group else []


class ManageAdmissionGroupSerializer(AdmissionScopedGroupSerializer):
    committee_info = serializers.SerializerMethodField()
    application_guidance = serializers.SerializerMethodField()

    class Meta(AdmissionScopedGroupSerializer.Meta):
        fields = AdmissionScopedGroupSerializer.Meta.fields + (
            "committee_info",
            "application_guidance",
        )

    def get_committee_info(self, obj):
        admission_group = self.get_admission_group(obj)
        return admission_group.committee_info if admission_group else None

    def get_application_guidance(self, obj):
        admission_group = self.get_admission_group(obj)
        return admission_group.application_guidance if admission_group else None


class ShortGroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ("pk", "name", "logo", "response_label")


class AdmissionGroupContentSerializer(serializers.Serializer):
    committee_info = serializers.CharField(
        allow_blank=True,
        allow_null=True,
        max_length=600,
    )
    application_guidance = serializers.CharField(
        allow_blank=True,
        allow_null=True,
        max_length=600,
    )
    interview_description = serializers.CharField(
        allow_blank=True,
        allow_null=True,
        required=False,
        max_length=600,
    )


class GroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = GroupApplication
        fields = (
            "url",
            "pk",
            "application",
            "group",
            "text",
            "header_fields_response",
        )


class ShortGroupApplicationSerializer(serializers.HyperlinkedModelSerializer):
    group = serializers.SerializerMethodField()

    def get_group(self, obj):
        admission = self.context.get("admission")
        admission_group = (
            get_admission_group_relation(admission, obj.group_id)
            if isinstance(admission, Admission)
            else None
        )
        response_label = (
            admission_group.application_guidance
            if admission_group is not None
            and admission_group.application_guidance is not None
            else obj.group.response_label
        )
        return {
            "pk": str(obj.group_id),
            "name": obj.group.name,
            "logo": obj.group.logo,
            "response_label": response_label,
        }

    class Meta:
        model = GroupApplication
        fields = ("group", "text", "header_fields_response")
