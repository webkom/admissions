"""User-facing serializers (currently the admin user endpoint projection)."""

from rest_framework import serializers

from admissions.admissions.models import LegoUser


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
