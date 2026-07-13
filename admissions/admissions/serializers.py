import json
from datetime import date, datetime

from django.core.validators import MinLengthValidator
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from structlog import get_logger

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
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
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
            "is_recruiter": False,
            "committee_role": None,
            "committee_groups": [],
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
            if constants.LEADER in roles:
                is_leader = True
                res["is_privileged"] = True
            if constants.RECRUITING in roles:
                is_recruiting = True
                res["is_privileged"] = True

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
            .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
            .exists()
        ):
            res["is_privileged"] = True
            res["is_admin"] = True
        return res


class AdmissionPublicSerializer(AdmissionListPublicSerializer):
    groups = GroupSerializer(many=True)

    class Meta(AdmissionListPublicSerializer.Meta):
        fields = AdmissionListPublicSerializer.Meta.fields + (
            "header_fields",
            "groups",
        )
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
        try:
            header_fields = schema(validated_data["header_fields"])
            validated_data["header_fields"] = header_fields.model_dump()
        except Exception as errors:
            raise serializers.ValidationError(errors)

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
    admin_groups = GroupSerializer(many=True)
    groups = GroupSerializer(many=True)
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
    header_fields_response = serializers.SerializerMethodField()
    user = ShortUserSerializer()

    def get_text(self, obj):
        # Hide value from non-admission-admins
        is_filtered = hasattr(obj, "group_applications_filtered")
        if is_filtered:
            return None
        return obj.text

    def get_header_fields_response(self, obj):
        # Hide value from non-admission-admins
        is_filtered = hasattr(obj, "group_applications_filtered")
        if is_filtered:
            return {}
        return obj.header_fields_response

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
            "text",
            "phone_number",
            "header_fields_response",
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
    question_json_schema = InputModelList
    response_json_schema = InputResponseModel
    applications = serializers.DictField(
        child=serializers.CharField(allow_blank=True, max_length=10000),
        allow_empty=False,
        write_only=True,
    )
    text = serializers.CharField(allow_blank=True, max_length=10000)

    class Meta:
        model = UserApplication
        fields = (
            "text",
            "pk",
            "phone_number",
            "header_fields_response",
            "applications",
        )

    def validate_header_fields_response(self, value):
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 100000:
            raise serializers.ValidationError("Svarene er for store.")
        try:
            self.response_json_schema(value)
        except Exception as errors:
            raise serializers.ValidationError(errors)

        admission_slug = self.context["request"].parser_context["kwargs"][
            "admission_slug"
        ]
        admission = Admission.objects.get(slug=admission_slug)

        for header_field in admission.header_fields or []:
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
            if header_field["type"] in validators:
                for validator in validators[header_field["type"]]:
                    validator().validate(header_field, value[field_id])
        return value

    def create(self, validated_data):
        user = validated_data.pop("user")
        text = validated_data.pop("text")
        phone_number = validated_data.pop("phone_number")
        header_fields_response = self.response_json_schema(
            validated_data.pop("header_fields_response")
        ).model_dump()

        admission_slug = validated_data.pop("admission_slug")
        applications = validated_data.pop("applications")
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
                    "text": text,
                    "phone_number": phone_number,
                    "header_fields_response": header_fields_response,
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
                    defaults={"text": group_text},
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
            "name_visibility",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        effective_name_visibility = self.context.get("effective_name_visibility")
        if effective_name_visibility is not None:
            data["name_visibility"] = effective_name_visibility
        if self.context.get("hide_schedule"):
            data["schedule"] = []
            return data
        hide_candidate_identity = self.context.get("hide_candidate_identity")
        visible_candidate_ids = self.context.get("visible_candidate_ids")
        if hide_candidate_identity or visible_candidate_ids is not None:
            redacted = []
            for entry in data.get("schedule") or []:
                candidate_id = entry.get("candidate_id")
                can_see_candidate = (
                    not hide_candidate_identity
                    and candidate_id is not None
                    and str(candidate_id) in visible_candidate_ids
                )
                if can_see_candidate:
                    redacted.append(entry)
                    continue
                sanitized = {
                    key: entry[key] for key in ("time", "locked") if key in entry
                }
                sanitized["panel"] = [
                    {
                        key: member[key]
                        for key in ("id", "name", "is_overtime")
                        if key in member
                    }
                    for member in entry.get("panel", [])
                    if isinstance(member, dict)
                ]
                sanitized["candidate"] = ""
                redacted.append(sanitized)
            data["schedule"] = redacted
        return data


class SolveJobSerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="id", read_only=True)

    class Meta:
        model = SolveJob
        fields = ("job_id", "status", "result", "error", "created_at", "finished_at")
        read_only_fields = fields


class SolveOptionsSerializer(serializers.Serializer):
    enforce_same_gender = serializers.BooleanField(default=False)
    allow_overtime = serializers.BooleanField(default=True)
    prioritize_continuity = serializers.BooleanField(default=True)
    same_panel_per_block = serializers.BooleanField(default=True)
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
    name_visibility = serializers.ChoiceField(
        choices=["hidden", "admin_only", "committee"],
        required=False,
    )
    expected_updated_at = serializers.DateTimeField(required=False)

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

    def validate(self, attrs):
        for field in ("slots", "conflicts"):
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
    has_submitted = serializers.BooleanField()
    is_me = serializers.BooleanField()
