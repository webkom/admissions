import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0027_versioned_schedule_layout"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="solvejob",
            name="request_fingerprint",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.CreateModel(
            name="ScheduleDeviationApproval",
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
                ("actor_username", models.CharField(max_length=150)),
                ("schedule_fingerprint", models.CharField(max_length=64)),
                ("deviation_fingerprint", models.CharField(max_length=64)),
                ("policy_snapshot", models.JSONField(default=dict)),
                ("availability_generation", models.PositiveIntegerField()),
                ("layout_version", models.PositiveSmallIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="schedule_deviation_approvals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "admission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="schedule_deviation_approvals",
                        to="admissions.admission",
                    ),
                ),
                (
                    "saved_schedule",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deviation_approvals",
                        to="admissions.savedschedule",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="scheduledeviationapproval",
            index=models.Index(
                fields=["saved_schedule", "deviation_fingerprint"],
                name="sched_dev_fingerprint_idx",
            ),
        ),
    ]
