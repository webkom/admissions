from datetime import timedelta

from django.db import migrations, models
from django.db.models import F, Q


def normalize_admission_dates(apps, schema_editor):
    Admission = apps.get_model("admissions", "Admission")
    Admission.objects.filter(public_deadline__lte=F("open_from")).update(
        open_from=F("public_deadline") - timedelta(minutes=1)
    )
    Admission.objects.filter(closed_from__lt=F("public_deadline")).update(
        closed_from=F("public_deadline")
    )


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0018_name_visibility_audit_event"),
    ]

    operations = [
        migrations.RunPython(normalize_admission_dates, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="admission",
            constraint=models.CheckConstraint(
                condition=Q(public_deadline__gt=F("open_from"))
                & Q(closed_from__gte=F("public_deadline")),
                name="admission_dates_in_chronological_order",
            ),
        ),
    ]
