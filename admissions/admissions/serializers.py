import json
from collections.abc import Mapping
from datetime import date, datetime
from uuid import UUID

from django.core.validators import MinLengthValidator
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from pydantic import ValidationError as PydanticValidationError
from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    synchronize_admission_group_disclosures,
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
    InterviewAvailability,
    LegoUser,
    Membership,
    NameVisibilityAuditEvent,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.scheduling_utils import get_eligible_interviewer_ids
from admissions.utils.email import send_message

log = get_logger()


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
        # name/detail_link/logo mirror the upstream Lego group — keep them
        # read-only so a recruiter can't repoint logo/detail_link at a phishing
        # URL shown to applicants. Only description/response_label are editable.
        read_only_fields = ("name", "detail_link", "logo")

    def create(self, validated_data):
        group, created = Group.objects.update_or_create(
            name=validated_data.get("name", None),
            defaults={
                "description": validated_data.get("description", None),
            },
        )

        return group


class AdmissionScopedGroupSerializer(GroupSerializer):
    """Expose question fields configured for this group in this admission."""

    header_fields = serializers.SerializerMethodField()

    class Meta(GroupSerializer.Meta):
        fields = GroupSerializer.Meta.fields + ("header_fields",)

    def get_header_fields(self, obj):
        admission = self.root.instance
        if not isinstance(admission, Admission):
            return []
        return (
            AdmissionGroup.objects.filter(admission=admission, group=obj)
            .values_list("header_fields", flat=True)
            .first()
            or []
        )


class ShortGroupSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Group
        fields = ("pk", "name", "logo", "response_label")


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
            "is_recruiter": False,
            "committee_role": None,
            "committee_groups": [],
            "represented_groups": [],
        }
        request = self.context.get("request")
        if not request or not hasattr(request, "user"):
            return res
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

        if (
            Membership.objects.filter(
                user=request.user.pk, group__in=obj.admin_groups.all()
            )
            .filter(role__in=(constants.LEADER, constants.RECRUITING))
            .exists()
        ):
            res["is_privileged"] = True
            res["is_admin"] = True
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
        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    @transaction.atomic
    def update_or_create(self, pk, validated_data):
        input_admin_groups = validated_data.pop("admin_groups", None)
        input_groups = validated_data.pop("groups", None)
        input_group_questions = validated_data.pop("group_questions", None)
        admission, _ = Admission.objects.update_or_create(
            pk=pk, defaults=validated_data
        )
        if input_admin_groups is not None:
            admission.admin_groups.set(input_admin_groups)
        if input_groups is not None:
            synchronize_admission_group_disclosures(
                admission,
                input_groups,
                self.context["request"].user,
            )
            admission.groups.set(input_groups)
        if input_group_questions is not None:
            for group_id, fields in input_group_questions.items():
                AdmissionGroup.objects.filter(
                    admission=admission, group_id=group_id
                ).update(header_fields=fields)
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
            if (
                Membership.objects.filter(user=request.user.pk, group=group.pk)
                .filter(role__in=(constants.LEADER, constants.RECRUITING))
                .exists()
            ):
                res["is_privileged"] = True
                res["is_admin"] = True
        return res


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
    group = ShortGroupSerializer()

    class Meta:
        model = GroupApplication
        fields = ("group", "text", "header_fields_response")


class ShortUserSerializer(serializers.HyperlinkedModelSerializer):
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name()

    class Meta:
        model = LegoUser
        fields = ("username", "full_name", "email")


class UserApplicationSerializer(serializers.ModelSerializer):
    group_applications = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    def get_group_applications(self, obj):
        qs = getattr(obj, "group_applications_filtered", obj.group_applications)
        return ShortGroupApplicationSerializer(qs, many=True).data

    class Meta:
        model = UserApplication
        fields = (
            "pk",
            "user",
            "created_at",
            "updated_at",
            "applied_within_deadline",
            "phone_number",
            "group_applications",
        )


class AdminUserApplicationSerializer(UserApplicationSerializer):
    interview_status_updated_by = serializers.CharField(
        source="interview_status_updated_by_username",
        allow_blank=True,
        read_only=True,
    )

    class Meta(UserApplicationSerializer.Meta):
        fields = UserApplicationSerializer.Meta.fields + (
            "interview_status",
            "interview_status_updated_at",
            "interview_status_updated_by",
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

        # Notify recruiters of groups the applicant withdrew from. Best effort:
        # a mail outage must never roll back or 500 the application write.
        for group in removed_groups:
            group_recruiters = Membership.objects.filter(
                Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                group=group.pk,
            )
            recruiters = [recruiter.user.email for recruiter in group_recruiters]
            try:
                send_message(admission.title, group.name, recruiters)
            except Exception:
                log.exception("withdrawal_notification_failed", group=group.name)

        return user_application


class SavedScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSchedule
        fields = [
            "id",
            "schedule",
            "start_date",
            "end_date",
            "session_duration",
            "enabled_windows",
            "enabled_slots",
            "day_start_minute",
            "day_end_minute",
            "chunk_size",
            "chunk_break_minutes",
            "panel_size",
            "solver_options",
            "is_distributed",
            "conflict_review_open",
            "name_visibility",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        effective_name_visibility = self.context.get("effective_name_visibility")
        if effective_name_visibility is not None:
            data["name_visibility"] = effective_name_visibility
        revealed_group_summaries = self.context.get("revealed_group_summaries")
        if revealed_group_summaries is not None:
            data["revealed_groups"] = revealed_group_summaries
        if self.context.get("hide_schedule"):
            data["schedule"] = []
            return data
        hide_candidate_identity = self.context.get("hide_candidate_identity")
        visible_candidate_ids = self.context.get("visible_candidate_ids")
        if hide_candidate_identity:
            data["schedule"] = []
            return data

        raw_schedule = data.get("schedule")
        if not isinstance(raw_schedule, list):
            data["schedule"] = []
            return data

        def canonical_uuid(value):
            try:
                return str(UUID(str(value)))
            except (AttributeError, TypeError, ValueError):
                return None

        candidate_ids = {
            candidate_id
            for entry in raw_schedule
            if isinstance(entry, Mapping)
            for candidate_id in [canonical_uuid(entry.get("candidate_id"))]
            if candidate_id is not None
        }
        panel_ids = {
            panel_id
            for entry in raw_schedule
            if isinstance(entry, Mapping) and isinstance(entry.get("panel"), list)
            for member in entry["panel"]
            if isinstance(member, Mapping)
            for panel_id in [canonical_uuid(member.get("id"))]
            if panel_id is not None
        }
        contact_candidate_ids = self.context.get("contact_candidate_ids", set())
        candidate_pseudonyms = self.context.get("candidate_pseudonyms", {})
        date_time_field = serializers.DateTimeField()
        authorized_candidate_ids = (
            candidate_ids
            if visible_candidate_ids is None
            else candidate_ids & visible_candidate_ids
        )
        candidate_details = {
            str(application.pk): {
                "name": candidate_pseudonyms.get(
                    str(application.pk),
                    application.user.get_full_name() or application.user.username,
                ),
                "phone": (
                    application.phone_number
                    if contact_candidate_ids is None
                    or str(application.pk) in contact_candidate_ids
                    else None
                ),
                "interview_status": application.interview_status,
                "interview_status_updated_at": date_time_field.to_representation(
                    application.interview_status_updated_at
                ),
                "interview_status_updated_by": (
                    application.interview_status_updated_by_username
                ),
            }
            for application in UserApplication.objects.filter(
                admission=instance.admission,
                pk__in=authorized_candidate_ids,
            ).select_related("user")
        }
        eligible_panel_ids = {
            str(user_id) for user_id in get_eligible_interviewer_ids(instance.admission)
        }
        panel_names = {
            str(user.pk): user.get_full_name() or user.username
            for user in LegoUser.objects.filter(pk__in=panel_ids & eligible_panel_ids)
        }

        visible_schedule = []
        for entry in raw_schedule:
            if not isinstance(entry, Mapping):
                continue
            item = ScheduleItemSerializer(data=entry)
            if not item.is_valid():
                continue
            candidate_id = canonical_uuid(item.validated_data.get("candidate_id"))
            if candidate_id not in candidate_details:
                continue
            if (
                visible_candidate_ids is not None
                and candidate_id not in visible_candidate_ids
            ):
                continue

            safe_entry = dict(item.validated_data)
            safe_entry["candidate_id"] = candidate_id
            candidate_detail = candidate_details[candidate_id]
            safe_entry["candidate"] = candidate_detail["name"]
            safe_entry["interview_status"] = candidate_detail["interview_status"]
            safe_entry["interview_status_updated_at"] = candidate_detail[
                "interview_status_updated_at"
            ]
            safe_entry["interview_status_updated_by"] = candidate_detail[
                "interview_status_updated_by"
            ]
            if candidate_detail["phone"]:
                safe_entry["candidate_phone"] = candidate_detail["phone"]
            safe_panel = []
            for member in safe_entry["panel"]:
                panel_id = canonical_uuid(member.get("id"))
                if panel_id not in panel_names:
                    continue
                safe_member = {"id": panel_id, "name": panel_names[panel_id]}
                if "is_overtime" in member:
                    safe_member["is_overtime"] = member["is_overtime"]
                safe_panel.append(safe_member)
            safe_entry["panel"] = safe_panel
            visible_schedule.append(safe_entry)
        data["schedule"] = visible_schedule
        return data


class NameVisibilityAuditEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NameVisibilityAuditEvent
        fields = (
            "id",
            "group",
            "group_name",
            "actor",
            "actor_username",
            "action",
            "created_at",
        )
        read_only_fields = fields


class SolveJobSerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="id", read_only=True)

    class Meta:
        model = SolveJob
        fields = (
            "job_id",
            "status",
            "result",
            "error",
            "created_at",
            "started_at",
            "finished_at",
        )
        read_only_fields = fields


class SolveOptionsSerializer(serializers.Serializer):
    enforce_same_gender = serializers.BooleanField(default=False)
    allow_overtime = serializers.BooleanField(default=True)
    prioritize_continuity = serializers.BooleanField(default=True)
    same_panel_per_block = serializers.BooleanField(default=True)
    avoid_consecutive_interviewer_blocks = serializers.BooleanField(default=True)
    initial_strategy = serializers.ChoiceField(
        choices=["balanced", "minimize_overtime", "balance_workload"],
        required=False,
    )
    repair_strategy = serializers.ChoiceField(
        choices=["minimum_change", "preserve_panels", "balanced"],
        required=False,
    )
    repair_mode = serializers.BooleanField(default=False)
    overtime_weight = serializers.IntegerField(
        min_value=0, max_value=10000, default=100
    )
    load_balance_weight = serializers.IntegerField(
        min_value=0, max_value=10000, default=1
    )
    continuity_weight = serializers.IntegerField(
        min_value=0, max_value=10000, default=12
    )
    max_solver_seconds = serializers.FloatField(
        min_value=1.0,
        max_value=constants.MAX_SOLVER_SECONDS,
        default=constants.MAX_SOLVER_SECONDS,
    )


class SchedulePanelMemberSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    name = serializers.CharField()
    is_overtime = serializers.BooleanField(required=False)


class ScheduleItemSerializer(serializers.Serializer):
    candidate = serializers.CharField(allow_blank=True)
    candidate_id = serializers.CharField(required=False, allow_null=True)
    time = serializers.IntegerField(min_value=0)
    panel = SchedulePanelMemberSerializer(many=True, max_length=20)
    locked = serializers.BooleanField(required=False)
    booking_source = serializers.ChoiceField(
        choices=["solver", "manual"], required=False
    )


class SaveScheduleInputSerializer(serializers.Serializer):
    schedule = ScheduleItemSerializer(many=True, required=False, max_length=2000)
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False, allow_null=True)
    session_duration = serializers.IntegerField(
        min_value=5, max_value=240, required=False
    )
    enabled_slots = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        max_length=constants.MAX_SCHEDULE_SLOTS,
    )
    enabled_windows = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        max_length=constants.MAX_SCHEDULE_WINDOWS,
    )
    day_start_minute = serializers.IntegerField(
        min_value=0, max_value=1439, required=False
    )
    day_end_minute = serializers.IntegerField(
        min_value=1, max_value=1440, required=False
    )
    chunk_size = serializers.IntegerField(min_value=1, max_value=20, required=False)
    chunk_break_minutes = serializers.IntegerField(
        min_value=0, max_value=240, required=False
    )
    panel_size = serializers.IntegerField(
        min_value=1, max_value=10, required=False, allow_null=True
    )
    solver_options = SolveOptionsSerializer(required=False, allow_null=True)
    is_distributed = serializers.BooleanField(required=False)
    conflict_review_open = serializers.BooleanField(required=False)
    name_visibility = serializers.ChoiceField(
        choices=["hidden", "admin_only", "committee"],
        required=False,
    )
    expected_updated_at = serializers.DateTimeField(required=True, allow_null=True)

    def validate_enabled_windows(self, windows):
        for window in windows:
            window_date = window.get("date")
            if not isinstance(window_date, date):
                try:
                    datetime.strptime(str(window_date), "%Y-%m-%d")
                except ValueError:
                    raise serializers.ValidationError(
                        [f"Ugyldig dato i tidsvindu: {window_date}"]
                    )
            try:
                start_minute = int(
                    window.get("start_minute", window.get("startMinute"))
                )
                end_minute = int(window.get("end_minute", window.get("endMinute")))
            except (TypeError, ValueError):
                raise serializers.ValidationError(
                    ["Tidsvinduets minutter må være heltall."]
                )
            if not 0 <= start_minute < end_minute <= 24 * 60:
                raise serializers.ValidationError(
                    ["Tidsvinduet må slutte etter starten og ligge innenfor døgnet."]
                )
        return windows

    def validate(self, attrs):
        if attrs.get("is_distributed") and attrs.get("conflict_review_open"):
            raise serializers.ValidationError(
                {
                    "conflict_review_open": [
                        "Inhabilitetssjekken må fullføres før planen publiseres."
                    ]
                }
            )

        start_date = attrs.get("start_date")
        end_date = attrs.get("end_date")
        if start_date is not None and end_date is not None and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": ["Sluttdato kan ikke være før startdato."]}
            )

        day_start_minute = attrs.get("day_start_minute")
        day_end_minute = attrs.get("day_end_minute")
        if (
            day_start_minute is not None
            and day_end_minute is not None
            and day_end_minute <= day_start_minute
        ):
            raise serializers.ValidationError(
                {"day_end_minute": ["Slutten på dagen må være etter starten."]}
            )

        return attrs


class CandidateSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField(required=False, allow_blank=True, default="")
    gender = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class InterviewerSerializer(CandidateSerializer):
    availability = serializers.ListField(
        child=serializers.IntegerField(), default=list, max_length=5000
    )
    biased = serializers.ListField(
        child=serializers.CharField(), default=list, max_length=500
    )


class LockedPanelMemberSerializer(serializers.Serializer):
    id = serializers.CharField(required=False)
    name = serializers.CharField(required=False)


class LockedAssignmentSerializer(serializers.Serializer):
    candidate_id = serializers.CharField(required=False)
    candidate = serializers.CharField(required=False)
    time = serializers.IntegerField(min_value=0)
    panel = LockedPanelMemberSerializer(many=True, max_length=10)


class ScheduleRequestsSerializer(serializers.Serializer):
    admission_slug = serializers.SlugField()
    baseline_updated_at = serializers.DateTimeField(required=False)
    candidates = CandidateSerializer(many=True, max_length=500)
    interviewers = InterviewerSerializer(many=True, max_length=200)
    panel_size = serializers.IntegerField(min_value=1, max_value=10, default=4)
    all_slots = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=200000),
        required=False,
        max_length=5000,
    )
    blocks = serializers.ListField(
        child=serializers.ListField(
            child=serializers.IntegerField(min_value=0, max_value=200000),
            max_length=100,
        ),
        required=False,
        max_length=constants.MAX_SCHEDULE_SLOTS,
    )
    options = SolveOptionsSerializer(required=False)
    locked_assignments = LockedAssignmentSerializer(
        many=True, required=False, max_length=500
    )
    synthetic = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        for field in ("candidates", "interviewers"):
            ids = [item["id"] for item in attrs.get(field, [])]
            if len(ids) != len(set(ids)):
                raise serializers.ValidationError(
                    {field: ["Identifikatorene må være unike."]}
                )

        all_slots = attrs.get("all_slots")
        if all_slots is not None and len(all_slots) != len(set(all_slots)):
            raise serializers.ValidationError(
                {"all_slots": ["Tidslukene må være unike."]}
            )

        allowed_slots = set(all_slots) if all_slots is not None else None
        seen_block_slots = set()
        membership_count = 0
        for block in attrs.get("blocks", []):
            block_slots = set(block)
            if len(block) != len(block_slots):
                raise serializers.ValidationError(
                    {"blocks": ["En blokk kan ikke gjenta en tidsluke."]}
                )
            if seen_block_slots.intersection(block_slots):
                raise serializers.ValidationError(
                    {"blocks": ["Tidsluker kan ikke finnes i flere blokker."]}
                )
            if allowed_slots is not None and not block_slots.issubset(allowed_slots):
                raise serializers.ValidationError(
                    {"blocks": ["Blokker kan bare inneholde åpne tidsluker."]}
                )
            seen_block_slots.update(block_slots)
            membership_count += len(block)

        if membership_count > constants.MAX_SOLVER_BLOCK_MEMBERSHIPS:
            raise serializers.ValidationError(
                {"blocks": ["Tidsblokkene er for store."]}
            )

        candidate_ids = {item["id"] for item in attrs.get("candidates", [])}
        interviewer_ids = {item["id"] for item in attrs.get("interviewers", [])}
        seen_candidates = set()
        seen_times = set()
        panel_size = attrs.get("panel_size", 4)
        for assignment in attrs.get("locked_assignments", []):
            candidate_id = assignment.get("candidate_id")
            if candidate_id not in candidate_ids or candidate_id in seen_candidates:
                raise serializers.ValidationError(
                    {
                        "locked_assignments": [
                            "Låste kandidater må være unike og aktive."
                        ]
                    }
                )
            if assignment["time"] in seen_times or (
                allowed_slots is not None and assignment["time"] not in allowed_slots
            ):
                raise serializers.ValidationError(
                    {"locked_assignments": ["Låste tidspunkt må være unike og åpne."]}
                )
            panel_ids = [member.get("id") for member in assignment.get("panel", [])]
            if (
                len(panel_ids) != panel_size
                or None in panel_ids
                or len(panel_ids) != len(set(panel_ids))
                or not set(panel_ids).issubset(interviewer_ids)
            ):
                raise serializers.ValidationError(
                    {
                        "locked_assignments": [
                            "Låste paneler må ha unike, aktive intervjuere."
                        ]
                    }
                )
            seen_candidates.add(candidate_id)
            seen_times.add(assignment["time"])

        return attrs


class SaveInterviewAvailabilitySerializer(serializers.Serializer):
    slots = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        max_length=constants.MAX_SCHEDULE_SLOTS,
    )
    conflicts = serializers.ListField(
        child=serializers.CharField(), required=False, max_length=500
    )
    reviewed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), required=False, max_length=500
    )

    def validate(self, attrs):
        for field in ("slots", "conflicts", "reviewed_candidate_ids"):
            values = attrs.get(field)
            if values is not None and len(values) != len(set(values)):
                raise serializers.ValidationError({field: ["Verdiene må være unike."]})
        return attrs


class InterviewAvailabilityParticipantSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    gender = serializers.CharField(required=False, allow_blank=True, default="")
    slots = serializers.ListField(child=serializers.CharField(), default=list)
    conflicts = serializers.ListField(child=serializers.CharField(), default=list)
    reviewed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    proposed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    conflict_review_complete = serializers.BooleanField(default=False)
    has_submitted = serializers.BooleanField()
    is_me = serializers.BooleanField()
