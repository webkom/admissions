"""Bounded, activity-driven session renewal.

`SESSION_COOKIE_AGE` runs from login rather than from last activity, because
`SESSION_SAVE_EVERY_REQUEST` is off. An applicant writing for longer than the
window is therefore guaranteed to fail at submit.

Turning `SESSION_SAVE_EVERY_REQUEST` on is not the fix: the frontend polls the
admission every 15 seconds and the admin views every 5, and `SessionMiddleware`
renews on any request regardless of what the view does, so an open tab would
renew forever with nobody present. Instead the views that represent a real
human action call `renew_session` explicitly, and renewal stops at a ceiling.
"""

from datetime import datetime

from django.conf import settings
from django.contrib.sessions.models import Session
from django.utils import timezone

SESSION_STARTED_AT_KEY = "_session_started_at"

DEFAULT_SESSION_MAX_LIFETIME = 12 * 60 * 60


def stamp_session_start(session):
    """Record when this session began, so renewal can be capped."""

    if session is None:
        return
    session[SESSION_STARTED_AT_KEY] = timezone.now().isoformat()


def _session_max_lifetime():
    return getattr(
        settings,
        "ADMISSIONS_SESSION_MAX_LIFETIME",
        DEFAULT_SESSION_MAX_LIFETIME,
    )


def renew_session(request):
    """Slide the expiry window forward, up to a hard ceiling from login.

    Marks the session modified rather than calling ``set_expiry``. ``set_expiry``
    writes ``_session_expiry``, which makes ``get_expire_at_browser_close()``
    return False and gives the cookie a Max-Age -- silently defeating
    ``SESSION_EXPIRE_AT_BROWSER_CLOSE``. Marking it modified makes
    ``SessionStore.save()`` recompute ``expire_date`` from ``SESSION_COOKIE_AGE``
    while the cookie stays a browser-session cookie.

    Returns True when the window moved.
    """

    session = getattr(request, "session", None)
    if session is None or not session.session_key:
        return False

    started_at_raw = session.get(SESSION_STARTED_AT_KEY)
    if started_at_raw is None:
        # A session predating this feature: adopt it from now so it is capped
        # from here rather than renewed indefinitely.
        stamp_session_start(session)
        return True

    started_at = timezone.datetime.fromisoformat(started_at_raw)
    if timezone.is_naive(started_at):
        started_at = timezone.make_aware(started_at)

    if (timezone.now() - started_at).total_seconds() >= _session_max_lifetime():
        return False

    session.modified = True
    return True


def session_expires_at(request):
    """The session's real expiry, or None when there is nothing to report.

    Not ``session.get_expiry_date()``. That returns ``_session_expiry`` when
    set and otherwise falls back to ``now() + SESSION_COOKIE_AGE``, computed
    at call time - and ``renew_session`` above deliberately never writes
    ``_session_expiry``, precisely so the cookie stays a browser-session
    cookie. The fallback was therefore always what the caller got, so every
    page render reported a full untouched window no matter how old the
    session actually was, and the client-side warning could never fire.

    ``expire_date`` on the stored row is the value the server will actually
    enforce, and ``SessionStore.save()`` recomputes it on each renewal, so it
    also reflects renewals correctly.
    """

    session = getattr(request, "session", None)
    session_key = getattr(session, "session_key", None)
    if not session_key:
        return None

    explicit_expiry = session.get("_session_expiry")
    if isinstance(explicit_expiry, datetime):
        return explicit_expiry

    try:
        return (
            Session.objects.filter(session_key=session_key)
            .values_list("expire_date", flat=True)
            .first()
        )
    except Exception:
        # A non-database session backend has no such row. Reporting nothing
        # degrades to "no warning", which is strictly better than reporting a
        # window that is not the one being enforced.
        return None
