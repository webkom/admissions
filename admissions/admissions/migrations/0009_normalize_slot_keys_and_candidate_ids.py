from django.db import migrations

LEGACY_CANDIDATE_PREFIX = "real-candidate-"


def _canonicalize_slot_key(key):
    """Rewrite legacy "<date>:<minute>" keys to the canonical "<date>|<minute>".

    Keys that are already canonical or cannot be parsed are returned as-is.
    """
    key = str(key)
    if "|" in key:
        separator = key.rfind("|")
    else:
        separator = key.rfind(":")
    if separator == -1:
        return key

    slot_date = key[:separator]
    try:
        minute = int(key[separator + 1 :])
    except ValueError:
        return key

    return f"{slot_date}|{minute}"


def _canonicalize_slot_list(keys):
    return [_canonicalize_slot_key(key) for key in (keys or [])]


def forwards(apps, schema_editor):
    InterviewAvailability = apps.get_model("admissions", "InterviewAvailability")
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    UserApplication = apps.get_model("admissions", "UserApplication")

    candidate_maps = {}

    def candidate_id_for(admission_id, username):
        if admission_id not in candidate_maps:
            candidate_maps[admission_id] = {
                application.user.username: str(application.pk)
                for application in UserApplication.objects.filter(
                    admission_id=admission_id
                ).select_related("user")
            }
        return candidate_maps[admission_id].get(username)

    for availability in InterviewAvailability.objects.all().iterator():
        old_slots = list(availability.slots or [])
        new_slots = _canonicalize_slot_list(old_slots)

        old_conflicts = list(availability.conflicts or [])
        new_conflicts = []
        for conflict in old_conflicts:
            conflict = str(conflict)
            if conflict.startswith(LEGACY_CANDIDATE_PREFIX):
                username = conflict[len(LEGACY_CANDIDATE_PREFIX) :]
                mapped = candidate_id_for(availability.admission_id, username)
                if mapped is None:
                    # Unmappable legacy conflict — drop it.
                    continue
                new_conflicts.append(mapped)
            else:
                new_conflicts.append(conflict)

        if new_slots != old_slots or new_conflicts != old_conflicts:
            availability.slots = new_slots
            availability.conflicts = new_conflicts
            availability.save(update_fields=["slots", "conflicts"])

    for saved in SavedSchedule.objects.all().iterator():
        changed = False

        old_enabled_slots = list(saved.enabled_slots or [])
        new_enabled_slots = _canonicalize_slot_list(old_enabled_slots)
        if new_enabled_slots != old_enabled_slots:
            saved.enabled_slots = new_enabled_slots
            changed = True

        schedule = saved.schedule or []
        for item in schedule:
            if not isinstance(item, dict):
                continue
            candidate_id = item.get("candidate_id")
            if not isinstance(candidate_id, str) or not candidate_id.startswith(
                LEGACY_CANDIDATE_PREFIX
            ):
                continue
            username = candidate_id[len(LEGACY_CANDIDATE_PREFIX) :]
            mapped = candidate_id_for(saved.admission_id, username)
            # Unmappable legacy ids stay as-is so the entry remains visible
            # instead of silently losing its candidate.
            if mapped is not None:
                item["candidate_id"] = mapped
                changed = True

        if changed:
            saved.schedule = schedule
            saved.save(update_fields=["enabled_slots", "schedule"])


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0008_savedschedule_panel_size_and_more"),
    ]

    operations = [
        # One-way normalization: the reverse is intentionally a no-op. The
        # forward pass is idempotent (canonical keys are unchanged on re-run),
        # but unmappable legacy conflicts are dropped and cannot be restored, so
        # there is no meaningful down-migration.
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
