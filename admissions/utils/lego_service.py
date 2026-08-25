"""Server-to-server LEGO reads on the narrow, read-only service credential.

This is the only way admissions can learn anything about a person who has not
signed in here yet. A member's own OAuth token cannot help: admissions asks
LEGO for the ``user`` scope, and LEGO only honours that scope on two hardcoded
paths (``oauth2_userdata`` and ``search-autocomplete``) - see
``lego/apps/oauth/authentication.py``. Everything else needs a token LEGO
accepts for ``all``, which is what the client-credentials application provides.

That credential is deliberately kept out of the request path. Nothing here is
ever called while serving a browser request; callers are management commands
and the solver worker's maintenance cycle, which populate local tables ahead of
time. Serving a live request from a credential more privileged than the person
making the request is exactly the mistake this separation exists to prevent.

Every helper raises `LegoServiceUnavailable` rather than returning a partial
result, so a caller can never mistake "LEGO was unreachable" for "LEGO says
this group is empty" - the difference between keeping a roster and wiping it.
"""

from urllib.parse import urljoin

from django.conf import settings

import requests
from structlog import get_logger

log = get_logger()

# Connect and read. Generous compared to the request-path timeouts in
# lego_directory.py: nothing is waiting on these, and half a synced roster is
# worse than a slow one.
TIMEOUT = (5, 15)
# LEGO's group list is unpaginated, but membership pages are not. A ceiling on
# pages stops a pagination bug upstream from spinning here forever.
MAX_PAGES = 200


class LegoServiceUnavailable(Exception):
    """The credential is missing or rejected, or LEGO could not be reached."""


def get_credential():
    """Return (api_url, client_id, client_secret), or None when unconfigured.

    Unconfigured is a normal state, not an error: an environment without the
    credential provisioned should degrade to "no synced data" rather than
    failing a deploy or a worker cycle.
    """

    client_id = getattr(settings, "ADMISSIONS_ROSTER_SYNC_CLIENT_ID", "")
    client_secret = getattr(settings, "ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET", "")
    api_url = getattr(settings, "SOCIAL_AUTH_LEGO_API_URL", "")
    if not client_id or not client_secret:
        return None
    if not api_url:
        return None
    return api_url, client_id, client_secret


def access_token(api_url, client_id, client_secret):
    try:
        response = requests.post(
            urljoin(api_url, "/authorization/oauth2/token/"),
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            timeout=TIMEOUT,
        )
    except requests.RequestException as error:
        raise LegoServiceUnavailable(str(error)) from error
    if response.status_code >= 400:
        raise LegoServiceUnavailable(
            f"LEGO rejected the roster-sync credential ({response.status_code})"
        )
    try:
        token = response.json().get("access_token")
    except ValueError as error:
        raise LegoServiceUnavailable("LEGO returned a malformed token response") from (
            error
        )
    if not token:
        raise LegoServiceUnavailable("LEGO's token response had no access_token")
    return token


def result_list(payload):
    """An unpaginated LEGO viewset (like /api/v1/groups/) returns a bare JSON
    array; a paginated one wraps it in {"results": [...]}."""

    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        results = payload.get("results")
        return results if isinstance(results, list) else []
    return []


def _get_json(url, token, params=None, context=""):
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as error:
        raise LegoServiceUnavailable(str(error)) from error
    if response.status_code >= 400:
        raise LegoServiceUnavailable(f"LEGO responded {response.status_code}{context}")
    try:
        return response.json()
    except ValueError as error:
        raise LegoServiceUnavailable(
            f"LEGO returned a malformed response{context}"
        ) from error


def iter_results(url, token, params=None, context=""):
    """Yield every item across LEGO's `next` pages."""

    pages = 0
    seen = set()
    while url and url not in seen and pages < MAX_PAGES:
        seen.add(url)
        pages += 1
        payload = _get_json(url, token, params=params, context=context)
        yield from result_list(payload)
        url = payload.get("next") if isinstance(payload, dict) else None
        # `next` already carries the query string; re-sending params would
        # double them up.
        params = None
    if pages >= MAX_PAGES:
        raise LegoServiceUnavailable(f"LEGO paginated past {MAX_PAGES} pages{context}")


def find_group_ids(api_url, token, names):
    """Map each requested LEGO group name to its id.

    Filtered client-side on purpose: LEGO's AbakusGroupFilterSet only supports
    `type`, so a `name` query parameter is silently ignored and the endpoint
    answers with every group. Names missing from the answer are reported by
    their absence, so a caller can warn about a rename instead of quietly
    syncing a smaller roster.
    """

    wanted = set(names)
    payload = _get_json(
        urljoin(api_url, "/api/v1/groups/"), token, context=" listing groups"
    )
    found = {}
    for group in result_list(payload):
        if not isinstance(group, dict):
            continue
        name = group.get("name")
        group_id = group.get("id")
        if name in wanted and isinstance(group_id, int):
            found[name] = group_id
    return found


def _member_fields(user):
    """The fields admissions keeps from LEGO's PublicUserSerializer.

    Everything else in the payload is dropped rather than mirrored: this table
    exists to show a name, not to become a second copy of LEGO's user
    directory. `email` is not in LEGO's public serializer at all, so the
    internal (@abakus.no) address is the only one available for someone who
    has never signed in here.
    """

    return {
        "username": user.get("username") or "",
        "full_name": user.get("fullName") or user.get("full_name") or "",
        "first_name": user.get("firstName") or user.get("first_name") or "",
        "last_name": user.get("lastName") or user.get("last_name") or "",
        "gender": user.get("gender") or "",
        "email": (
            user.get("internalEmailAddress") or user.get("internal_email_address") or ""
        ),
    }


def fetch_group_members(api_url, token, group_id, context=""):
    """Return {lego_user_id: {...fields, "role": ..., "is_active": bool}}.

    Keyed by LEGO user id because that is the only identifier that is both
    unique and stable across a username change.
    """

    members = {}
    url = urljoin(api_url, f"/api/v1/groups/{group_id}/memberships/")
    for membership in iter_results(url, token, context=context):
        if not isinstance(membership, dict):
            continue
        user = membership.get("user")
        if not isinstance(user, dict):
            continue
        lego_user_id = user.get("id")
        if not isinstance(lego_user_id, int) or lego_user_id <= 0:
            continue
        role = membership.get("role")
        members[lego_user_id] = {
            **_member_fields(user),
            "role": role if isinstance(role, str) and role else "member",
            # LEGO defaults this to True; only an explicit False means the
            # membership is dormant.
            "is_active": membership.get("is_active") is not False,
        }
    return members
