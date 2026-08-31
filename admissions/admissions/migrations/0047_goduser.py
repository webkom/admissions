import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

# The list this migration seeded when it was written, frozen here as a
# literal. It used to read constants.GOD_LEGO_IDS, but a migration must not
# depend on live application code: the constant is the *current* answer,
# while a migration needs the answer as of the moment it ran. The list is now
# managed through /api/manage/god-user/, so the constant is gone and this
# historical value is all that remains of it.
SEEDED_GOD_LEGO_IDS = [8810]


def seed_god_user_ids(apps, schema_editor):
    """Seed the GodUser table with the god list as it stood at deploy time.

    Mirrors the production list so behaviour did not change when the check
    moved from a hardcoded constant to this table.
    """
    GodUser = apps.get_model("admissions", "GodUser")

    for lego_id in SEEDED_GOD_LEGO_IDS:
        GodUser.objects.get_or_create(lego_id=lego_id)


def unseed_god_user_ids(apps, schema_editor):
    """Reverse migration: drop the seeded rows."""
    GodUser = apps.get_model("admissions", "GodUser")

    GodUser.objects.filter(lego_id__in=SEEDED_GOD_LEGO_IDS).delete()


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
                    models.AutoField(
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
