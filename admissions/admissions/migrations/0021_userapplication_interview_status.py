import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0020_normalize_group_name_visibility"),
    ]

    operations = [
        migrations.AddField(
            model_name="userapplication",
            name="interview_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("completed", "Completed"),
                ],
                default="not_invited",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="userapplication",
            name="interview_status_updated_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
