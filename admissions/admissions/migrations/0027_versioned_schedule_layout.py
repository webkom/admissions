from datetime import date, timedelta

from django.db import migrations, models


def _slot_key(day, minute):
    return f"{day.isoformat()}|{minute}"


def _standard_blocks(saved):
    blocks = []
    current_date = saved.start_date
    end_date = saved.end_date or saved.start_date
    while current_date <= end_date:
        minute = saved.day_start_minute
        while minute + saved.session_duration <= saved.day_end_minute:
            block = []
            for _unused in range(saved.chunk_size):
                if minute + saved.session_duration > saved.day_end_minute:
                    break
                block.append(_slot_key(current_date, minute))
                minute += saved.session_duration
            if block:
                blocks.append({"slots": block})
            minute += saved.chunk_break_minutes
        current_date += timedelta(days=1)
    return blocks


def _parse_slot(raw):
    parts = str(raw).split("|")
    if len(parts) != 2:
        return None
    try:
        return date.fromisoformat(parts[0]), int(parts[1])
    except (TypeError, ValueError):
        return None


def _legacy_grid_slots(saved):
    slots = set()
    current_date = saved.start_date
    end_date = saved.end_date or saved.start_date
    while current_date <= end_date:
        minute = saved.day_start_minute
        while minute + saved.session_duration <= saved.day_end_minute:
            slots.add(_slot_key(current_date, minute))
            minute += saved.session_duration
        current_date += timedelta(days=1)
    return slots


def _version_two_grid_slots(saved):
    blocks = _standard_blocks(saved)
    slots = {slot for block in blocks for slot in block["slots"]}
    for left, right in zip(blocks, blocks[1:]):
        left_date, left_start = _parse_slot(left["slots"][-1])
        right_date, right_start = _parse_slot(right["slots"][0])
        if left_date != right_date:
            continue
        minute = left_start + saved.session_duration
        while minute + saved.session_duration <= right_start:
            slots.add(_slot_key(left_date, minute))
            minute += saved.session_duration
    return slots


def _slots_from_windows(saved):
    slots = set()
    for window in saved.enabled_windows or []:
        if not isinstance(window, dict):
            raise ValueError
        try:
            window_date = date.fromisoformat(str(window["date"]))
            start = int(window["start_minute"])
            end = int(window["end_minute"])
        except (KeyError, TypeError, ValueError):
            raise ValueError from None
        if start >= end or (end - start) % saved.session_duration:
            raise ValueError
        minute = start
        while minute + saved.session_duration <= end:
            slots.add(_slot_key(window_date, minute))
            minute += saved.session_duration
    return slots


def _manual_layout_is_valid(saved, grid_slots, enabled_slots):
    blocks = saved.resolved_blocks
    if not isinstance(blocks, list) or not blocks:
        return False
    seen = set()
    previous_last = None
    for block in blocks:
        if not isinstance(block, dict) or not isinstance(block.get("slots"), list):
            return False
        parsed = [_parse_slot(slot) for slot in block["slots"]]
        if not parsed or any(value is None for value in parsed):
            return False
        for index, value in enumerate(parsed):
            slot_date, minute = value
            key = _slot_key(slot_date, minute)
            if key in seen or key not in grid_slots:
                return False
            if index and (
                parsed[index - 1][0] != slot_date
                or parsed[index - 1][1] + saved.session_duration != minute
            ):
                return False
            seen.add(key)
        if previous_last is not None and parsed[0] <= previous_last:
            return False
        previous_last = parsed[-1]
    return seen == grid_slots and enabled_slots.issubset(seen)


def _version_two_standard_layout(saved, enabled_slots):
    blocks = _standard_blocks(saved)
    standard_slots = {slot for block in blocks for slot in block["slots"]}
    base_slots = {
        slot
        for block in blocks
        if set(block["slots"]).issubset(enabled_slots)
        for slot in block["slots"]
    }
    overrides = [
        {"slot": slot, "open": True}
        for slot in sorted(enabled_slots - base_slots, key=_parse_slot)
    ]
    pause_slots = sorted(enabled_slots - standard_slots, key=_parse_slot)
    pause_blocks = []
    current = []
    previous = None
    for slot in pause_slots:
        parsed = _parse_slot(slot)
        if previous is not None and (
            parsed[0] != previous[0]
            or parsed[1] != previous[1] + saved.session_duration
        ):
            pause_blocks.append({"slots": current})
            current = []
        current.append(slot)
        previous = parsed
    if current:
        pause_blocks.append({"slots": current})
    resolved_blocks = [*blocks, *pause_blocks]
    resolved_blocks.sort(key=lambda block: _parse_slot(block["slots"][0]))
    return resolved_blocks, overrides


def forwards(apps, schema_editor):
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    InterviewAvailability = apps.get_model("admissions", "InterviewAvailability")
    invalid_ids = []
    for saved in SavedSchedule.objects.all().iterator():
        try:
            enabled_slots = set(saved.enabled_slots or [])
            window_slots = (
                _slots_from_windows(saved) if saved.enabled_windows else set()
            )
            if enabled_slots and window_slots and enabled_slots != window_slots:
                raise ValueError
            if not enabled_slots:
                enabled_slots = window_slots
        except ValueError:
            invalid_ids.append(saved.admission_id)
            continue
        if any(_parse_slot(slot) is None for slot in enabled_slots):
            invalid_ids.append(saved.admission_id)
            continue
        if saved.block_mode == "manual":
            legacy_grid_slots = _legacy_grid_slots(saved)
            if not _manual_layout_is_valid(saved, legacy_grid_slots, enabled_slots):
                invalid_ids.append(saved.admission_id)
                continue
            saved.layout_version = 1
        else:
            version_two_grid_slots = _version_two_grid_slots(saved)
            if enabled_slots - version_two_grid_slots:
                invalid_ids.append(saved.admission_id)
                continue
            blocks, overrides = _version_two_standard_layout(saved, enabled_slots)
            saved.layout_version = 2
            saved.resolved_blocks = blocks
            saved.slot_overrides = overrides
        saved.enabled_slots = sorted(enabled_slots, key=_parse_slot)
        if saved.layout_version == 1:
            saved.slot_overrides = []
        saved.availability_generation = 1
        saved.save(
            update_fields=[
                "layout_version",
                "resolved_blocks",
                "slot_overrides",
                "availability_generation",
                "enabled_slots",
            ]
        )
    if invalid_ids:
        raise RuntimeError(
            "Kan ikke migrere tidsoppsett for opptak: "
            + ", ".join(str(value) for value in sorted(invalid_ids))
        )
    InterviewAvailability.objects.all().update(submitted_grid_generation=1)


def backwards(apps, schema_editor):
    SavedSchedule = apps.get_model("admissions", "SavedSchedule")
    if SavedSchedule.objects.filter(block_mode="manual").exists():
        raise RuntimeError("Manuelle tidsoppsett må konverteres før tilbakerulling.")


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0026_savedschedule_manual_blocks"),
    ]

    operations = [
        migrations.RenameField(
            model_name="savedschedule",
            old_name="manual_blocks",
            new_name="resolved_blocks",
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="layout_version",
            field=models.PositiveSmallIntegerField(default=2),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="slot_overrides",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="savedschedule",
            name="availability_generation",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="interviewavailability",
            name="submitted_grid_generation",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, backwards),
    ]
