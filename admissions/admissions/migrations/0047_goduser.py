import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def seed_god_user_ids(apps, schema_editor):
    """Seed the GodUser table from constants.GOD_LEGO_IDS.

    Mirrors the production list at deploy time so behaviour does not
    change between the constant and the DB-backed check. The constant
    remains as a safety net for the OAuth login path and for tests that
    patch it directly.
    """
    GodUser = apps.get_model("admissions", "GodUser")
    from admissions.admissions import constants

    for lego_id in constants.GOD_LEGO_IDS:
        GodUser.objects.get_or_create(lego_id=lego_id)


def unseed_god_user_ids(apps, schema_editor):
    """Reverse migration: drop the seeded rows."""
    GodUser = apps.get_model("admissions", "GodUser")
    from admissions.admissions import constants

    GodUser.objects.filter(lego_id__in=constants.GOD_LEGO_IDS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0046_committeerosterentry"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="GodUser",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("lego_id", models.IntegerField(unique=True)),
                ("note", models.CharField(blank=True, default="", max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "added_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="god_user_entries_added",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
            },
        ),
        migrations.RunPython(seed_god_user_ids, unseed_god_user_ids),
    ]
