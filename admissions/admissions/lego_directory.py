"""Member lookup against LEGO's search, on behalf of the signed-in user.

Runs on the interviewer's own OAuth token rather than a standing credential, so
admissions holds no authority of its own and a lookup can never see more than
the person performing it. LEGO filters every hit through its own permission
check before returning it.

Requires LEGO to allow `user`-scoped tokens on /api/v1/search-autocomplete/
(branch oauth-user-scope-autocomplete). Until that ships the token authenticates
as anonymous and the endpoint returns an empty list, which is why an empty
result and a missing authorisation are reported differently below.
"""

from django.conf import settings

import requests
from social_django.models import UserSocialAuth
from structlog import get_logger

log = get_logger()

AUTOCOMPLETE_PATH = "/api/v1/search-autocomplete/"
USER_CONTENT_TYPE = "users.user"
# Connect and read. A name lookup that takes longer than this is useless to
# someone typing, and the availability form must never block on it.
TIMEOUT = (2, 3)
MAX_RESULTS = 10


class DirectoryUnavailable(Exception):
    """LEGO could not be reached, or answered with an error."""


class DirectoryAuthenticationRequired(Exception):
    """The user's LEGO token is missing, expired, or lacks the scope."""


def _access_token(user):
    social = UserSocialAuth.objects.filter(user=user, provider="lego").first()
    if social is None:
        raise DirectoryAuthenticationRequired
    token = (social.extra_data or {}).get("access_token")
    if not token:
        raise DirectoryAuthenticationRequired
    return token


def _base_url():
    url = getattr(settings, "SOCIAL_AUTH_LEGO_API_URL", None)
    if not url:
        raise DirectoryUnavailable("LEGO API URL is not configured")
    return url.rstrip("/")


def search_members(user, query):
    """Return up to MAX_RESULTS members matching `query`.

    Only the fields needed to recognise and record a person are returned; the
    rest of LEGO's payload is discarded rather than passed through.
    """

    token = _access_token(user)
    try:
        response = requests.post(
            f"{_base_url()}{AUTOCOMPLETE_PATH}",
            json={"query": query, "types": [USER_CONTENT_TYPE]},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
    except requests.RequestException as error:
        raise DirectoryUnavailable(str(error)) from error

    if response.status_code in (401, 403):
        raise DirectoryAuthenticationRequired
    if response.status_code >= 400:
        raise DirectoryUnavailable(f"LEGO responded {response.status_code}")

    try:
        payload = response.json()
    except ValueError as error:
        raise DirectoryUnavailable("LEGO returned a malformed response") from error
    if not isinstance(payload, list):
        raise DirectoryUnavailable("LEGO returned an unexpected shape")

    results = []
    for hit in payload[:MAX_RESULTS]:
        if not isinstance(hit, dict) or hit.get("content_type") != USER_CONTENT_TYPE:
            continue
        lego_user_id = hit.get("id")
        if not isinstance(lego_user_id, int):
            continue
        results.append(
            {
                "lego_user_id": lego_user_id,
                "username": hit.get("username") or "",
                "full_name": hit.get("full_name") or "",
                "profile_picture": hit.get("profile_picture") or "",
            }
        )
    return results
