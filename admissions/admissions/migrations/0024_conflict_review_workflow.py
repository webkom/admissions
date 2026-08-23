import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def mark_existing_conflicts_reviewed(apps, schema_editor):
    InterviewAvailability = apps.get_model("admissions", "InterviewAvailability")
    for availability in InterviewAvailability.objects.all().iterator():
        conflicts = (
            availability.conflicts if isinstance(availability.conflicts, list) else []
        )
        availability.reviewed_candidate_ids = list(
            dict.fromkeys(str(value) for value in conflicts)
        )
        availability.save(update_fields=["reviewed_candidate_ids"])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("admissions", "0023_group_scoped_questions"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewavailability",
            name="reviewed_candidate_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="conflict_review_open",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="ConflictReviewAuditEvent",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "actor_username",
                    models.CharField(max_length=150),
                ),
                (
                    "action",
                    models.CharField(
                        choices=[("opened", "Opened"), ("closed", "Closed")],
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="conflict_review_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "admission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="conflict_review_events",
                        to="admissions.admission",
                    ),
                ),
                (
                    "saved_schedule",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="conflict_review_events",
                        to="admissions.savedschedule",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["admission", "-created_at"],
                        name="conflict_review_time_idx",
                    )
                ],
            },
        ),
        migrations.RunPython(
            mark_existing_conflicts_reviewed,
            migrations.RunPython.noop,
        ),
    ]
