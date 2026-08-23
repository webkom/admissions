"""Audit-event serializers (start with name visibility, extend as needed)."""

from rest_framework import serializers

from admissions.admissions.models import NameVisibilityAuditEvent


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
