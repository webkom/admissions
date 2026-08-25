"""Sync the student roster into DirectoryEntry, for conflict-review decoys.

Runs on the narrow, read-only LEGO service credential shared with the other
syncs (see `admissions.utils.lego_service`) - never in the request path. Safe
to run in any environment, including one where the credential has not been
provisioned yet: it logs why and exits cleanly rather than failing, since a
missing roster should never break a deploy or a cron schedule.

The pool covers every grade group, not just the first years. A decoy is only
cover if a real applicant could plausibly have been drawn in its place, so a
pool narrower than the applicant population is worse than useless: while it was
first-year-only, any second-year name in a review list was guaranteed to be a
real applicant, which is precisely the inference decoys exist to prevent.

Provisioning the credential (a confidential OAuth2 application in LEGO's admin
with the client-credentials grant, whose owning user may list group
memberships) is an operational step outside this codebase.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from structlog import get_logger

from admissions.admissions.models import DirectoryEntry
from admissions.utils.lego_service import (
    LegoServiceUnavailable,
    access_token,
    fetch_group_members,
    find_group_ids,
    get_credential,
)

log = get_logger()

DEFAULT_POOL_GROUPS = (
    "1. klasse Datateknologi",
    "2. klasse Datateknologi",
    "3. klasse Datateknologi",
    "4. klasse Datateknologi",
    "5. klasse Datateknologi",
    "1. klasse Kommunikasjonsteknologi",
    "2. klasse Kommunikasjonsteknologi",
    "3. klasse Kommunikasjonsteknologi",
    "4. klasse Kommunikasjonsteknologi",
    "5. klasse Kommunikasjonsteknologi",
)


def sync_directory_entries():
    """Refresh DirectoryEntry from LEGO. Returns the number of people synced.

    Returns None when there is nothing to do or LEGO could not be reached, so
    a caller can tell "no sync happened" from "the roster is genuinely empty".
    """

    credential = get_credential()
    if credential is None:
        log.info(
            "roster_sync_skipped",
            reason="no ADMISSIONS_ROSTER_SYNC credential configured",
        )
        return None
    api_url, client_id, client_secret = credential

    group_names = list(
        getattr(settings, "ADMISSIONS_DECOY_POOL_GROUPS", None) or DEFAULT_POOL_GROUPS
    )

    try:
        token = access_token(api_url, client_id, client_secret)
        group_ids = find_group_ids(api_url, token, group_names)
        for name in group_names:
            if name not in group_ids:
                # The names are school-year specific; a rename must surface
                # loudly, not as a quietly shrinking roster.
                log.warning("roster_sync_group_missing", group=name)
        members = {}
        for name, group_id in group_ids.items():
            members.update(
                fetch_group_members(
                    api_url, token, group_id, context=f" listing members of '{name}'"
                )
            )
    except LegoServiceUnavailable as error:
        log.error("roster_sync_failed", error=str(error))
        return None

    if not members:
        # An empty result is far more likely a renamed group than a year with
        # no students - keep the existing roster.
        log.warning(
            "roster_sync_empty",
            reason="sync returned no members; keeping the existing roster",
        )
        return None

    for lego_user_id, info in members.items():
        DirectoryEntry.objects.update_or_create(
            lego_user_id=lego_user_id,
            defaults={
                "username": info["username"],
                "full_name": info["full_name"],
            },
        )
    stale = DirectoryEntry.objects.exclude(lego_user_id__in=set(members))
    stale_count = stale.count()
    stale.delete()
    log.info("roster_sync_completed", synced=len(members), removed=stale_count)
    return len(members)


class Command(BaseCommand):
    help = "Sync the student roster into DirectoryEntry for conflict-review decoys."

    def handle(self, *args, **options):
        sync_directory_entries()
