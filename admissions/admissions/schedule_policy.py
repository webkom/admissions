import hashlib
import json
from dataclasses import dataclass

POLICY_VERSION = 2
PANEL_STABILITIES = ("required", "preferred", "flexible")
AVAILABILITY_FALLBACKS = ("stop", "propose", "automatic")


class SchedulePolicyError(ValueError):
    pass


@dataclass(frozen=True)
class SchedulePolicy:
    policy_version: int | None
    panel_stability: str
    availability_fallback: str
    legacy: bool

    @property
    def requires_stable_panel(self):
        return self.panel_stability == "required"

    @property
    def prefers_stable_panel(self):
        return self.panel_stability == "preferred"

    @property
    def allows_availability_deviations(self):
        return self.availability_fallback in ("propose", "automatic")

    @property
    def requires_deviation_approval(self):
        return self.availability_fallback == "propose"

    def snapshot(self):
        return {
            "policy_version": self.policy_version,
            "panel_stability": self.panel_stability,
            "availability_fallback": self.availability_fallback,
        }


def normalize_schedule_policy(options, *, persisted=False):
    raw = options if isinstance(options, dict) else {}
    version = raw.get("policy_version")

    if version is None:
        # A historically persisted null/empty policy was validated as flexible
        # panel composition with availability deviations allowed. Solver
        # requests, on the other hand, historically defaulted to a hard stable
        # panel. Keep those two old contracts distinct during lazy migration.
        if persisted and not raw:
            return SchedulePolicy(None, "flexible", "automatic", True)
        same_panel = bool(raw.get("same_panel_per_block", True))
        repair_mode = bool(raw.get("repair_mode", False))
        panel_stability = (
            "preferred"
            if same_panel and repair_mode
            else "required" if same_panel else "flexible"
        )
        availability_fallback = (
            "automatic" if raw.get("allow_overtime", True) else "stop"
        )
        return SchedulePolicy(
            None,
            panel_stability,
            availability_fallback,
            True,
        )

    if version != POLICY_VERSION:
        raise SchedulePolicyError("Ukjent versjon av planleggingspolicy.")

    panel_stability = raw.get("panel_stability")
    availability_fallback = raw.get("availability_fallback")
    if panel_stability not in PANEL_STABILITIES:
        raise SchedulePolicyError("Ugyldig policy for panelstabilitet.")
    if availability_fallback not in AVAILABILITY_FALLBACKS:
        raise SchedulePolicyError("Ugyldig policy for tilgjengelighetsavvik.")
    return SchedulePolicy(
        POLICY_VERSION,
        panel_stability,
        availability_fallback,
        False,
    )


def normalize_solver_options(options, *, persisted=False):
    raw = dict(options) if isinstance(options, dict) else {}
    policy = normalize_schedule_policy(raw, persisted=persisted)
    raw.update(policy.snapshot())
    # These shadows keep rollback fail-safe. The v2 fields remain
    # authoritative whenever policy_version is present.
    raw["same_panel_per_block"] = policy.requires_stable_panel
    raw["allow_overtime"] = policy.allows_availability_deviations
    return raw, policy


def solver_options_for_storage(options):
    normalized, policy = normalize_solver_options(options)
    if policy.legacy:
        return normalized
    normalized["same_panel_per_block"] = policy.requires_stable_panel
    normalized["allow_overtime"] = policy.availability_fallback == "automatic"
    return normalized


def _stable_json(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    )


def fingerprint(value):
    return hashlib.sha256(_stable_json(value).encode("utf-8")).hexdigest()


def solve_request_fingerprint(request_data):
    return fingerprint(request_data)


def canonical_schedule_assignments(schedule):
    assignments = []
    for item in schedule or []:
        if not isinstance(item, dict):
            continue
        assignments.append(
            {
                "candidate_id": str(item.get("candidate_id") or ""),
                "time": item.get("time"),
                "panel": sorted(
                    str(member.get("id") or "")
                    for member in (item.get("panel") or [])
                    if isinstance(member, dict)
                ),
            }
        )
    return sorted(
        assignments,
        key=lambda item: (item["candidate_id"], item["time"], item["panel"]),
    )


def availability_deviations(schedule):
    deviations = []
    for item in schedule or []:
        if not isinstance(item, dict):
            continue
        candidate_id = str(item.get("candidate_id") or "")
        interview_time = item.get("time")
        for member in item.get("panel") or []:
            if not isinstance(member, dict) or not member.get("is_overtime"):
                continue
            deviations.append(
                {
                    "kind": "availability",
                    "candidate_id": candidate_id,
                    "interviewer_id": str(member.get("id") or ""),
                    "time": interview_time,
                }
            )
    return sorted(
        deviations,
        key=lambda item: (
            item["candidate_id"],
            item["interviewer_id"],
            item["time"],
        ),
    )


def build_deviation_review(
    *,
    schedule,
    policy,
    availability_generation,
    layout_version,
):
    assignments = canonical_schedule_assignments(schedule)
    deviations = availability_deviations(schedule)
    schedule_fingerprint = fingerprint(
        {
            "assignments": assignments,
            "policy": policy.snapshot(),
            "availability_generation": availability_generation,
            "layout_version": layout_version,
        }
    )
    deviation_fingerprint = fingerprint(
        {
            "schedule_fingerprint": schedule_fingerprint,
            "deviations": deviations,
        }
    )
    return {
        "policy": policy.snapshot(),
        "schedule_fingerprint": schedule_fingerprint,
        "deviation_fingerprint": deviation_fingerprint,
        "deviations": deviations,
        "deviation_count": len(deviations),
        "requires_approval": bool(deviations and policy.requires_deviation_approval),
    }
