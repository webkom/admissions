from datetime import datetime

from admissions.admissions import constants
from admissions.admissions.models import (
    InterviewAvailability,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.schedule_windows import make_slot_key, parse_slot_key


def panel_gender_code(lego_gender):
    return constants.LEGO_GENDER_TO_PANEL_CODE.get(lego_gender or "", "")


def get_eligible_interviewer_ids(admission):
    committee_ids = set(
        Membership.objects.filter(group__in=admission.groups.all()).values_list(
            "user_id", flat=True
        )
    )
    admin_ids = set(
        Membership.objects.filter(group__in=admission.admin_groups.all()).values_list(
            "user_id", flat=True
        )
    )
    # Availability status must include every committee/admin member, even if
    # their membership role is inactive. The response panel uses this roster to
    # decide when "Alle har svart" is true, so excluding IR/retiree members
    # would make the UI report completion too early.
    return committee_ids | admin_ids


def user_has_interview_availability(admission, user_id):
    return (
        InterviewAvailability.objects.filter(
            admission=admission,
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


def get_conflict_review_readiness(admission, saved_schedule=None, schedule=None):
    if saved_schedule is None:
        try:
            saved_schedule = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            saved_schedule = None

    candidate_ids = {
        str(candidate_id)
        for candidate_id in UserApplication.objects.filter(
            admission=admission
        ).values_list("pk", flat=True)
    }
    participants = {
        str(participant.user_id): participant
        for participant in InterviewAvailability.objects.filter(
            admission=admission,
            user_id__in=get_eligible_interviewer_ids(admission),
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


def canonicalize_slot_keys(keys):
    canonical = []
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
        canonical.append(make_slot_key(slot_date, minute))
    return canonical, None
