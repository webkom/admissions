"""Serializer for the GodUser allowlist."""

from rest_framework import serializers

from admissions.admissions.models import GodUser, LegoUser


class GodUserSerializer(serializers.ModelSerializer):
    added_by_username = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = GodUser
        fields = (
            "lego_id",
            "display_name",
            "note",
            "added_by",
            "added_by_username",
            "created_at",
        )
        read_only_fields = (
            "added_by",
            "added_by_username",
            "created_at",
            "display_name",
        )

    def validate_lego_id(self, value):
        if value <= 0:
            raise serializers.ValidationError("LEGO-id må være et positivt heltall.")
        if not LegoUser.objects.filter(lego_id=value).exists():
            raise serializers.ValidationError(
                f"LEGO-id {value} finnes ikke i databasen. "
                "Sjekk at du har skrevet riktig — brukeren må være logget "
                "inn minst én gang."
            )
        return value

    def get_added_by_username(self, obj):
        if obj.added_by_id is not None and obj.added_by is not None:
            return obj.added_by.username
        return ""

    def get_display_name(self, instance):
        user = LegoUser.objects.filter(lego_id=instance.lego_id).first()
        if user is None:
            return "Ukjent bruker"
        return user.get_full_name() or user.username
