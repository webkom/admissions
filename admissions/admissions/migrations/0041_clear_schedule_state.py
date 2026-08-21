from django.db import migrations


def clear_schedule_state(apps, schema_editor):
    """Interview scheduling becomes one independent schedule per committee
    instead of one shared schedule per admission. Existing rows carry no
    group and predate any real usage of this feature, so there is nothing to
    backfill - dev/Cypress fixtures regenerate this state from scratch via
    load_fixtures.py.

    Split into its own migration (rather than combined with the schema
    changes in the next one): a DELETE followed by an ALTER TABLE on the
    same table within one transaction trips Postgres's "pending trigger
    events" restriction, since the deferred FK-cascade triggers from the
    DELETE haven't fired yet when the ALTER TABLE runs.
    """
    SolveJob = apps.get_model("admissions", "SolveJob")
    InterviewAvailability = apps.get_model("admissions", "InterviewAvailability")
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    SolveJob.objects.all().delete()
    InterviewAvailability.objects.all().delete()
    SavedSchedule.objects.all().delete()


def reverse_clear(apps, schema_editor):
    # No-op: this migration only deletes rows, nothing to restore.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('admissions', '0040_savedschedule_distributed_through_and_more'),
    ]

    operations = [
        migrations.RunPython(clear_schedule_state, reverse_clear),
    ]
