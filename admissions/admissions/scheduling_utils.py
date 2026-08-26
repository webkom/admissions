import random
import uuid
from datetime import datetime, timedelta

from django.conf import settings

from admissions.admissions import constants
from admissions.admissions.models import (
    CommitteeRosterEntry,
    DirectoryEntry,
    FadderbarnDeclaration,
    InterviewAvailability,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.schedule_windows import make_slot_key, parse_slot_key


def conflict_review_v2_enabled():
    """Kill switch for derived conflicts, review lists, and the repair-mode
    hard exclusion built on top of them. Off falls back to manually-declared
    conflicts only - there is no older mechanism to fall back to."""
    return getattr(settings, "ADMISSIONS_CONFLICT_REVIEW_V2", True)


def panel_gender_code(lego_gender):
    return constants.LEGO_GENDER_TO_PANEL_CODE.get(lego_gender or "", "")


def get_committee_interviewer_ids(group):
    """The committee's own people: everyone Membership knows plus the LEGO
    roster.

    Membership only covers people who have signed in here at least once,
    because signing in is the only thing that writes a Membership row.
    CommitteeRosterEntry, mirrored from LEGO by sync_committee_rosters, covers
    the rest - but only for participating committees and only as far as the
    last sync reached, so neither source is complete alone.

    This is the roster that answers "who is in this committee": it is scoped
    to the one committee, so nobody else's members can appear in it.
    """

    member_ids = set(
        Membership.objects.filter(group=group).values_list("user_id", flat=True)
    )
    roster_ids = set(
        CommitteeRosterEntry.objects.filter(group=group).values_list(
            "user_id", flat=True
        )
    )
    return member_ids | roster_ids


def get_responding_interviewer_ids(admission, group):
    """Everyone whose answer this committee can actually wait for: its own
    signed-in members.

    Kept apart from the wider sets around it because this is the set
    publication may demand a response from. Someone mirrored from LEGO who has
    never opened admissions can neither submit availability nor opt out, so
    counting them here would deadlock the publish behind people who will never
    answer - an admin records their answer on their behalf instead. The same
    reasoning applies to admission admin-group members who are not in this
    committee: they appear on none of its rosters, so requiring their answer
    would block every committee's publish forever.
    """

    return set(Membership.objects.filter(group=group).values_list("user_id", flat=True))


def get_eligible_interviewer_ids(admission, group):
    """The committee's own people, plus the admission's admin groups.

    The admin groups stay in deliberately: Webkom (the admin group running the
    shared tool) may sit on any committee's panels and record answers on
    behalf of its interviewers, so they must remain legitimate panel members
    here even though they owe the committee no availability answer (see
    get_responding_interviewer_ids) and appear on none of its rosters.

    Widening this set grants no authority: every permission check reads
    Membership directly (see admission_access), never this function. What it
    decides is who may sit on a panel and who an admin may record an answer
    on behalf of - the "who has not answered" display is the committee-scoped
    set above.
    """

    admin_ids = set(
        Membership.objects.filter(group__in=admission.admin_groups.all()).values_list(
            "user_id", flat=True
        )
    )
    return get_committee_interviewer_ids(group) | admin_ids


def availability_submission_is_current(availability, saved_schedule):
    if availability is None:
        return False
    current_generation = (
        saved_schedule.availability_generation if saved_schedule is not None else 1
    )
    if availability.submitted_grid_generation == current_generation:
        return True
    return bool(
        availability.submitted_grid_generation is None
        and (
            saved_schedule is None
            or saved_schedule.layout_version == 1
            or not saved_schedule.resolved_blocks
        )
    )


def get_interviewer_participation(admission, group, saved_schedule=None):
    """Resolve the full roster without conflating membership with planning.

    A missing or stale availability response remains awaiting. Explicit opt-out
    is durable, while a current submission always means participating.
    """

    if saved_schedule is None:
        saved_schedule = SavedSchedule.objects.filter(
            admission=admission, group=group
        ).first()
    roster_ids = get_eligible_interviewer_ids(admission, group)
    rows = {
        row.user_id: row
        for row in InterviewAvailability.objects.filter(
            admission=admission,
            group=group,
            user_id__in=roster_ids,
        )
    }
    resolved = {}
    for user_id in roster_ids:
        row = rows.get(user_id)
        if (
            row is not None
            and row.participation
            == InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
        ):
            resolved[user_id] = InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
        elif availability_submission_is_current(row, saved_schedule):
            resolved[user_id] = InterviewAvailability.PARTICIPATION_PARTICIPATING
        else:
            resolved[user_id] = InterviewAvailability.PARTICIPATION_AWAITING
    return resolved


def get_participating_interviewer_ids(admission, group, saved_schedule=None):
    return {
        user_id
        for user_id, participation in get_interviewer_participation(
            admission, group, saved_schedule
        ).items()
        if participation == InterviewAvailability.PARTICIPATION_PARTICIPATING
    }


def get_unresolved_interviewer_ids(admission, group, saved_schedule=None):
    return {
        user_id
        for user_id, participation in get_interviewer_participation(
            admission, group, saved_schedule
        ).items()
        if participation == InterviewAvailability.PARTICIPATION_AWAITING
    }


def user_has_interview_availability(admission, group, user_id):
    return (
        InterviewAvailability.objects.filter(
            admission=admission,
            group=group,
            user_id=user_id,
        )
        .exclude(slots=[])
        .exists()
    )


def get_proposed_candidate_ids_by_interviewer(saved_schedule=None, schedule=None):
    proposed = {}
    if schedule is None:
        schedule = saved_schedule.schedule if saved_schedule is not None else None
    if not isinstance(schedule, list):
        return proposed

    for assignment in schedule:
        if not isinstance(assignment, dict):
            continue
        candidate_id = assignment.get("candidate_id")
        panel = assignment.get("panel")
        if candidate_id is None or not isinstance(panel, list):
            continue
        candidate_id = str(candidate_id)
        for member in panel:
            if not isinstance(member, dict) or member.get("id") is None:
                continue
            interviewer_id = str(member["id"])
            proposed.setdefault(interviewer_id, set()).add(candidate_id)
    return proposed


def get_conflict_review_readiness(admission, group, saved_schedule=None, schedule=None):
    if saved_schedule is None:
        saved_schedule = SavedSchedule.objects.filter(
            admission=admission, group=group
        ).first()

    candidate_ids = {
        str(candidate_id)
        for candidate_id in UserApplication.objects.filter(
            admission=admission, group_applications__group=group
        )
        .distinct()
        .values_list("pk", flat=True)
    }
    participants = {
        str(participant.user_id): participant
        for participant in InterviewAvailability.objects.filter(
            admission=admission,
            group=group,
            user_id__in=get_eligible_interviewer_ids(admission, group),
        )
    }
    proposed_by_interviewer = get_proposed_candidate_ids_by_interviewer(
        saved_schedule, schedule
    )
    required_participant_ids = []
    incomplete_participant_ids = []
    missing_pair_count = 0
    for interviewer_id, proposed_candidate_ids in proposed_by_interviewer.items():
        if not proposed_candidate_ids:
            continue
        # Confirmation must cover everything they were shown, not just their
        # own panel: an unreviewed swap partner is exactly the pair a repair
        # would move onto them. A union, not a replacement: an edit-and-
        # publish POST carries pairings the snapshot has never seen.
        if saved_schedule is not None:
            proposed_candidate_ids = (
                conflict_review_scope(saved_schedule, interviewer_id)
                | proposed_candidate_ids
            )
        participant = participants.get(interviewer_id)
        required_participant_ids.append(
            participant.user_id if participant is not None else interviewer_id
        )
        stored_reviewed_ids = (
            participant.reviewed_candidate_ids
            if participant is not None
            and isinstance(participant.reviewed_candidate_ids, list)
            else []
        )
        reviewed_ids = {
            str(candidate_id)
            for candidate_id in stored_reviewed_ids
            if candidate_id is not None
        }
        missing = proposed_candidate_ids - reviewed_ids
        if missing:
            incomplete_participant_ids.append(
                participant.user_id if participant is not None else interviewer_id
            )
            missing_pair_count += len(missing)

    return {
        "candidate_ids": candidate_ids,
        "required_participant_ids": required_participant_ids,
        "incomplete_participant_ids": incomplete_participant_ids,
        "missing_pair_count": missing_pair_count,
        "proposed_candidate_ids_by_interviewer": proposed_by_interviewer,
        "is_complete": bool(required_participant_ids)
        and not incomplete_participant_ids,
    }


def _as_date(value):
    if isinstance(value, str):
        return datetime.strptime(value, "%Y-%m-%d").date()
    return value


def published_candidate_ids(saved_schedule):
    """Candidate ids on rows at or before the published boundary.

    Must agree with the row filter (SavedScheduleSerializer's
    publication_boundary): withheld rows mean withheld identities.
    """

    if saved_schedule is None or saved_schedule.distributed_through is None:
        return set()
    start_date = _as_date(saved_schedule.start_date)
    boundary = _as_date(saved_schedule.distributed_through)
    if start_date is None:
        return set()
    published = set()
    for entry in saved_schedule.schedule or []:
        if not isinstance(entry, dict):
            continue
        time_value = entry.get("time")
        candidate_id = entry.get("candidate_id")
        if not isinstance(time_value, int) or candidate_id is None:
            continue
        entry_date = start_date + timedelta(days=time_value // (24 * 60))
        if entry_date <= boundary:
            published.add(str(candidate_id))
    return published


def publication_withholds_rows(saved_schedule):
    """Whether distributed_through leaves scheduled rows unpublished.

    Decided by the schedule's content, not by comparing boundaries: an empty
    or legacy plan has no full boundary to compare against.
    """

    if saved_schedule is None or saved_schedule.distributed_through is None:
        return False
    start_date = _as_date(saved_schedule.start_date)
    boundary = _as_date(saved_schedule.distributed_through)
    if start_date is None:
        return False
    for entry in saved_schedule.schedule or []:
        if not isinstance(entry, dict) or not isinstance(entry.get("time"), int):
            continue
        if start_date + timedelta(days=entry["time"] // (24 * 60)) > boundary:
            return True
    return False


def conflict_review_scope(saved_schedule, user_id):
    """The candidate ids one interviewer is asked to check.

    Single definition on purpose: the names shown, the payload, the writable
    scope and the completeness check must all agree, or an interviewer is asked
    to confirm a list they were never shown.

    Falls back to the proposed pairs when no snapshot exists, so a plan saved
    before review lists existed still has a working review.
    """

    from admissions.admissions.models import ConflictReviewList

    row = (
        ConflictReviewList.objects.filter(
            saved_schedule=saved_schedule, interviewer_id=user_id
        )
        .order_by("-created_at")
        .first()
    )
    if row is None:
        return set(
            get_proposed_candidate_ids_by_interviewer(saved_schedule).get(
                str(user_id), set()
            )
        )
    return set(row.review_candidate_ids)


def decoy_review_scope(saved_schedule, user_id):
    """This interviewer's filler entries: [{"token": "<uuid4>", "name": ...}].

    Same snapshot as conflict_review_scope (the same ConflictReviewList row),
    so a filler always appears and disappears in lockstep with the real
    review list it pads - never independently, or the pattern itself would
    be a tell.
    """

    from admissions.admissions.models import ConflictReviewList

    row = (
        ConflictReviewList.objects.filter(
            saved_schedule=saved_schedule, interviewer_id=user_id
        )
        .order_by("-created_at")
        .first()
    )
    if row is None or not isinstance(row.decoys, list):
        return []
    return [
        entry
        for entry in row.decoys
        if isinstance(entry, dict) and isinstance(entry.get("token"), str)
    ]


def _block_index_by_minute(saved_schedule):
    """Absolute minute -> index into resolved_blocks, for the block ranking tier.

    Whole blocks move together under the default panel_stability, so a
    candidate sharing a block with one of the interviewer's own candidates is
    the likeliest thing a repair actually touches - more so than merely
    sharing a day.
    """
    from admissions.admissions.schedule_validation import encode_slot_keys

    start_date = saved_schedule.start_date
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()

    block_by_minute = {}
    for index, block in enumerate(saved_schedule.resolved_blocks or []):
        if not isinstance(block, dict):
            continue
        for minute in encode_slot_keys(block.get("slots") or [], start_date):
            block_by_minute[minute] = index
    return block_by_minute


def _decoy_cohort(queryset, size, saved_schedule):
    """A stable, bounded set of filler names for one schedule.

    Stable across rebuilds of the same plan: the draw is seeded on the
    schedule's own id, so re-saving a draft does not silently rotate a
    different cast of fillers through the review lists. A name that appeared
    once and never again would stand out exactly as much as a name that never
    recurs at all.

    Ordered by primary key before sampling so the seed alone decides the draw,
    rather than whatever order the database felt like returning rows in.
    """

    pool = list(queryset.order_by("lego_user_id"))
    if not pool:
        return []
    if len(pool) <= size:
        return pool
    return random.Random(str(saved_schedule.pk)).sample(pool, size)


def build_conflict_review_lists(saved_schedule, swap_size=5):
    """Per-interviewer review lists: their own candidates plus swap partners.

    The swap set is not padding. Its purpose is that if a repair moves a
    candidate onto this interviewer's panel, that pair was already reviewed —
    otherwise the repaired plan contains an unchecked pairing. So candidates are
    only eligible if the interviewer is actually free at their time, and are
    ranked by how likely a repair is to touch them.

    Deliberately not ranked by committee: which committee someone applied to is
    exactly what the candidate-visibility rules exist to protect.
    """

    if not conflict_review_v2_enabled():
        return {}

    proposed = get_proposed_candidate_ids_by_interviewer(saved_schedule)
    if not proposed:
        return {}

    schedule = saved_schedule.schedule or []
    time_by_candidate = {}
    panel_by_candidate = {}
    for assignment in schedule:
        if not isinstance(assignment, dict):
            continue
        candidate_id = assignment.get("candidate_id")
        if candidate_id is None:
            continue
        time_by_candidate[str(candidate_id)] = assignment.get("time")
        panel_by_candidate[str(candidate_id)] = {
            str(member.get("id"))
            for member in assignment.get("panel") or []
            if isinstance(member, dict) and member.get("id") is not None
        }

    availability = {
        str(row.user_id): encode_slot_keys_for(row, saved_schedule)
        for row in InterviewAvailability.objects.filter(
            admission_id=saved_schedule.admission_id,
            group_id=saved_schedule.group_id,
        )
    }
    block_by_minute = _block_index_by_minute(saved_schedule)
    # A shared pool, not a fresh draw per interviewer: fillers recurring
    # across different interviewers' lists is what makes them look like real
    # candidate recurrence rather than a giveaway. Empty until a roster sync
    # has actually populated DirectoryEntry (see the sync_directory_entries
    # command) - no synthesised names, those would pad the count without
    # providing any real cover.
    # Deliberately admission-wide, not scoped to saved_schedule.group: a
    # decoy must not be a real applicant to *any* committee in the
    # admission, not just this one, or the padding gives away real
    # recurrence patterns.
    applicant_lego_ids = set(
        UserApplication.objects.filter(admission=saved_schedule.admission)
        .exclude(user__lego_id__isnull=True)
        .values_list("user__lego_id", flat=True)
    )
    # Drawn once, then shared by every interviewer in this build. Sampling
    # each list straight out of the full directory would defeat the point:
    # with thousands of students to draw from, two interviewers comparing
    # notes would find that every name they *both* hold is a real applicant
    # and every name only one of them holds is a filler. Bounding the cohort
    # to roughly the size of the real candidate pool makes fillers recur at
    # about the rate real candidates do, so that comparison says nothing.
    decoy_cohort = _decoy_cohort(
        DirectoryEntry.objects.exclude(lego_user_id__in=applicant_lego_ids),
        max(swap_size, len(time_by_candidate)),
        saved_schedule,
    )

    lists = {}
    for interviewer_id, own_ids in proposed.items():
        own = {str(value) for value in own_ids}
        own_times = {time_by_candidate.get(candidate_id) for candidate_id in own} - {
            None
        }
        own_blocks = {
            block_by_minute[own_time]
            for own_time in own_times
            if own_time in block_by_minute
        }
        free_slots = availability.get(interviewer_id, set())

        candidates = []
        for candidate_id, slot in time_by_candidate.items():
            if candidate_id in own or slot is None:
                continue
            # Hard filter: a candidate at a time this interviewer cannot work
            # is not a swap partner, whatever else recommends them.
            if free_slots and slot not in free_slots:
                continue
            shares_panel = bool(
                panel_by_candidate.get(candidate_id, set())
                & {
                    member
                    for cid in own
                    for member in panel_by_candidate.get(cid, set())
                }
                - {interviewer_id}
            )
            same_block = bool(own_blocks) and block_by_minute.get(slot) in own_blocks
            same_day = any(
                own_time is not None and own_time // (24 * 60) == slot // (24 * 60)
                for own_time in own_times
            )
            # Lower sorts first: same block, then same day, then (as a pure
            # tiebreak within those) panels a minimum-change repair would
            # actually touch.
            candidates.append(
                (
                    (
                        0 if same_block else 1,
                        0 if same_day else 1,
                        0 if shares_panel else 1,
                        slot,
                    ),
                    candidate_id,
                )
            )

        candidates.sort()
        swap = [candidate_id for _, candidate_id in candidates[:swap_size]]
        decoy_count = min(swap_size, len(decoy_cohort))
        # A bare uuid4, the same shape as a real UserApplication pk - fillers
        # are told apart by membership in this row's stored decoys, never by
        # a visible format marker.
        decoys = (
            [
                {
                    "token": str(uuid.uuid4()),
                    "name": entry.full_name or entry.username,
                }
                for entry in random.sample(decoy_cohort, decoy_count)
            ]
            if decoy_count
            else []
        )
        lists[interviewer_id] = {
            "own_candidate_ids": sorted(own),
            "swap_candidate_ids": swap,
            "decoys": decoys,
        }
    return lists


def encode_slot_keys_for(availability_row, saved_schedule):
    """This interviewer's submitted slots as absolute solver minutes."""
    from admissions.admissions.schedule_validation import encode_slot_keys

    start_date = saved_schedule.start_date
    # An unsaved instance can still hold whatever was assigned to it, and a
    # date arithmetic TypeError deep in the solver path is a poor way to find
    # that out.
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    return encode_slot_keys(availability_row.slots or [], start_date)


def get_declared_conflict_candidate_ids(admission, group):
    """Conflicts implied by fadderbarn declarations: {interviewer_id: {pk}}.

    Resolved here, on demand, and never written back to the interviewer's own
    availability row. Being someone's fadder is declared against a LEGO identity
    before any candidate list exists, so persisting the match would leak which
    of an interviewer's fadderbarn actually applied.

    The declaration itself (FadderbarnDeclaration) stays admission-wide - a
    person declares their fadderbarn once, not per committee - but resolving
    it against the candidate pool must be scoped to `group`: otherwise a
    Webkom interviewer's fadderbarn who only applied to Bedkom would surface
    in Webkom's own derived-conflicts view.
    """

    if not conflict_review_v2_enabled():
        return {}

    declarations = FadderbarnDeclaration.objects.filter(
        admission=admission
    ).values_list("interviewer_id", "lego_user_id")
    if not declarations:
        return {}

    lego_ids = {lego_user_id for _, lego_user_id in declarations}
    # Exact match on lego_id: it is unique and stable, unlike usernames.
    application_by_lego_id = {
        lego_id: str(pk)
        for lego_id, pk in UserApplication.objects.filter(
            admission=admission,
            group_applications__group=group,
            user__lego_id__in=lego_ids,
        )
        .distinct()
        .values_list("user__lego_id", "pk")
    }
    if not application_by_lego_id:
        return {}

    derived = {}
    for interviewer_id, lego_user_id in declarations:
        candidate_id = application_by_lego_id.get(lego_user_id)
        if candidate_id is not None:
            # str: every caller looks this up by the string id it already has
            # (same convention as candidate_id above) - a raw UUID key here
            # would never match and the union would silently be a no-op.
            derived.setdefault(str(interviewer_id), set()).add(candidate_id)
    return derived


def canonicalize_slot_keys(keys):
    canonical = set()
    for key in keys:
        parsed = parse_slot_key(str(key))
        if not parsed:
            return None, key
        slot_date, minute = parsed
        try:
            datetime.strptime(slot_date, "%Y-%m-%d")
        except ValueError:
            return None, key
        if not 0 <= minute < 24 * 60:
            return None, key
        canonical.add(make_slot_key(slot_date, minute))
    return sorted(canonical, key=parse_slot_key), None
