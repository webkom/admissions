def remove_sensitive_data(event, _hint):
    filtered = {
        key: event[key]
        for key in (
            "event_id",
            "timestamp",
            "platform",
            "level",
            "logger",
            "release",
            "environment",
        )
        if key in event
    }
    values = []
    for value in (event.get("exception") or {}).get("values") or []:
        stacktrace = value.get("stacktrace") or {}
        frames = []
        for frame in stacktrace.get("frames") or []:
            frames.append(
                {
                    key: frame[key]
                    for key in (
                        "filename",
                        "function",
                        "module",
                        "lineno",
                        "colno",
                        "in_app",
                    )
                    if key in frame
                }
            )
        sanitized = {
            "type": value.get("type"),
            "value": value.get("type") or "Server error",
        }
        if frames:
            sanitized["stacktrace"] = {"frames": frames}
        values.append(sanitized)
    if values:
        filtered["exception"] = {"values": values}
    return filtered
