from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0032_conflict_collection"),
    ]

    operations = [
        migrations.AddField(
            model_name="admissiongroup",
            name="application_guidance",
            field=models.TextField(
                blank=True,
                default=None,
                max_length=600,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="admissiongroup",
            name="committee_info",
            field=models.TextField(
                blank=True,
                default=None,
                max_length=600,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="admissiongroup",
            name="interview_description",
            field=models.TextField(
                blank=True,
                default=None,
                max_length=600,
                null=True,
            ),
        ),
    ]
