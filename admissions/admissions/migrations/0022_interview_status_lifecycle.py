import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0021_userapplication_interview_status"),
    ]

    operations = [
        migrations.AlterField(
            model_name="userapplication",
            name="interview_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("declined", "Declined"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="not_invited",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="userapplication",
            name="interview_status_updated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="interview_status_updates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="userapplication",
            name="interview_status_updated_by_username",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.CreateModel(
            name="InterviewStatusAuditEvent",
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
                (
                    "previous_status",
                    models.CharField(
                        choices=[
                            ("not_invited", "Not invited"),
                            ("invited", "Invited"),
                            ("confirmed", "Confirmed"),
                            ("declined", "Declined"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "new_status",
                    models.CharField(
                        choices=[
                            ("not_invited", "Not invited"),
                            ("invited", "Invited"),
                            ("confirmed", "Confirmed"),
                            ("declined", "Declined"),
                            ("completed", "Completed"),
                            ("cancelled", "Cancelled"),
                        ],
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "actor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="interview_status_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "application",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="interview_status_events",
                        to="admissions.userapplication",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(
                        fields=["application", "-created_at"],
                        name="interview_status_app_time_idx",
                    )
                ],
            },
        ),
    ]
