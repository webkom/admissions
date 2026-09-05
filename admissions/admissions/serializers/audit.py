"""Audit-event serializers (start with name visibility, extend as needed)."""

from rest_framework import serializers

from admissions.admissions.models import NameVisibilityAuditEvent, WithdrawalAuditEvent


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


class WithdrawalAuditEventSerializer(serializers.ModelSerializer):
    """Only what the list has to render: who left, from where, and when.

    `kind` is deliberately not serialized: whether the person withdrew from
    the whole admission or only this committee is their business, not the
    recruiter's. The column stays in the database for internal needs, but it
    never leaves the server.

    `candidate_id` and `actor` stay on the model - they are the audit trail -
    but they are deliberately not serialized. `candidate_id` is the deleted
    application's UUID, a re-identification handle that would let a reader
    join a withdrawn name onto anything else keyed by application id (an
    earlier CSV export, a cached plan). Nothing in the UI needs either.
    """

    class Meta:
        model = WithdrawalAuditEvent
        fields = (
            "id",
            "group",
            "group_name",
            "candidate_username",
            "candidate_full_name",
            # Not a scope leak: it says whether the person left on their own
            # or was removed - which the acting recruiters already know - and
            # nothing about other committees. The list heading says "trukket
            # seg", so without this flag a removal would be labelled as a
            # voluntary exit, which asserts something untrue about someone.
            "withdrawn_by_candidate",
            "created_at",
        )
        read_only_fields = fields
