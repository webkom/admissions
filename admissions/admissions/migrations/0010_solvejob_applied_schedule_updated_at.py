from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0009_conflict_collection"),
    ]

    operations = [
        migrations.AddField(
            model_name="solvejob",
            name="applied_schedule_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
