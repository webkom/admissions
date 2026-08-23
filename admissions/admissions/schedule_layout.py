from datetime import timedelta

from admissions.admissions.schedule_windows import make_slot_key, parse_slot_key


class ScheduleLayoutError(ValueError):
    pass


def build_standard_slot_blocks(
    *,
    start_date,
    end_date,
    day_start_minute,
    day_end_minute,
    session_duration,
    chunk_size,
    chunk_break_minutes,
):
    blocks = []
    current_date = start_date
    effective_end_date = end_date or start_date
    while current_date <= effective_end_date:
        minute = day_start_minute
        while minute + session_duration <= day_end_minute:
            block = []
            for _unused in range(chunk_size):
                if minute + session_duration > day_end_minute:
                    break
                block.append(make_slot_key(current_date, minute))
                minute += session_duration
            if block:
                blocks.append({"slots": block})
            minute += chunk_break_minutes
        current_date += timedelta(days=1)
    return blocks


def build_grid_slot_keys(
    *,
    start_date,
    end_date,
    day_start_minute,
    day_end_minute,
    session_duration,
    chunk_size,
    chunk_break_minutes,
):
    blocks = build_standard_slot_blocks(
        start_date=start_date,
        end_date=end_date,
        day_start_minute=day_start_minute,
        day_end_minute=day_end_minute,
        session_duration=session_duration,
        chunk_size=chunk_size,
        chunk_break_minutes=chunk_break_minutes,
    )
    keys = [slot for block in blocks for slot in block["slots"]]
    for left, right in zip(blocks, blocks[1:]):
        left_date, left_start = _slot_sort_key(left["slots"][-1])
        right_date, right_start = _slot_sort_key(right["slots"][0])
        if left_date != right_date:
            continue
        minute = left_start + session_duration
        while minute + session_duration <= right_start:
            keys.append(make_slot_key(left_date, minute))
            minute += session_duration
    return sorted(keys, key=_slot_sort_key)


def _slot_sort_key(slot):
    parsed = parse_slot_key(slot)
    if parsed is None:
        raise ScheduleLayoutError(f"Ugyldig tidsluke: {slot}")
    return parsed


def canonicalize_slot_overrides(raw_overrides):
    overrides = []
    seen = {}
    for item in raw_overrides or []:
        if not isinstance(item, dict):
            raise ScheduleLayoutError("Tilpasninger må være objekter.")
        slot = str(item.get("slot") or "")
        is_open = item.get("open")
        if parse_slot_key(slot) is None:
            raise ScheduleLayoutError(f"Ugyldig tidsluke i tilpasning: {slot}")
        if not isinstance(is_open, bool):
            raise ScheduleLayoutError("Tilpasninger må angi open som true eller false.")
        if slot in seen:
            if seen[slot] == is_open:
                continue
            raise ScheduleLayoutError(
                f"Tidsluken {slot} har motstridende tilpasninger."
            )
        seen[slot] = is_open
        overrides.append({"slot": slot, "open": is_open})
    overrides.sort(key=lambda item: _slot_sort_key(item["slot"]))
    return overrides


def derive_version_two_layout(
    *,
    enabled_slots,
    slot_overrides,
    start_date,
    end_date,
    day_start_minute,
    day_end_minute,
    session_duration,
    chunk_size,
    chunk_break_minutes,
):
    enabled = set(enabled_slots)
    overrides = canonicalize_slot_overrides(slot_overrides)
    grid_slots = set(
        build_grid_slot_keys(
            start_date=start_date,
            end_date=end_date,
            day_start_minute=day_start_minute,
            day_end_minute=day_end_minute,
            session_duration=session_duration,
            chunk_size=chunk_size,
            chunk_break_minutes=chunk_break_minutes,
        )
    )
    outside = enabled - grid_slots
    if outside:
        raise ScheduleLayoutError(
            f"Tidsluken {min(outside, key=_slot_sort_key)} ligger utenfor rutenettet."
        )

    open_overrides = {item["slot"] for item in overrides if item["open"]}
    closed_overrides = {item["slot"] for item in overrides if not item["open"]}
    override_slots = open_overrides | closed_overrides
    outside_overrides = override_slots - grid_slots
    if outside_overrides:
        raise ScheduleLayoutError(
            f"Tilpasningen {min(outside_overrides, key=_slot_sort_key)} ligger utenfor rutenettet."
        )

    base = (enabled - open_overrides) | closed_overrides
    standard_blocks = build_standard_slot_blocks(
        start_date=start_date,
        end_date=end_date,
        day_start_minute=day_start_minute,
        day_end_minute=day_end_minute,
        session_duration=session_duration,
        chunk_size=chunk_size,
        chunk_break_minutes=chunk_break_minutes,
    )
    standard_slots = {slot for block in standard_blocks for slot in block["slots"]}
    if base - standard_slots:
        raise ScheduleLayoutError(
            "Grunnvalget kan bare inneholde tider fra standardblokkene."
        )
    for block in standard_blocks:
        selected = set(block["slots"]) & base
        if selected and selected != set(block["slots"]):
            raise ScheduleLayoutError("Grunnvalget må bestå av hele standardblokker.")

    for item in overrides:
        slot = item["slot"]
        if item["open"] and (slot not in enabled or slot in base):
            raise ScheduleLayoutError(f"Åpen tilpasning for {slot} er overflødig.")
        if not item["open"] and (slot in enabled or slot not in base):
            raise ScheduleLayoutError(f"Stengt tilpasning for {slot} er overflødig.")

    pause_open_slots = sorted(enabled - standard_slots, key=_slot_sort_key)
    pause_blocks = []
    current = []
    previous = None
    for slot in pause_open_slots:
        date_text, minute = _slot_sort_key(slot)
        if previous is not None:
            previous_date, previous_minute = previous
            if (
                date_text != previous_date
                or minute != previous_minute + session_duration
            ):
                pause_blocks.append({"slots": current})
                current = []
        current.append(slot)
        previous = (date_text, minute)
    if current:
        pause_blocks.append({"slots": current})

    resolved_blocks = [*standard_blocks, *pause_blocks]
    resolved_blocks.sort(key=lambda block: _slot_sort_key(block["slots"][0]))
    membership = {}
    for block_index, block in enumerate(resolved_blocks):
        for slot in block["slots"]:
            if slot in enabled:
                if slot in membership:
                    raise ScheduleLayoutError(
                        f"Tidsluken {slot} tilhører flere løserblokker."
                    )
                membership[slot] = block_index
    missing = enabled - set(membership)
    if missing:
        raise ScheduleLayoutError(
            f"Tidsluken {min(missing, key=_slot_sort_key)} mangler en løserblokk."
        )

    return {
        "block_mode": "manual" if overrides else "standard",
        "base_slots": sorted(base, key=_slot_sort_key),
        "slot_overrides": overrides,
        "resolved_blocks": resolved_blocks,
    }
