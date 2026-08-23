from django.db import migrations


def normalize_group_name_visibility(apps, schema_editor):
    NameVisibilityAuditEvent = apps.get_model("admissions", "NameVisibilityAuditEvent")
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")

    schedules = SavedSchedule.objects.filter(
        is_distributed=True,
        name_visibility="committee",
    ).select_related("admission")
    for schedule in schedules.iterator():
        groups = list(schedule.admission.groups.all())
        group_ids = {group.pk for group in groups}
        latest_actions = {}
        events = (
            NameVisibilityAuditEvent.objects.filter(
                saved_schedule_id=schedule.pk,
                group_id__in=group_ids,
            )
            .order_by("group_id", "-created_at")
            .values_list("group_id", "action")
        )
        for group_id, action in events:
            latest_actions.setdefault(group_id, action)

        if "hidden" in latest_actions.values():
            schedule.name_visibility = "admin_only"
            schedule.save(update_fields=["name_visibility"])
        else:
            schedule.revealed_groups.add(*groups)


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0019_admission_date_order"),
    ]

    operations = [
        migrations.RunPython(
            normalize_group_name_visibility,
            migrations.RunPython.noop,
        ),
    ]
