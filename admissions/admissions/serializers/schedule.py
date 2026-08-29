"""Schedule serializers covering saved schedules and solver request payloads."""

from collections.abc import Mapping
from datetime import date, datetime, timedelta
from uuid import UUID

from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import (
    InterviewAvailability,
    LegoUser,
    SavedSchedule,
    ScheduleDeviationApproval,
    UserApplication,
)
from admissions.admissions.schedule_policy import (
    AVAILABILITY_FALLBACKS,
    PANEL_STABILITIES,
    POLICY_VERSION,
    SchedulePolicyError,
    build_deviation_review,
    normalize_schedule_policy,
)
from admissions.admissions.schedule_validation import (
    ScheduleValidationError,
    canonicalize_schedule,
)
from admissions.admissions.scheduling_utils import get_eligible_interviewer_ids
from admissions.admissions.serializers.solver import SolveOptionsSerializer


def _entry_calendar_date(start_date, time_value):
    if start_date is None or not isinstance(time_value, int):
        return None
    return start_date + timedelta(days=time_value // (24 * 60))


class SchedulePanelMemberSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    name = serializers.CharField()
    is_overtime = serializers.BooleanField(required=False)
    experience_level = serializers.ChoiceField(
        choices=InterviewAvailability.EXPERIENCE_LEVEL_CHOICES,
        required=False,
    )


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
    block_mode = serializers.ChoiceField(choices=["standard", "manual"], required=False)
    manual_blocks = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        max_length=constants.MAX_SCHEDULE_SLOTS,
    )
    slot_overrides = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        max_length=constants.MAX_SCHEDULE_SLOTS,
    )
    panel_size = serializers.IntegerField(
        min_value=1, max_value=10, required=False, allow_null=True
    )
    solver_options = SolveOptionsSerializer(required=False, allow_null=True)
    deviation_approval_fingerprint = serializers.CharField(
        required=False,
        max_length=64,
        min_length=64,
        write_only=True,
    )
    is_distributed = serializers.BooleanField(required=False)
    distributed_through = serializers.DateField(required=False, allow_null=True)
    # Explicit acknowledgment that candidates without an interview are
    # planned for later (rolling admissions / progressive publishing). The
    # publish is otherwise refused while active candidates are unscheduled
    # and no enabled days remain beyond the boundary. No default: the field
    # must be absent from payloads that do not carry it, or every
    # visibility-only edit would count as a mutable field.
    defer_unplaced_candidates = serializers.BooleanField(
        required=False, write_only=True
    )
    conflict_review_open = serializers.BooleanField(required=False)
    name_visibility = serializers.ChoiceField(
        choices=["hidden", "admin_only", "committee"],
        required=False,
    )
    outreach_templates = serializers.JSONField(required=False)
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
        if (
            attrs.get("is_distributed") or attrs.get("distributed_through")
        ) and attrs.get("conflict_review_open"):
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
    user_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class InterviewerSerializer(CandidateSerializer):
    availability = serializers.ListField(
        child=serializers.IntegerField(), default=list, max_length=5000
    )
    # Defaults to empty so a client that never sends it keeps the previous
    # behaviour exactly: every available time equally preferred.
    discouraged = serializers.ListField(
        child=serializers.IntegerField(), default=list, max_length=5000
    )
    biased = serializers.ListField(
        child=serializers.CharField(), default=list, max_length=500
    )
    experience_level = serializers.ChoiceField(
        choices=InterviewAvailability.EXPERIENCE_LEVEL_CHOICES,
        default=InterviewAvailability.EXPERIENCE_UNKNOWN,
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
    group_id = serializers.UUIDField()
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
    # Optional partial-plan scope: solve only slots on or before this date
    # (within the saved framework) so a plan can be built a few days at a
    # time without touching the enabled-slots grid.
    day_scope_through = serializers.DateField(required=False, allow_null=True)
    synthetic = serializers.BooleanField(required=False, default=False)
    preview_only = serializers.BooleanField(required=False, default=False)

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


class SavedScheduleSerializer(serializers.ModelSerializer):
    manual_blocks = serializers.JSONField(source="resolved_blocks", read_only=True)
    layout_capabilities = serializers.SerializerMethodField()
    deviation_review = serializers.SerializerMethodField()

    def get_layout_capabilities(self, _instance):
        return {
            "version": 2,
            "slot_overrides": True,
            "availability_projection": True,
            "opened_pause_semantics": "separate_block",
        }

    def get_deviation_review(self, instance):
        if not self.context.get("include_deviation_review", False):
            return None
        try:
            policy = normalize_schedule_policy(
                instance.solver_options,
                persisted=True,
            )
        except SchedulePolicyError:
            return {
                "policy": None,
                "deviation_count": 0,
                "deviations": [],
                "deviation_fingerprint": "",
                "requires_approval": False,
                "approved": False,
                "error": "Lagret planleggingspolicy er ugyldig.",
            }
        try:
            canonical_schedule = canonicalize_schedule(
                admission=instance.admission,
                group=instance.group,
                schedule=instance.schedule,
                start_date=instance.start_date,
                enabled_slots=instance.enabled_slots,
                panel_size=instance.panel_size,
                solver_options=instance.solver_options,
                request_user_id=getattr(self.context.get("request"), "user_id", None),
                require_all_candidates=False,
                end_date=instance.end_date,
                session_duration=instance.session_duration,
                day_start_minute=instance.day_start_minute,
                day_end_minute=instance.day_end_minute,
                chunk_size=instance.chunk_size,
                chunk_break_minutes=instance.chunk_break_minutes,
                resolved_blocks=instance.resolved_blocks,
                availability_generation=instance.availability_generation,
                legacy_submission_without_generation=(
                    instance.layout_version == 1 or not instance.resolved_blocks
                ),
            )
        except ScheduleValidationError as exc:
            return {
                "policy": policy.snapshot(),
                "deviation_count": 0,
                "deviations": [],
                "deviation_fingerprint": "",
                "requires_approval": False,
                "approved": False,
                "error": exc.message,
            }
        review = build_deviation_review(
            schedule=canonical_schedule,
            policy=policy,
            availability_generation=instance.availability_generation,
            layout_version=instance.layout_version,
        )
        review["approved"] = ScheduleDeviationApproval.objects.filter(
            deviation_fingerprint=review["deviation_fingerprint"],
            schedule_fingerprint=review["schedule_fingerprint"],
            availability_generation=instance.availability_generation,
            layout_version=instance.layout_version,
        ).exists()
        return review

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
            "block_mode",
            "resolved_blocks",
            "manual_blocks",
            "layout_version",
            "slot_overrides",
            "availability_generation",
            "layout_capabilities",
            "deviation_review",
            "panel_size",
            "solver_options",
            "is_distributed",
            "distributed_through",
            "conflict_review_open",
            "name_visibility",
            "outreach_templates",
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

        raw_schedule = data.get("schedule")
        if not isinstance(raw_schedule, list):
            data["schedule"] = []
            return data

        publication_boundary = self.context.get("publication_boundary")
        if publication_boundary is not None:
            raw_schedule = [
                entry
                for entry in raw_schedule
                if isinstance(entry, Mapping)
                and (
                    entry_date := _entry_calendar_date(
                        instance.start_date, entry.get("time")
                    )
                )
                is not None
                and entry_date <= publication_boundary
            ]

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
        date_time_field = serializers.DateTimeField()
        authorized_candidate_ids = (
            candidate_ids
            if visible_candidate_ids is None
            else candidate_ids & visible_candidate_ids
        )
        candidate_details = {
            str(application.pk): {
                "name": application.user.get_full_name() or application.user.username,
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
            str(user_id)
            for user_id in get_eligible_interviewer_ids(
                instance.admission, instance.group
            )
        }
        panel_names = {
            str(user.pk): user.get_full_name() or user.username
            for user in LegoUser.objects.filter(pk__in=panel_ids & eligible_panel_ids)
        }

        # Placeholder names, so committee members can still see when they are
        # interviewing while identities stay hidden.
        #
        # Numbered over every candidate the committee has, NOT over the rows in
        # this response. candidate_details is scoped to publication_boundary
        # above, so numbering from it renumbered everybody each time an admin
        # published another day: the person a member had written down as
        # "Kandidat 3" silently became Kandidat 6, at the same time, once the
        # pool grew. The label has to name the same person for as long as it is
        # shown. Gaps in the sequence are the acceptable cost, and leak less
        # than a dense 1..N did - that counted the published rows exactly.
        anonymize = hide_candidate_identity
        placeholder_by_id = {}
        if anonymize:
            numbering_pool = (
                visible_candidate_ids
                if visible_candidate_ids is not None
                else set(candidate_details)
            )
            placeholder_by_id = {
                candidate: f"Kandidat {index + 1}"
                for index, candidate in enumerate(sorted(numbering_pool))
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

            safe_entry = dict(item.validated_data)
            safe_entry["candidate_id"] = candidate_id
            candidate_detail = candidate_details[candidate_id]

            if anonymize:
                safe_entry["candidate"] = placeholder_by_id.get(
                    candidate_id, "Kandidat"
                )
                # Strip status info — the candidate has not consented to
                # the committee seeing whether they confirmed.
                safe_entry.pop("candidate_id", None)
            else:
                safe_entry["candidate"] = candidate_detail["name"]
                safe_entry["interview_status"] = candidate_detail["interview_status"]
                # Status metadata (who last changed it, when) is workflow-side
                # information reserved for interview admins. Committee members
                # see the status value but not who/when — a recruiter's identity
                # is not a published-plan field.
                if self.context.get("include_interview_status_metadata", False):
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
