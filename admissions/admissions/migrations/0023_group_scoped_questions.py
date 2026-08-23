from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0022_interview_status_lifecycle"),
    ]

    operations = [
        migrations.AddField(
            model_name="admissiongroup",
            name="header_fields",
            field=models.JSONField(default=list, null=True),
        ),
        migrations.AddField(
            model_name="groupapplication",
            name="header_fields_response",
            field=models.JSONField(default=dict, null=True),
        ),
    ]
