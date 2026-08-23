from django.db import migrations, models

from admissions.admissions.schedule_windows import slots_to_enabled_windows


def migrate_enabled_windows(apps, schema_editor):
    saved_schedule_model = apps.get_model("admissions", "SavedSchedule")
    for saved_schedule in saved_schedule_model.objects.all():
        if saved_schedule.enabled_windows:
            continue
        saved_schedule.enabled_windows = slots_to_enabled_windows(
            saved_schedule.enabled_slots,
            saved_schedule.session_duration,
        )
        saved_schedule.save(update_fields=["enabled_windows"])


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0005_interviewavailability_conflicts"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="enabled_windows",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(migrate_enabled_windows, migrations.RunPython.noop),
    ]
