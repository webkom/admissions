from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0004_savedschedule_interviewavailability"),
    ]

    operations = [
        migrations.AddField(
            model_name="interviewavailability",
            name="conflicts",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
