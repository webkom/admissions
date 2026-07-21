from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0024_conflict_review_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="reviewed_candidate_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="conflictreviewauditevent",
            name="conflict_candidate_ids",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="conflictreviewauditevent",
            name="action",
            field=models.CharField(
                choices=[
                    ("opened", "Opened"),
                    ("closed", "Closed"),
                    ("viewed", "Viewed"),
                    ("submitted", "Submitted"),
                    ("frozen", "Frozen"),
                ],
                max_length=16,
            ),
        ),
    ]
