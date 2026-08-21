"""Nightly sync of first-year students into DirectoryEntry, for decoy fillers.

Runs on a narrow, read-only LEGO service credential (OAuth2 client-credentials
grant) kept entirely out of the request path - it is never used to serve a
live request, only to populate the table this reads from ahead of time. Safe
to run in any environment, including one where the credential has not been
provisioned yet: it logs why and exits cleanly rather than failing, since a
missing roster should never break a deploy or a cron schedule.

Provisioning that credential (creating a confidential OAuth2 application in
LEGO's admin with the client-credentials grant enabled, scoped to read groups
and memberships) is an operational step outside this codebase - see the
decoy-token design notes for why it must stay out of any interviewer-facing
request.
"""

from urllib.parse import urljoin

from django.conf import settings
from django.core.management.base import BaseCommand

import requests
from structlog import get_logger

from admissions.admissions.models import DirectoryEntry

log = get_logger()

FIRST_YEAR_GROUP_NAMES = (
    "1. klasse Datateknologi",
    "1. klasse Kommunikasjonsteknologi",
)
TIMEOUT = (5, 15)


class RosterSyncUnavailable(Exception):
    """The credential is missing, or LEGO could not be reached."""


def _access_token(api_url, client_id, client_secret):
    response = requests.post(
        urljoin(api_url, "/authorization/oauth2/token/"),
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=TIMEOUT,
    )
    if response.status_code >= 400:
        raise RosterSyncUnavailable(
            f"LEGO rejected the roster-sync credential ({response.status_code})"
        )
    token = response.json().get("access_token")
    if not token:
        raise RosterSyncUnavailable("LEGO's token response had no access_token")
    return token


def _fetch_first_year_members(api_url, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    # A single combined query isn't guaranteed to be supported, so each
    # group is looked up and its memberships paged through individually.
    members = {}
    for group_name in FIRST_YEAR_GROUP_NAMES:
        response = requests.get(
            urljoin(api_url, "/api/v1/groups/"),
            params={"name": group_name},
            headers=headers,
            timeout=TIMEOUT,
        )
        if response.status_code >= 400:
            raise RosterSyncUnavailable(
                f"LEGO responded {response.status_code} looking up '{group_name}'"
            )
        groups = [
            group
            for group in response.json().get("results", [])
            if group.get("name") == group_name
        ]
        for group in groups:
            url = urljoin(api_url, f"/api/v1/groups/{group['id']}/memberships/")
            while url:
                membership_response = requests.get(
                    url, headers=headers, timeout=TIMEOUT
                )
                if membership_response.status_code >= 400:
                    raise RosterSyncUnavailable(
                        f"LEGO responded {membership_response.status_code} "
                        f"listing memberships for '{group_name}'"
                    )
                payload = membership_response.json()
                for membership in payload.get("results", []):
                    member = membership.get("user") or {}
                    lego_user_id = member.get("id")
                    if not isinstance(lego_user_id, int):
                        continue
                    members[lego_user_id] = {
                        "username": member.get("username") or "",
                        "full_name": member.get("full_name") or "",
                    }
                url = payload.get("next")
    return members


class Command(BaseCommand):
    help = "Sync first-year students into DirectoryEntry for decoy fillers."

    def handle(self, *args, **options):
        client_id = getattr(settings, "ADMISSIONS_ROSTER_SYNC_CLIENT_ID", "")
        client_secret = getattr(settings, "ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET", "")
        api_url = getattr(settings, "SOCIAL_AUTH_LEGO_API_URL", "")
        if not client_id or not client_secret:
            log.info(
                "roster_sync_skipped",
                reason="no ADMISSIONS_ROSTER_SYNC credential configured",
            )
            return
        if not api_url:
            log.info("roster_sync_skipped", reason="no LEGO API URL configured")
            return

        try:
            access_token = _access_token(api_url, client_id, client_secret)
            members = _fetch_first_year_members(api_url, access_token)
        except (RosterSyncUnavailable, requests.RequestException) as error:
            log.error("roster_sync_failed", error=str(error))
            return

        seen_ids = set(members)
        for lego_user_id, info in members.items():
            DirectoryEntry.objects.update_or_create(
                lego_user_id=lego_user_id,
                defaults={
                    "username": info["username"],
                    "full_name": info["full_name"],
                },
            )
        stale = DirectoryEntry.objects.exclude(lego_user_id__in=seen_ids)
        stale_count = stale.count()
        stale.delete()
        log.info(
            "roster_sync_completed",
            synced=len(members),
            removed=stale_count,
        )
