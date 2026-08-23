"""Solve-job and solver-options serializers."""

from datetime import timedelta

from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import SavedSchedule, SolveJob
from admissions.admissions.schedule_policy import (
    AVAILABILITY_FALLBACKS,
    PANEL_STABILITIES,
    POLICY_VERSION,
    SchedulePolicyError,
    build_deviation_review,
    normalize_schedule_policy,
)


class SolveJobSerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="id", read_only=True)
    proposal_expires_at = serializers.SerializerMethodField()
    baseline_updated_at = serializers.SerializerMethodField()
    auto_apply_if_empty = serializers.SerializerMethodField()
    preview_only = serializers.SerializerMethodField()

    def get_proposal_expires_at(self, obj):
        if obj.finished_at is None or obj.applied_at or obj.discarded_at:
            return None
        return obj.finished_at + timedelta(days=constants.SOLVE_PROPOSAL_RETENTION_DAYS)

    def get_baseline_updated_at(self, obj):
        return (obj.request_data or {}).get("baseline_updated_at")

    def get_auto_apply_if_empty(self, obj):
        return bool((obj.request_data or {}).get("auto_apply_if_empty"))

    def get_preview_only(self, obj):
        return bool((obj.request_data or {}).get("preview_only"))

    class Meta:
        model = SolveJob
        fields = (
            "job_id",
            "status",
            "request_fingerprint",
            "result",
            "error",
            "created_at",
            "started_at",
            "finished_at",
            "applied_at",
            "discarded_at",
            "proposal_expires_at",
            "baseline_updated_at",
            "auto_apply_if_empty",
            "preview_only",
        )
        read_only_fields = fields


class ApplySolveJobSerializer(serializers.Serializer):
    expected_updated_at = serializers.DateTimeField()


class SolveOptionsSerializer(serializers.Serializer):
    enforce_same_gender = serializers.BooleanField(default=False)
    require_experienced_panel = serializers.BooleanField(default=False)
    allow_overtime = serializers.BooleanField(required=False)
    prioritize_continuity = serializers.BooleanField(default=True)
    same_panel_per_block = serializers.BooleanField(required=False)
    avoid_consecutive_interviewer_blocks = serializers.BooleanField(default=True)
    policy_version = serializers.IntegerField(required=False)
    panel_stability = serializers.ChoiceField(
        choices=PANEL_STABILITIES,
        required=False,
    )
    availability_fallback = serializers.ChoiceField(
        choices=AVAILABILITY_FALLBACKS,
        required=False,
    )
    initial_strategy = serializers.ChoiceField(
        choices=[
            "balanced",
            "compact_days",
            "minimize_overtime",
            "balance_workload",
        ],
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
        default=constants.DEFAULT_SOLVER_SECONDS,
    )

    def validate(self, attrs):
        # Nested serializers do not expose ``initial_data`` themselves. These
        # policy fields have no defaults, so membership in ``attrs`` preserves
        # whether the client supplied each compatibility shadow.
        supplied_fields = set(attrs)
        parent_input = getattr(self.parent, "initial_data", {})
        direct_input = getattr(self, "initial_data", {})
        submitted_options = (
            parent_input.get(self.field_name, {})
            if isinstance(parent_input, dict) and self.field_name in parent_input
            else direct_input
        )
        if not isinstance(submitted_options, dict):
            submitted_options = {}
        strategy_defaults = {
            "minimize_overtime": (100, 1, 0, False),
            "balanced": (40, 4, 1, True),
            "compact_days": (40, 2, 48, True),
            "balance_workload": (12, 10, 0, False),
        }
        strategy = attrs.get("initial_strategy")
        if strategy in strategy_defaults and not any(
            field in submitted_options
            for field in (
                "overtime_weight",
                "load_balance_weight",
                "continuity_weight",
                "prioritize_continuity",
            )
        ):
            overtime, load, continuity, prioritize = strategy_defaults[strategy]
            attrs.update(
                overtime_weight=overtime,
                load_balance_weight=load,
                continuity_weight=continuity,
                prioritize_continuity=prioritize,
            )
        version = attrs.get("policy_version")
        has_v2_fields = any(
            key in supplied_fields
            for key in ("panel_stability", "availability_fallback")
        )
        if version is None and has_v2_fields:
            raise serializers.ValidationError(
                {"policy_version": ["Policyversjon 2 må oppgis eksplisitt."]}
            )
        if version is not None:
            if version != POLICY_VERSION:
                raise serializers.ValidationError(
                    {"policy_version": ["Ukjent versjon av planleggingspolicy."]}
                )
            missing = [
                key
                for key in ("panel_stability", "availability_fallback")
                if key not in attrs
            ]
            if missing:
                raise serializers.ValidationError(
                    {key: ["Feltet er påkrevd for policyversjon 2."] for key in missing}
                )
            expected_same_panel = attrs["panel_stability"] == "required"
            expected_allow_overtime = attrs["availability_fallback"] == "automatic"
            if (
                "same_panel_per_block" in supplied_fields
                and attrs.get("same_panel_per_block") != expected_same_panel
            ):
                raise serializers.ValidationError(
                    {
                        "same_panel_per_block": [
                            "Legacy-feltet samsvarer ikke med policyen."
                        ]
                    }
                )
            if (
                "allow_overtime" in supplied_fields
                and attrs.get("allow_overtime") != expected_allow_overtime
            ):
                raise serializers.ValidationError(
                    {"allow_overtime": ["Legacy-feltet samsvarer ikke med policyen."]}
                )
            attrs["same_panel_per_block"] = expected_same_panel
            attrs["allow_overtime"] = expected_allow_overtime
        else:
            attrs.setdefault("same_panel_per_block", True)
            attrs.setdefault("allow_overtime", True)
        return attrs
