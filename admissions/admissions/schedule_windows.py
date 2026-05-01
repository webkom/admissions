from collections import defaultdict
from datetime import date


def _date_string(value):
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def parse_slot_key(key):
    if "|" in key:
        separator = key.rfind("|")
    else:
        separator = key.rfind(":")

    if separator == -1:
        return None

    slot_date = key[:separator]
    try:
        minute = int(key[separator + 1 :])
    except ValueError:
        return None

    return slot_date, minute


def make_slot_key(slot_date, minute):
    return f"{_date_string(slot_date)}|{minute}"


def normalize_enabled_windows(windows):
    by_date = defaultdict(list)
    for window in windows or []:
        try:
            slot_date = _date_string(window["date"])
            start_minute = int(window.get("start_minute", window.get("startMinute")))
            end_minute = int(window.get("end_minute", window.get("endMinute")))
        except (TypeError, ValueError, KeyError):
            continue

        if 0 <= start_minute < end_minute <= 24 * 60:
            by_date[slot_date].append((start_minute, end_minute))

    normalized = []
    for slot_date in sorted(by_date):
        intervals = sorted(by_date[slot_date])
        merged = []
        for start_minute, end_minute in intervals:
            if not merged or start_minute > merged[-1][1]:
                merged.append([start_minute, end_minute])
            else:
                merged[-1][1] = max(merged[-1][1], end_minute)

        normalized.extend(
            {
                "date": slot_date,
                "start_minute": start_minute,
                "end_minute": end_minute,
            }
            for start_minute, end_minute in merged
        )

    return normalized


def slots_to_enabled_windows(slot_keys, session_duration):
    duration = max(int(session_duration or 60), 1)
    by_date = defaultdict(list)

    for key in slot_keys or []:
        parsed = parse_slot_key(str(key))
        if not parsed:
            continue
        slot_date, minute = parsed
        by_date[slot_date].append((minute, minute + duration))

    windows = []
    for slot_date in sorted(by_date):
        windows.extend(
            {
                "date": slot_date,
                "start_minute": start_minute,
                "end_minute": end_minute,
            }
            for start_minute, end_minute in by_date[slot_date]
        )

    return normalize_enabled_windows(windows)


def enabled_windows_to_slots(windows, session_duration):
    duration = max(int(session_duration or 60), 1)
    slots = []

    for window in normalize_enabled_windows(windows):
        slot_date = window["date"]
        minute = window["start_minute"]
        while minute + duration <= window["end_minute"]:
            slots.append(make_slot_key(slot_date, minute))
            minute += duration

    return slots


def slot_intervals_cover(intervals, start_minute, end_minute):
    cursor = start_minute
    for interval_start, interval_end in sorted(intervals):
        if interval_end <= cursor:
            continue
        if interval_start > cursor:
            return False
        cursor = max(cursor, interval_end)
        if cursor >= end_minute:
            return True
    return False


def remap_slots_between_durations(old_slots, old_duration, new_windows, new_duration):
    old_windows = slots_to_enabled_windows(old_slots, old_duration)
    old_intervals = defaultdict(list)
    for window in old_windows:
        old_intervals[window["date"]].append(
            (window["start_minute"], window["end_minute"])
        )

    remapped = []
    for key in enabled_windows_to_slots(new_windows, new_duration):
        parsed = parse_slot_key(key)
        if not parsed:
            continue
        slot_date, minute = parsed
        end_minute = minute + max(int(new_duration or 60), 1)
        if slot_intervals_cover(old_intervals[slot_date], minute, end_minute):
            remapped.append(key)

    return remapped
