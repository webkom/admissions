from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0036_cache_table"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="savedschedule",
            name="conflict_collection_open",
        ),
        migrations.RemoveField(
            model_name="savedschedule",
            name="conflict_collection_revision",
        ),
        migrations.RemoveField(
            model_name="savedschedule",
            name="conflict_collection_candidate_ids",
        ),
        migrations.RemoveField(
            model_name="savedschedule",
            name="conflict_collection_participant_ids",
        ),
        migrations.RemoveField(
            model_name="interviewavailability",
            name="conflict_collection_reviewed_candidate_ids",
        ),
        migrations.RemoveField(
            model_name="interviewavailability",
            name="conflict_collection_review_revision",
        ),
    ]
