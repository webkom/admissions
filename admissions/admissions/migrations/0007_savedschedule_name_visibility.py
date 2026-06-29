from django.db import migrations, models


def backfill_name_visibility(apps, schema_editor):
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    for schedule in SavedSchedule.objects.all():
        schedule.name_visibility = (
            "committee" if schedule.show_candidate_names else "admin_only"
        )
        schedule.save(update_fields=["name_visibility"])


def reverse_backfill(apps, schema_editor):
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    for schedule in SavedSchedule.objects.all():
        schedule.show_candidate_names = schedule.name_visibility == "committee"
        schedule.save(update_fields=["show_candidate_names"])


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0006_savedschedule_enabled_windows"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="name_visibility",
            field=models.CharField(
                choices=[
                    ("hidden", "Hidden"),
                    ("admin_only", "Admin only"),
                    ("committee", "Committee"),
                ],
                default="hidden",
                max_length=16,
            ),
        ),
        migrations.RunPython(backfill_name_visibility, reverse_backfill),
        migrations.RemoveField(
            model_name="savedschedule",
            name="show_candidate_names",
        ),
    ]
