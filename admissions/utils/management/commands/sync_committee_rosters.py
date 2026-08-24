"""Mirror each participating committee's LEGO roster into CommitteeRosterEntry.

Admissions only learns that someone exists when they sign in, because
membership arrives in their own OAuth payload. That makes the availability
roster self-selecting: it lists the people who already turned up, and silently
omits the ones an admin actually needs to chase. This command closes that gap
by asking LEGO directly who is in each committee.

The people it discovers get a local LegoUser row so the rest of the app can
refer to them by the same id as everyone else, but deliberately **no**
Membership row: Membership is the authorization snapshot and stays sourced from
the user's own login. A synced person can therefore be displayed, chased, and
marked as not participating, but gains no access of their own until they sign
in and LEGO tells admissions who they are first-hand.

Runs on the shared read-only service credential (see
`admissions.utils.lego_service`), never in the request path, and exits cleanly
when that credential is not provisioned.
"""

from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction
from django.utils import timezone

from structlog import get_logger

from admissions.admissions.constants import INACTIVE_MEMBERSHIP_ROLES
from admissions.admissions.models import (
    Admission,
    CommitteeRosterEntry,
    Group,
    LegoUser,
)
from admissions.utils.lego_service import (
    LegoServiceUnavailable,
    access_token,
    fetch_group_members,
    get_credential,
)

log = get_logger()


def _groups_to_sync():
    """Committees taking part in an admission that is not long over.

    Scoped rather than "every Group we know": there is no reason to hold a
    roster for a committee nobody is recruiting for, and the sync cost is one
    paginated LEGO call per group.
    """

    return Group.objects.filter(
        pk__in=Admission.objects.filter(closed_from__gte=timezone.now())
        .values_list("groups", flat=True)
        .distinct()
    )


def _upsert_user(lego_user_id, info):
    """Find or create the local row standing in for this LEGO person.

    Matched on lego_id, the same key `use_existing_lego_user` uses in the OAuth
    pipeline, so when this person finally signs in they land on this exact row
    rather than a duplicate - and their availability, if an admin recorded any
    on their behalf, is already theirs.

    An existing row is never overwritten from here. It was populated from that
    person's own login payload, which is both fresher and more complete than
    LEGO's public serializer (which carries no primary email address at all).
    """

    user = LegoUser.objects.filter(lego_id=lego_user_id).first()
    if user is not None:
        return user, False

    def build(username):
        candidate = LegoUser(
            lego_id=lego_user_id,
            username=username[:150],
            first_name=info["first_name"][:150],
            last_name=info["last_name"][:150],
            email=info["email"][:254],
            gender=info["gender"][:50],
        )
        # No password is ever usable on these rows: the only way in is LEGO
        # OAuth, which resolves to this same row by lego_id.
        candidate.set_unusable_password()
        return candidate

    lego_username = info["username"] or f"lego-{lego_user_id}"
    try:
        # Its own savepoint: a username collision otherwise poisons the
        # caller's transaction and costs the whole committee its sync.
        with transaction.atomic():
            user = build(lego_username)
            user.save()
    except IntegrityError:
        # Username is unique locally but is not the identity here; lego_id is.
        # A collision means a stale local row still holds this name, so fall
        # back to one that cannot collide rather than dropping the person.
        user = build(f"lego-{lego_user_id}")
        user.save()
    return user, True


def sync_committee_rosters():
    """Refresh every relevant committee roster. Returns groups synced, or None."""

    credential = get_credential()
    if credential is None:
        log.info(
            "committee_roster_sync_skipped",
            reason="no ADMISSIONS_ROSTER_SYNC credential configured",
        )
        return None
    api_url, client_id, client_secret = credential

    groups = list(_groups_to_sync())
    if not groups:
        log.info("committee_roster_sync_skipped", reason="no open admissions")
        return 0

    try:
        token = access_token(api_url, client_id, client_secret)
    except LegoServiceUnavailable as error:
        log.error("committee_roster_sync_failed", error=str(error))
        return None

    synced_groups = 0
    for group in groups:
        try:
            members = fetch_group_members(
                api_url,
                token,
                group.lego_id,
                context=f" listing members of '{group.name}'",
            )
        except LegoServiceUnavailable as error:
            # One unreachable committee must not cost the others their sync,
            # and must never be read as "this committee is empty now".
            log.error(
                "committee_roster_sync_group_failed",
                group=group.name,
                error=str(error),
            )
            continue

        # Retirees and dormant memberships are dropped here rather than at
        # display time: a committee keeps its retirees in LEGO indefinitely, so
        # syncing them would bury the handful of people who genuinely still owe
        # an answer under a list of people who left years ago. Someone whose
        # own login payload says retiree is unaffected - that path is
        # Membership-based and deliberately keeps them (see
        # get_eligible_interviewer_ids).
        members = {
            lego_user_id: info
            for lego_user_id, info in members.items()
            if info["is_active"] and info["role"] not in INACTIVE_MEMBERSHIP_ROLES
        }

        if not members:
            log.warning(
                "committee_roster_sync_group_empty",
                group=group.name,
                reason="LEGO listed no active members; keeping the existing roster",
            )
            continue

        with transaction.atomic():
            seen_user_ids = []
            created_users = 0
            for lego_user_id, info in members.items():
                user, created = _upsert_user(lego_user_id, info)
                created_users += int(created)
                CommitteeRosterEntry.objects.update_or_create(
                    group=group,
                    user=user,
                    defaults={"role": info["role"]},
                )
                seen_user_ids.append(user.pk)
            # Someone LEGO no longer lists has left the committee. Dropping the
            # roster row only stops them being chased for availability; it
            # never touches their Membership, their answers, or anything they
            # are already scheduled for.
            CommitteeRosterEntry.objects.filter(group=group).exclude(
                user_id__in=seen_user_ids
            ).delete()

        synced_groups += 1
        log.info(
            "committee_roster_synced",
            group=group.name,
            members=len(members),
            new_users=created_users,
        )

    return synced_groups


class Command(BaseCommand):
    help = "Mirror participating committees' LEGO rosters into CommitteeRosterEntry."

    def handle(self, *args, **options):
        sync_committee_rosters()
