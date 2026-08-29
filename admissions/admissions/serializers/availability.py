"""Interview-availability serializers for participant submissions and reading."""

from rest_framework import serializers

from admissions.admissions import constants
from admissions.admissions.models import InterviewAvailability


class FadderbarnDeclarationSerializer(serializers.Serializer):
    lego_user_id = serializers.IntegerField(min_value=1)
    # Display snapshots. Nothing is ever matched on these, so they are
    # optional and treated as untrusted labels.
    username = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    full_name = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


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
    # "Helst ikke": submitted alongside slots and validated against the same
    # grid. Sent as its own list rather than a flag inside slots so a client
    # that knows nothing about it still round-trips availability unchanged.
    discouraged_slots = serializers.ListField(
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
    expected_availability_generation = serializers.IntegerField(
        min_value=1, required=False
    )
    # Declared against LEGO identities, not candidates: at declaration time the
    # interviewer must not learn who has applied. Sent as a full replacement of
    # this interviewer's declarations for the admission.
    fadderbarn = FadderbarnDeclarationSerializer(
        many=True,
        required=False,
        max_length=100,
    )

    def validate(self, attrs):
        for field in (
            "slots",
            "conflicts",
            "reviewed_candidate_ids",
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


class DecoyCandidateSerializer(serializers.Serializer):
    """One filler entry: the token proposed_candidate_ids carries, plus the
    display name. Served only on the owner's own row."""

    id = serializers.CharField()
    name = serializers.CharField(allow_blank=True)


class InterviewAvailabilityParticipantSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    username = serializers.CharField()
    full_name = serializers.CharField()
    gender = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.CharField(required=False, allow_blank=True, default="")
    availability_updated_at = serializers.DateTimeField(
        allow_null=True,
        required=False,
        default=None,
    )
    experience_level = serializers.ChoiceField(
        choices=InterviewAvailability.EXPERIENCE_LEVEL_CHOICES
    )
    slots = serializers.ListField(child=serializers.CharField(), default=list)
    discouraged_slots = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    conflicts = serializers.ListField(child=serializers.CharField(), default=list)
    # Admin-only, never on non-admin responses: implied by a fadderbarn
    # declaration matching an applicant, so showing it to the declaring
    # interviewer would tell them exactly which of their fadderbarn applied.
    derived_conflicts = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    reviewed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    proposed_candidate_ids = serializers.ListField(
        child=serializers.CharField(), default=list
    )
    # The names behind your own proposed tokens: {id, name} for your fillers,
    # so the review UI can render them next to real candidates. Own row only,
    # never for an admin - anyone else's filler list would make
    # cross-comparing two interviewers' lists trivial.
    decoy_candidates = DecoyCandidateSerializer(many=True, required=False, default=list)
    # The names behind your own REAL review tokens, pre-publication: a member
    # performing their inhabilitetssjekk must recognise the people they are
    # proposed to interview, and the candidate pool itself is admin-only
    # until the plan is published. Same shape as the fillers so the review UI
    # renders both identically; own row only, and only while the review is
    # open.
    review_candidates = DecoyCandidateSerializer(
        many=True, required=False, default=list
    )
    conflict_review_complete = serializers.BooleanField(default=False)
    has_submitted = serializers.BooleanField()
    participation = serializers.ChoiceField(
        choices=InterviewAvailability.PARTICIPATION_CHOICES
    )
    needs_review = serializers.BooleanField(default=False)
    affected_assignment_count = serializers.IntegerField(min_value=0, default=0)
    availability_generation = serializers.IntegerField(min_value=1, default=1)
    is_me = serializers.BooleanField()
    # False only where the caller is served the full roster: a person LEGO
    # lists in the committee who has never signed in to admissions.
    has_signed_in = serializers.BooleanField(default=True)
    # Present only on your own row; always empty for everyone else's.
    fadderbarn = FadderbarnDeclarationSerializer(many=True, required=False)
