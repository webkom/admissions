from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0029_scheduler_proposals_and_participation"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="solvejob",
            constraint=models.CheckConstraint(
                condition=models.Q(applied_at__isnull=True)
                | models.Q(discarded_at__isnull=True),
                name="solve_job_not_applied_and_discarded",
            ),
        ),
    ]
