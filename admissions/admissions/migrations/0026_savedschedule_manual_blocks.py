from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0025_conflict_review_audit_snapshots"),
    ]

    operations = [
        migrations.AddField(
            model_name="savedschedule",
            name="block_mode",
            field=models.CharField(
                choices=[("standard", "Standard blocks"), ("manual", "Manual blocks")],
                default="standard",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="manual_blocks",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
