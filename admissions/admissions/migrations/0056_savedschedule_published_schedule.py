from django.db import migrations, models


def seed_published_snapshot(apps, schema_editor):
    """Every already-published plan's snapshot starts as its current schedule.

    Without this the committee would read an empty `published_schedule` the
    moment this ships and every published plan would look wiped. Only rows
    with a boundary are seeded: an unpublished plan has nothing to show, and
    its snapshot is correctly left empty.
    """
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    for saved in SavedSchedule.objects.filter(
        distributed_through__isnull=False
    ).iterator():
        saved.published_schedule = saved.schedule or []
        saved.save(update_fields=["published_schedule"])


def drop_published_snapshot(apps, schema_editor):
    """No-op: reversing drops the column, so there is nothing to unwind."""


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0055_savedschedule_completed_days"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="published_schedule",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(seed_published_snapshot, drop_published_snapshot),
    ]
