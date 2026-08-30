from urllib.parse import urlparse


def connect_src_origin(url):
    """Return the CSP host-source for ``url``, or None if it isn't usable.

    A CSP source expression is scheme + host + optional port only. Sentry DSNs
    carry the public key as userinfo (``https://<key>@o1.ingest.sentry.io/2``),
    and ``urlparse().netloc`` keeps it - emitting ``https://<key>@host``, which
    browsers discard as an invalid source expression. Every envelope POST then
    gets blocked and frontend error reporting goes silently dead, so build the
    origin from hostname/port instead.
    """
    parsed = urlparse(url or "")
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    origin = f"{parsed.scheme}://{parsed.hostname}"
    if parsed.port:
        origin = f"{origin}:{parsed.port}"
    return origin
