from django.db import migrations


def backfill_group_scoped_application_answers(apps, schema_editor):
    Admission = apps.get_model("admissions", "Admission")
    AdmissionGroup = apps.get_model("admissions", "AdmissionGroup")
    UserApplication = apps.get_model("admissions", "UserApplication")
    GroupApplication = apps.get_model("admissions", "GroupApplication")
    database = schema_editor.connection.alias

    for admission in Admission.objects.using(database).iterator():
        legacy_fields = admission.header_fields
        if not legacy_fields:
            continue
        for admission_group in AdmissionGroup.objects.using(database).filter(
            admission_id=admission.pk
        ):
            if admission_group.header_fields:
                continue
            AdmissionGroup.objects.using(database).filter(
                pk=admission_group.pk,
                header_fields=[],
            ).update(header_fields=legacy_fields)

    for application in UserApplication.objects.using(database).iterator():
        legacy_answers = application.header_fields_response
        if not legacy_answers:
            continue
        for group_application in GroupApplication.objects.using(database).filter(
            application_id=application.pk
        ):
            if group_application.header_fields_response:
                continue
            GroupApplication.objects.using(database).filter(
                pk=group_application.pk,
                header_fields_response={},
            ).update(header_fields_response=legacy_answers)


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0032_conflict_collection"),
    ]

    operations = [
        migrations.RunPython(
            backfill_group_scoped_application_answers,
            migrations.RunPython.noop,
        ),
    ]
