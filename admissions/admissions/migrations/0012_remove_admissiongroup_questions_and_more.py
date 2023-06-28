# Generated by Django 4.2.3 on 2023-07-07 21:08

import admissions.admissions.fields.jsonschemaquestionfield
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0011_remove_groupapplication_text_and_more"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="admissiongroup",
            name="questions",
        ),
        migrations.RemoveField(
            model_name="group",
            name="response_label",
        ),
        migrations.AddField(
            model_name="group",
            name="questions",
            field=admissions.admissions.fields.jsonschemaquestionfield.JSONSchemaQuestionField(
                blank=True, default=dict
            ),
        ),
    ]
