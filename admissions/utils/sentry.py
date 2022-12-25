SENSITIVE_FIELDS = ("applications", "text")


def filter_keys_recursive(d, field_names):
    for k, v in d.items():
        if isinstance(v, dict):
            filter_keys_recursive(v, field_names)
        if k.lower() in field_names:
            d[k] = "[filtered]"


def remove_sensitive_data(event, hint):
    filter_keys_recursive(event, SENSITIVE_FIELDS)
    return event
