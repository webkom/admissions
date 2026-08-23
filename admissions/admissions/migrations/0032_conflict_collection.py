import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0031_solver_v2_experience_and_metrics"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="conflict_collection_open",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="conflict_collection_revision",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="conflict_collection_candidate_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="conflict_collection_participant_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="interviewavailability",
            name="conflict_collection_reviewed_candidate_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="interviewavailability",
            name="conflict_collection_review_revision",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="phase",
            field=models.CharField(
                choices=[("draft", "Draft"), ("collection", "Collection")],
                default="draft",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="collection_revision",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="subject_user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="conflict_review_subject_events",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="subject_username",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
