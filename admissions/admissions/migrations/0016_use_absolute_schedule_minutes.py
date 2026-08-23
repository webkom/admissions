from datetime import date

from django.db import migrations

MINUTES_PER_DAY = 24 * 60


def _parse_slot_key(key):
    key = str(key)
    separator = key.rfind("|") if "|" in key else key.rfind(":")
    if separator == -1:
        return None
    try:
        return date.fromisoformat(key[:separator]), int(key[separator + 1 :])
    except (TypeError, ValueError):
        return None


def forwards(apps, schema_editor):
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    SolveJob = apps.get_model("admissions", "SolveJob")

    for saved in SavedSchedule.objects.all().iterator():
        duration = max(int(saved.session_duration or 60), 1)
        legacy_slots_per_day = max(1, MINUTES_PER_DAY // duration)
        enabled_time_map = {}
        for key in saved.enabled_slots or []:
            parsed = _parse_slot_key(key)
            if parsed is None:
                continue
            slot_date, minute = parsed
            day_index = (slot_date - saved.start_date).days
            if day_index < 0 or not 0 <= minute < MINUTES_PER_DAY:
                continue
            legacy_time = day_index * legacy_slots_per_day + minute // duration
            enabled_time_map.setdefault(legacy_time, []).append(
                day_index * MINUTES_PER_DAY + minute
            )

        changed = False
        ambiguous = False
        schedule = saved.schedule or []
        for item in schedule:
            if not isinstance(item, dict) or not isinstance(item.get("time"), int):
                ambiguous = True
                break
            legacy_time = item["time"]
            mapped = list(dict.fromkeys(enabled_time_map.get(legacy_time, [])))
            if len(mapped) == 1:
                next_time = mapped[0]
            else:
                ambiguous = True
                break
            if next_time != legacy_time:
                item["time"] = next_time
                changed = True

        if ambiguous and schedule:
            saved.schedule = []
            saved.is_distributed = False
            saved.name_visibility = "hidden"
            saved.save(update_fields=["schedule", "is_distributed", "name_visibility"])
        elif changed:
            saved.schedule = schedule
            saved.save(update_fields=["schedule"])

    SolveJob.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0015_solvejob_unique_active_solve_job_per_admission"),
    ]

    operations = [
        migrations.RunPython(forwards),
    ]
