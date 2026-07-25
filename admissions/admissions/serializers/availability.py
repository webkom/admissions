"""Interview-availability serializers for participant submissions and reading."""

from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import InterviewAvailability


class SaveInterviewAvailabilitySerializer(serializers.Serializer):
    user_id = serializers.UUIDField(required=False)
    experience_level = serializers.ChoiceField(
        choices=InterviewAvailability.EXPERIENCE_LEVEL_CHOICES,
        required=False,
    )
    participation = serializers.ChoiceField(
        choices=[
            InterviewAvailability.PARTICIPATION_AWAITING,
            InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
        ],
        required=False,
    )
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
    conflict_collection_reviewed_candidate_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        max_length=500,
    )
    conflict_collection_revision = serializers.UUIDField(required=False)
    expected_availability_generation = serializers.IntegerField(
        min_value=1, required=False
    )

    def validate(self, attrs):
        for field in (
            "slots",
            "conflicts",
            "reviewed_candidate_ids",
            "conflict_collection_reviewed_candidate_ids",
        ):
            values = attrs.get(field)
            if values is not None and len(values) != len(set(values)):
                raise serializers.ValidationError({field: ["Verdiene må være unike."]})
        if (
            attrs.get("participation")
            == InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
            and "slots" in attrs
        ):
            raise serializers.ValidationError(
                {"slots": ["En som ikke deltar kan ikke samtidig sende inn tider."]}
            )
        return attrs


class InterviewAvailabilityParticipantSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    gender = serializers.CharField(required=False, allow_blank=True, default="")
    experience_level = serializers.ChoiceField(
        choices=InterviewAvailability.EXPERIENCE_LEVEL_CHOICES
    )
    slots = serializers.ListField(child=serializers.CharField(), default=list)
    conflicts = serializers.ListField(child=serializers.CharField(), default=list)
    reviewed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    proposed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    conflict_collection_candidate_ids = serializers.ListField(
        child=serializers.CharField(),
        default=list,
    )
    conflict_collection_revision = serializers.UUIDField(
        allow_null=True,
        default=None,
    )
    conflict_collection_complete = serializers.BooleanField(default=False)
    conflict_review_complete = serializers.BooleanField(default=False)
    has_submitted = serializers.BooleanField()
    participation = serializers.ChoiceField(
        choices=InterviewAvailability.PARTICIPATION_CHOICES
    )
    needs_review = serializers.BooleanField(default=False)
    affected_assignment_count = serializers.IntegerField(min_value=0, default=0)
    availability_generation = serializers.IntegerField(min_value=1, default=1)
    is_me = serializers.BooleanField()
