from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0016_use_absolute_schedule_minutes"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="revealed_groups",
            field=models.ManyToManyField(
                blank=True,
                related_name="revealed_interview_schedules",
                to="admissions.group",
            ),
        ),
    ]
