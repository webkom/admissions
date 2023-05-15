# Generated by Django 4.2 on 2023-04-28 14:11

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0009_admission_slug"),
    ]

    operations = [
        migrations.AddField(
            model_name="admission",
            name="admin_groups",
            field=models.ManyToManyField(
                related_name="admin_groups", to="admissions.group"
            ),
        ),
    ]