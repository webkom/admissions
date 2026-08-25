"""Application, user, interview-status, and committee-candidate serializers.

``send_message`` is imported at module level so it remains reachable via
``admissions.admissions.serializers.send_message`` for tests that patch the
fully-qualified path.
"""

import json
from collections.abc import Mapping

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    APPLICATION_VIEW_MODE_ADMIN_FULL,
    APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
)
from admissions.admissions.json_models import (
    DataType,
    InputModelList,
    InputResponseModel,
    validators,
)
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.serializers.groups import ShortGroupApplicationSerializer
from admissions.utils.email import MESSAGE_KIND_WITHDRAWN, send_message

log = get_logger()


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


class UserApplicationSerializer(serializers.ModelSerializer):
    group_applications = serializers.SerializerMethodField()
    priority_text = serializers.CharField(source="text", read_only=True)
    user = ShortUserSerializer()

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return ShortGroupApplicationSerializer(
            qs,
            many=True,
            context={**self.context, "admission": obj.admission},
        ).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_owner = bool(
            request
            and request.user.is_authenticated
            and request.user.pk == instance.user_id
        )
        if not is_owner and not self.context.get("include_priority_text", False):
            data.pop("priority_text", None)
        return data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "user",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "phone_number",
            "priority_text",
            "group_applications",
        )


class AdminUserApplicationSerializer(UserApplicationSerializer):
    application_view_mode = serializers.SerializerMethodField()
    interview_status_updated_by = serializers.CharField(
        source="interview_status_updated_by_username",
        allow_blank=True,
        read_only=True,
    )

    def get_application_view_mode(self, _obj):
        return self.context.get(
            "application_view_mode",
            APPLICATION_VIEW_MODE_ADMIN_FULL,
        )

    class Meta(UserApplicationSerializer.Meta):
        fields = UserApplicationSerializer.Meta.fields + (
            "application_view_mode",
            "interview_status",
            "interview_status_updated_at",
            "interview_status_updated_by",
        )
        read_only_fields = fields


class CommitteeCandidateSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("full_name",)


class CommitteeMinimalApplicationSerializer(serializers.ModelSerializer):
    application_view_mode = serializers.SerializerMethodField()
    group_applications = serializers.SerializerMethodField()
    user = CommitteeCandidateSerializer()

    def get_application_view_mode(self, _obj):
        return APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", [])
        return ShortGroupApplicationSerializer(
            qs,
            many=True,
            context={**self.context, "admission": obj.admission},
        ).data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "application_view_mode",
            "user",
            "created_at",
            "applied_within_deadline",
            "phone_number",
            "group_applications",
            "interview_status",
            "interview_status_updated_at",
        )
        read_only_fields = fields


class InterviewStatusUpdateSerializer(serializers.Serializer):
    interview_status = serializers.ChoiceField(
        choices=UserApplication.INTERVIEW_STATUS_CHOICES
    )
    expected_interview_status_updated_at = serializers.DateTimeField()

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown_fields = set(data) - set(self.fields)
            if unknown_fields:
                raise serializers.ValidationError(
                    {
                        field: ["Dette feltet kan ikke endres her."]
                        for field in sorted(unknown_fields)
                    }
                )
        return super().to_internal_value(data)


class InterviewStatusSerializer(serializers.ModelSerializer):
    interview_status_updated_by = serializers.CharField(
        source="interview_status_updated_by_username",
        allow_blank=True,
        read_only=True,
    )

    class Meta:
        model = UserApplication
        fields = (
            "interview_status",
            "interview_status_updated_at",
            "interview_status_updated_by",
        )


class ApplicationCreateUpdateSerializer(serializers.HyperlinkedModelSerializer):
    legacy_general_fields = ("text", "header_fields_response")
    question_json_schema = InputModelList
    response_json_schema = InputResponseModel
    applications = serializers.DictField(
        child=serializers.CharField(allow_blank=True, max_length=10000),
        allow_empty=False,
        write_only=True,
    )
    group_answers = serializers.DictField(
        child=serializers.JSONField(), required=False, default=dict, write_only=True
    )
    priority_text = serializers.CharField(
        source="text",
        required=False,
        allow_blank=True,
        max_length=5000,
        write_only=True,
    )

    def to_internal_value(self, data):
        legacy_fields = set(data.keys()).intersection(self.legacy_general_fields)
        if legacy_fields:
            raise serializers.ValidationError(
                {
                    field: "Generelle søknadssvar støttes ikke. "
                    "Bruk svaret for den aktuelle komiteen."
                    for field in legacy_fields
                }
            )
        return super().to_internal_value(data)

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "phone_number",
            "priority_text",
            "applications",
            "group_answers",
        )

    def validate_field_responses(self, fields, value):
        for header_field in fields or []:
            if "id" not in header_field:
                continue
            field_id = header_field["id"]
            if field_id not in value:
                if header_field.get("required"):
                    raise serializers.ValidationError(
                        f"Missing required answer for "
                        f"'{header_field.get('title', field_id)}'"
                    )
                continue

            if header_field.get("type") == DataType.CHECKBOX and not isinstance(
                value[field_id], bool
            ):
                raise serializers.ValidationError("Checkbox svar må være boolsk.")

            if header_field.get("required"):
                response = value[field_id]
                if header_field["type"] == DataType.CHECKBOX and response is not True:
                    raise serializers.ValidationError(
                        f"Missing required answer for "
                        f"'{header_field.get('title', field_id)}'"
                    )
                if isinstance(response, str) and response.strip() == "":
                    raise serializers.ValidationError(
                        f"Missing required answer for "
                        f"'{header_field.get('title', field_id)}'"
                    )

            if header_field["type"] in validators:
                for validator in validators[header_field["type"]]:
                    validator().validate(header_field, value[field_id])

    def validate_group_answers(self, value):
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 100000:
            raise serializers.ValidationError("Svarene er for store.")
        try:
            for answers in value.values():
                self.response_json_schema(answers)
        except Exception as errors:
            raise serializers.ValidationError(errors)
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        admission_slug = self.context["request"].parser_context["kwargs"][
            "admission_slug"
        ]
        admission = Admission.objects.get(slug=admission_slug)
        applications = attrs["applications"]
        group_answers = attrs.get("group_answers", {})
        answers_by_group = {
            name.lower(): answers for name, answers in group_answers.items()
        }
        selected_group_names = {name.lower() for name in applications}

        if set(answers_by_group) - selected_group_names:
            raise serializers.ValidationError(
                {"group_answers": "Svar må høre til en valgt gruppe."}
            )

        question_fields_by_group = {
            admission_group.group.name.lower(): admission_group.header_fields or []
            for admission_group in AdmissionGroup.objects.select_related(
                "group"
            ).filter(admission=admission)
        }
        for group_name in applications:
            try:
                self.validate_field_responses(
                    question_fields_by_group.get(group_name.lower(), []),
                    answers_by_group.get(group_name.lower(), {}),
                )
            except serializers.ValidationError as error:
                raise serializers.ValidationError({"group_answers": error.detail})
        attrs["group_answers"] = answers_by_group
        return attrs

    def create(self, validated_data):
        user = validated_data.pop("user")
        phone_number = validated_data.pop("phone_number")
        priority_text = validated_data.pop("text", "")

        admission_slug = validated_data.pop("admission_slug")
        applications = validated_data.pop("applications")
        group_answers = validated_data.pop("group_answers", {})
        with transaction.atomic():
            admission = Admission.objects.select_for_update().get(
                slug=admission_slug,
                closed_from__gte=timezone.now(),
                open_from__lte=timezone.now(),
            )
            admission_groups = {
                group.name.lower(): group for group in admission.groups.all()
            }
            resolved_groups = {}
            for group_name in applications:
                group = admission_groups.get(group_name.lower())
                if group is None:
                    raise serializers.ValidationError(
                        {
                            "applications": f"'{group_name}' is not a group in this admission."
                        }
                    )
                resolved_groups[group_name] = group

            user_application, _ = UserApplication.objects.update_or_create(
                admission=admission,
                user=user,
                defaults={
                    "phone_number": phone_number,
                    "text": priority_text,
                },
            )

            kept_groups = list(resolved_groups.values())
            removed_applications = GroupApplication.objects.filter(
                application=user_application
            ).exclude(group__in=kept_groups)
            removed_groups = [application.group for application in removed_applications]
            removed_applications.delete()

            for group_name, group_text in applications.items():
                GroupApplication.objects.update_or_create(
                    application=user_application,
                    group=resolved_groups[group_name],
                    defaults={
                        "text": group_text,
                        "header_fields_response": group_answers.get(
                            group_name.lower(), {}
                        ),
                    },
                )

            # Notify recruiters of groups the applicant withdrew from, but
            # only once the removal has actually committed - queued here
            # instead of after the `with` block so a later rollback (e.g. an
            # outer transaction added around this call in the future) can't
            # leave a recruiter told about a withdrawal that never happened.
            # Best effort: a mail outage must never roll back or 500 the
            # application write.
            for group in removed_groups:
                # Distinct addresses, not rows - see the same query in
                # views.py: a leader who is also the recruiter has two
                # membership rows and must still be mailed once.
                recruiters = list(
                    Membership.objects.filter(
                        Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                        group=group.pk,
                    )
                    .values_list("user__email", flat=True)
                    .distinct()
                )

                def notify(group=group, recruiters=recruiters):
                    try:
                        # A partial untick, not a full withdrawal:
                        # `applications` is allow_empty=False, so the
                        # applicant provably still has an active application
                        # elsewhere in this admission.
                        send_message(
                            admission.title,
                            group.name,
                            recruiters,
                            kind=MESSAGE_KIND_WITHDRAWN,
                        )
                    except Exception:
                        log.exception(
                            "withdrawal_notification_failed", group=group.name
                        )

                transaction.on_commit(notify)

        return user_application
