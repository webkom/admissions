from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0030_solve_job_lifecycle_constraint"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewavailability",
            name="experience_level",
            field=models.CharField(
                choices=[
                    ("unknown", "Unknown"),
                    ("inexperienced", "Inexperienced"),
                    ("experienced", "Experienced"),
                ],
                default="unknown",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="solvejob",
            name="solver_metrics",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
