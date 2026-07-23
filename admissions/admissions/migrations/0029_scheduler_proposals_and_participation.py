from django.db import migrations, models


def mark_existing_availability_as_participating(apps, schema_editor):
    InterviewAvailability = apps.get_model("admissions", "InterviewAvailability")
    InterviewAvailability.objects.update(participation="participating")


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0028_schedule_policy_approval"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewavailability",
            name="participation",
            field=models.CharField(
                choices=[
                    ("awaiting_response", "Awaiting response"),
                    ("participating", "Participating"),
                    ("not_participating", "Not participating"),
                ],
                default="awaiting_response",
                max_length=24,
            ),
        ),
        migrations.RunPython(
            mark_existing_availability_as_participating,
            migrations.RunPython.noop,
        ),
        migrations.AddField(
            model_name="solvejob",
            name="applied_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="solvejob",
            name="discarded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
