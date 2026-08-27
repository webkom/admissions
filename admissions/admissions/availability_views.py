from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    get_representing_groups,
    user_is_admission_admin,
    user_is_group_member,
    user_is_interview_admin,
    user_represents_group,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    ConflictReviewList,
    FadderbarnDeclaration,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    ScheduleDeviationApproval,
    UserApplication,
)
from admissions.admissions.schedule_windows import enabled_windows_to_slots
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.scheduling_utils import (
    availability_submission_is_current,
    canonicalize_slot_keys,
    conflict_review_scope,
    decoy_review_scope,
    get_committee_interviewer_ids,
    get_declared_conflict_candidate_ids,
    get_eligible_interviewer_ids,
    get_proposed_candidate_ids_by_interviewer,
    get_responding_interviewer_ids,
    panel_gender_code,
    publication_withholds_rows,
    published_candidate_ids,
    user_has_interview_availability,
)
from admissions.admissions.serializers import (
    InterviewAvailabilityParticipantSerializer,
    SaveInterviewAvailabilitySerializer,
)
from admissions.admissions.session_renewal import renew_session


class InterviewAvailabilityView(SchedulerFeatureGateMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "availability"

    @staticmethod
    def _participation(item, saved_schedule):
        if item is None:
            return InterviewAvailability.PARTICIPATION_AWAITING
        if item.participation == InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING:
            return InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
        if availability_submission_is_current(item, saved_schedule):
            return InterviewAvailability.PARTICIPATION_PARTICIPATING
        return InterviewAvailability.PARTICIPATION_AWAITING

    @staticmethod
    def _affected_assignment_count(saved_schedule, user_id):
        if saved_schedule is None:
            return 0
        target_id = str(user_id)
        return sum(
            1
            for assignment in saved_schedule.schedule or []
            if any(
                str(member.get("id") or "") == target_id
                for member in assignment.get("panel") or []
                if isinstance(member, dict)
            )
        )

    @staticmethod
    def _review_scope(saved_schedule, user_id):
        return conflict_review_scope(saved_schedule, user_id)

    @staticmethod
    def _own_fadderbarn(admission, user):
        return [
            {
                "lego_user_id": declaration.lego_user_id,
                "username": declaration.username,
                "full_name": declaration.full_name,
            }
            for declaration in FadderbarnDeclaration.objects.filter(
                admission=admission, interviewer=user
            ).order_by("full_name", "lego_user_id")
        ]

    def _get_admission(self, admission_slug):
        try:
            return Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return None

    def _conflict_review_is_open_for_user(self, admission, group, saved_schedule, user):
        return bool(
            saved_schedule is not None
            and saved_schedule.conflict_review_open
            and not saved_schedule.is_distributed
            and user.id in get_eligible_interviewer_ids(admission, group)
            and user_has_interview_availability(admission, group, user.id)
        )

    def _visible_candidate_ids(self, admission, group, saved_schedule, user, is_admin):
        if is_admin:
            return None
        if self._conflict_review_is_open_for_user(
            admission, group, saved_schedule, user
        ):
            return self._review_scope(saved_schedule, user.id)
        # A schedule belongs to exactly one committee now: visibility is
        # either running this committee's own workflow, or this committee's
        # own recruiter having published names to it.
        committee_revealed = bool(
            saved_schedule is not None
            and saved_schedule.is_distributed
            and saved_schedule.name_visibility
            == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        if not user_represents_group(admission, group, user):
            if not committee_revealed:
                return set()
            if publication_withholds_rows(saved_schedule):
                # A partial publish withholds rows, so an ordinary member's
                # visible-candidate scope stops at the same boundary.
                return published_candidate_ids(saved_schedule)
        return {
            str(pk)
            for pk in UserApplication.objects.filter(
                admission=admission,
                group_applications__group=group,
            )
            .values_list("pk", flat=True)
            .distinct()
        }

    def _visible_conflicts(self, conflicts, visible_candidate_ids):
        if not isinstance(conflicts, list):
            return []
        if visible_candidate_ids is None:
            return conflicts
        return [conflict for conflict in conflicts if conflict in visible_candidate_ids]

    def _conflict_review_complete(self, reviewed_candidate_ids, candidate_ids):
        if not isinstance(reviewed_candidate_ids, list):
            return False
        return bool(candidate_ids) and candidate_ids.issubset(
            {str(candidate_id) for candidate_id in reviewed_candidate_ids}
        )

    def _audit_derived_conflict_access(self, admission, saved_schedule, user):
        # No "opened"/"closed" boundary exists for this phase - derived
        # conflicts are recomputed fresh on every request rather than
        # snapshotted - so one VIEWED event per admin per schedule is the
        # whole audit trail, not a per-poll one.
        already_logged = ConflictReviewAuditEvent.objects.filter(
            admission=admission,
            saved_schedule=saved_schedule,
            phase=ConflictReviewAuditEvent.PHASE_DERIVED,
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
            actor_id=user.id,
        ).exists()
        if already_logged:
            return
        ConflictReviewAuditEvent.objects.create(
            admission=admission,
            saved_schedule=saved_schedule,
            actor=user,
            actor_username=user.username,
            subject_user=user,
            subject_username=user.username,
            phase=ConflictReviewAuditEvent.PHASE_DERIVED,
            action=ConflictReviewAuditEvent.ACTION_VIEWED,
        )

    def get(self, request, admission_slug, group_id):
        admission = self._get_admission(admission_slug)
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        group = get_object_or_404(admission.groups, pk=group_id)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = user_is_interview_admin(admission, group, user)
        # Scoped to this schedule's own committee: representing some OTHER
        # committee in this admission grants no extra visibility here now
        # that each committee's schedule is independent.
        representing_groups = get_representing_groups(admission, user).filter(
            pk=group.pk
        )
        is_recruiter = representing_groups.exists()
        is_group_member = user_is_group_member(group, user)

        if not is_group_member and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if is_interview_admin:
            # The "who has answered" roster is the committee's own people only.
            # The eligible set would also pull in every admission admin-group
            # member (panel eligibility), which would list people from a group
            # this committee has nothing to do with as perpetually missing an
            # answer they were never asked for.
            all_ids = get_committee_interviewer_ids(group)
            users = LegoUser.objects.filter(id__in=all_ids).order_by(
                "first_name", "last_name", "username"
            )
            # Membership is written only by the OAuth login pipeline, so its
            # absence is exactly "we have never seen this person here". Worth
            # telling apart from an ordinary missing answer: one needs a
            # reminder to fill in their times, the other has never heard of
            # the tool and needs a reminder to sign in at all.
            signed_in_ids = get_responding_interviewer_ids(admission, group)
        elif is_recruiter:
            member_ids = (
                Membership.objects.filter(group__in=representing_groups)
                .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
                .values_list("user_id", flat=True)
                .distinct()
            )
            users = LegoUser.objects.filter(id__in=member_ids).order_by(
                "first_name", "last_name", "username"
            )
            signed_in_ids = None
        else:
            users = LegoUser.objects.filter(id=user.id)
            signed_in_ids = None

        saved_items = InterviewAvailability.objects.filter(
            admission=admission,
            group=group,
            user_id__in=users.values_list("id", flat=True),
        )
        availability_map = {item.user_id: item for item in saved_items}
        saved_schedule = SavedSchedule.objects.filter(
            admission=admission, group=group
        ).first()
        proposed_candidate_ids_map = get_proposed_candidate_ids_by_interviewer(
            saved_schedule
        )
        requester_review_scope_open = self._conflict_review_is_open_for_user(
            admission,
            group,
            saved_schedule,
            user,
        )
        # Own row only, merged in here rather than kept separate: the whole
        # point of a decoy is that it is indistinguishable from a real swap
        # candidate anywhere in this response.
        own_decoy_entries = (
            [
                {"id": entry["token"], "name": entry.get("name") or ""}
                for entry in decoy_review_scope(saved_schedule, user.id)
            ]
            if not is_admin and requester_review_scope_open
            else []
        )
        # The names behind own_decoy_tokens, so the review UI can render
        # fillers next to real candidates. Own row only, and never for an
        # admin: handing out someone else's filler list would make
        # cross-comparing two interviewers' lists trivial, which is exactly
        # what the shared bounded cohort exists to prevent. Within one's own
        # row the names reveal nothing the token already placed there - the
        # owner already sees the tokens in proposed_candidate_ids.
        own_decoy_tokens = (
            {entry["id"] for entry in own_decoy_entries}
        )
        visible_proposed_candidate_ids_map = (
            proposed_candidate_ids_map
            if is_admin
            else (
                {
                    str(user.id): self._review_scope(saved_schedule, user.id)
                    | own_decoy_tokens
                }
                if requester_review_scope_open
                else {}
            )
        )
        availability_generation = (
            saved_schedule.availability_generation if saved_schedule is not None else 1
        )
        visible_candidate_ids = self._visible_candidate_ids(
            admission,
            group,
            saved_schedule,
            user,
            is_admin,
        )

        # A homogeneous projection: real conflicts and this row's own decoy
        # marks flow through the exact same field, so nothing about the
        # response shape can tell them apart. Decoys must never even be
        # concatenated in for anyone else's row - an admin's filter is None
        # (unrestricted), so appending decoy data there and trusting the
        # filter to strip it back out would leak it straight through.
        def _is_own_unfiltered_row(item):
            return item.user_id == user.id and not is_admin

        conflicts_map = {
            item.user_id: self._visible_conflicts(
                (
                    list(item.conflicts or []) + list(item.decoy_conflicts or [])
                    if _is_own_unfiltered_row(item)
                    else list(item.conflicts or [])
                ),
                (
                    (visible_candidate_ids or set()) | own_decoy_tokens
                    if _is_own_unfiltered_row(item)
                    else visible_candidate_ids
                ),
            )
            for item in saved_items
        }
        # Interview admin or admission admin: revealing this on a non-admin's own row would tell them
        # exactly which of their fadderbarn declarations matched an
        # applicant, which is precisely what get_declared_conflict_candidate_ids
        # exists to avoid ever writing back to InterviewAvailability itself.
        declared_conflicts_map = (
            get_declared_conflict_candidate_ids(admission, group)
            if is_interview_admin or is_admin
            else {}
        )
        reviewed_candidates_map = {
            item.user_id: self._visible_conflicts(
                (
                    list(item.reviewed_candidate_ids or [])
                    + list(item.decoy_reviewed_ids or [])
                    if _is_own_unfiltered_row(item)
                    else list(item.reviewed_candidate_ids or [])
                ),
                (
                    (visible_candidate_ids or set()) | own_decoy_tokens
                    if _is_own_unfiltered_row(item)
                    else visible_candidate_ids
                ),
            )
            for item in saved_items
        }
        conflict_review_complete_map = {
            item.user_id: self._conflict_review_complete(
                (
                    list(item.reviewed_candidate_ids or [])
                    + list(item.decoy_reviewed_ids or [])
                    if _is_own_unfiltered_row(item)
                    else list(item.reviewed_candidate_ids or [])
                ),
                visible_proposed_candidate_ids_map.get(str(item.user_id), set()),
            )
            for item in saved_items
        }
        fadderbarn_by_interviewer = {user.id: self._own_fadderbarn(admission, user)}
        payload = [
            {
                "user_id": person.id,
                "username": person.username,
                "full_name": person.get_full_name() or person.username,
                "gender": (
                    panel_gender_code(person.gender) if is_interview_admin else ""
                ),
                # Contact details are for chasing missing answers, so they stay
                # with the admins who do the chasing.
                "email": person.email if is_interview_admin else "",
                "availability_updated_at": (
                    availability_map[person.id].updated_at
                    if person.id in availability_map
                    else None
                ),
                "experience_level": (
                    availability_map[person.id].experience_level
                    if is_interview_admin and person.id in availability_map
                    else InterviewAvailability.EXPERIENCE_UNKNOWN
                ),
                "slots": (
                    availability_map[person.id].slots
                    if person.id in availability_map
                    else []
                ),
                "discouraged_slots": (
                    availability_map[person.id].discouraged_slots
                    if person.id in availability_map
                    else []
                ),
                "conflicts": conflicts_map.get(person.id, []),
                "derived_conflicts": (
                    self._visible_conflicts(
                        sorted(declared_conflicts_map.get(str(person.id), set())),
                        visible_candidate_ids,
                    )
                    if is_admin or (is_interview_admin and person.id != user.id)
                    else []
                ),
                "reviewed_candidate_ids": reviewed_candidates_map.get(person.id, []),
                "proposed_candidate_ids": sorted(
                    visible_proposed_candidate_ids_map.get(str(person.id), set())
                ),
                "decoy_candidates": (
                    own_decoy_entries if person.id == user.id else []
                ),
                "conflict_review_complete": conflict_review_complete_map.get(
                    person.id, False
                ),
                "has_submitted": (
                    person.id in availability_map
                    and availability_map[person.id].participation
                    != InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
                    and availability_submission_is_current(
                        availability_map[person.id], saved_schedule
                    )
                ),
                "participation": self._participation(
                    availability_map.get(person.id), saved_schedule
                ),
                "needs_review": (
                    person.id in availability_map
                    and availability_map[person.id].submitted_grid_generation
                    is not None
                    and availability_map[person.id].submitted_grid_generation
                    != availability_generation
                ),
                "availability_generation": availability_generation,
                "affected_assignment_count": (
                    self._affected_assignment_count(saved_schedule, person.id)
                    if is_interview_admin
                    or is_admin
                    or (requester_review_scope_open and person.id == user.id)
                    else 0
                ),
                "is_me": person.id == user.id,
                # Only meaningful to whoever chases the missing answers, and
                # only they are served the full roster in the first place.
                "has_signed_in": (
                    True if signed_in_ids is None else person.id in signed_in_ids
                ),
                # Only ever your own: a declaration names people who may not
                # have applied, so it is nobody else's business.
                "fadderbarn": (
                    fadderbarn_by_interviewer.get(person.id, [])
                    if person.id == user.id
                    else []
                ),
            }
            for person in users
        ]
        if is_admin and any(
            declared_conflicts_map.get(str(person.id)) for person in users
        ):
            self._audit_derived_conflict_access(admission, saved_schedule, user)

        serializer = InterviewAvailabilityParticipantSerializer(payload, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request, admission_slug, group_id):
        admission = Admission.objects.filter(slug=admission_slug).first()
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        group = get_object_or_404(admission.groups, pk=group_id)

        user = request.user
        user.__class__ = LegoUser
        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = user_is_interview_admin(admission, group, user)
        representing_groups = get_representing_groups(admission, user).filter(
            pk=group.pk
        )
        is_recruiter = representing_groups.exists()
        # A committee's own members record their own availability - the
        # framework (which interview windows exist) is handed to them by the
        # recruiter, and submitting their times is exactly the member side of
        # the workflow. Everything beyond that is interview-admin work:
        # saving on someone else's behalf, review fields, and experience
        # level. Org leadership / god users, who belong to neither this
        # committee nor an admin group, cannot write its schedule either.
        if not user_is_group_member(group, user) and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SaveInterviewAvailabilitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if "experience_level" in serializer.validated_data and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)
        # Members never touch applicant data: marking inhabilitet and
        # confirming reviews references candidates, which is why it is
        # interview-admin work only (recruiters record reviews on a member's
        # behalf by posting that member's user_id).
        if (
            any(
                field in serializer.validated_data
                for field in ("conflicts", "reviewed_candidate_ids")
            )
            and not is_interview_admin
        ):
            return Response(status=status.HTTP_403_FORBIDDEN)
        admission = Admission.objects.select_for_update().get(pk=admission.pk)

        target_user = user
        target_user_id = serializer.validated_data.get("user_id")
        if target_user_id is not None and target_user_id != user.id:
            if not is_interview_admin:
                return Response(status=status.HTTP_403_FORBIDDEN)
            if target_user_id not in get_eligible_interviewer_ids(admission, group):
                return Response(
                    {"user_id": ["Brukeren er ikke i intervjuergruppen."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target_user = LegoUser.objects.filter(pk=target_user_id).first()
            if target_user is None:
                return Response(
                    {"user_id": ["Ukjent intervjuer."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        saved_schedule = SavedSchedule.objects.filter(
            admission=admission, group=group
        ).first()

        # discouraged_slots is only meaningful alongside the grid it belongs
        # to: everything that validates it - canonicalisation, disjointness
        # from slots, and membership of the opened grid - is derived from the
        # slots submitted with it, so all of it lives in the branch below.
        # The persistence defaults further down pick the field up
        # unconditionally, so accepting it on its own would let raw,
        # uncanonicalised keys through unvalidated and break the disjointness
        # invariant on the stored row. Reject that shape instead; the UI
        # always submits the two together (see useAvailabilityEditor).
        if (
            "discouraged_slots" in serializer.validated_data
            and "slots" not in serializer.validated_data
        ):
            return Response(
                {"discouraged_slots": ["Kan ikke lagres uten tilgjengelighet."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if "slots" in serializer.validated_data:
            canonical_slots, invalid_key = canonicalize_slot_keys(
                serializer.validated_data["slots"]
            )
            if canonical_slots is None:
                return Response(
                    {"slots": [f"Invalid slot key: {invalid_key}"]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer.validated_data["slots"] = canonical_slots

            if "discouraged_slots" in serializer.validated_data:
                canonical_discouraged, invalid_key = canonicalize_slot_keys(
                    serializer.validated_data["discouraged_slots"]
                )
                if canonical_discouraged is None:
                    return Response(
                        {"discouraged_slots": [f"Invalid slot key: {invalid_key}"]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # Held disjoint from slots, and never wider than them: a slot
                # is exactly one of freely available, "helst ikke", or not
                # offered, so the two lists can never disagree about one slot.
                available = set(canonical_slots)
                serializer.validated_data["discouraged_slots"] = [
                    slot for slot in canonical_discouraged if slot not in available
                ]

            expected_generation = serializer.validated_data.get(
                "expected_availability_generation"
            )
            current_generation = (
                saved_schedule.availability_generation
                if saved_schedule is not None
                else 1
            )
            if expected_generation is None and current_generation != 1:
                return Response(
                    {
                        "expected_availability_generation": [
                            "Dette feltet er påkrevd når tilgjengelighet lagres."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                expected_generation is not None
                and expected_generation != current_generation
            ):
                return Response(
                    {
                        "expected_availability_generation": [
                            "Tidsoppsettet er endret. Last inn siden på nytt før du bekrefter."
                        ],
                        "availability_generation": current_generation,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            enabled_slots = []
            if saved_schedule is not None:
                enabled_slots = list(saved_schedule.enabled_slots or [])
                if not enabled_slots and saved_schedule.enabled_windows:
                    enabled_slots = enabled_windows_to_slots(
                        saved_schedule.enabled_windows,
                        saved_schedule.session_duration,
                    )
            if not enabled_slots:
                return Response(
                    {"slots": ["Opptaksansvarlig må åpne tidsluker først."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            canonical_enabled, _unused = canonicalize_slot_keys(enabled_slots)
            enabled_set = set(
                canonical_enabled if canonical_enabled is not None else enabled_slots
            )
            outside = [key for key in canonical_slots if key not in enabled_set]
            if outside:
                return Response(
                    {
                        "slots": [
                            f"Tidspunktet {outside[0]} er ikke en del av "
                            "intervjuplanens tidsoppsett."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            outside_discouraged = [
                key
                for key in serializer.validated_data.get("discouraged_slots", [])
                if key not in enabled_set
            ]
            if outside_discouraged:
                return Response(
                    {
                        "discouraged_slots": [
                            f"Tidspunktet {outside_discouraged[0]} er ikke en del "
                            "av intervjuplanens tidsoppsett."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        conflict_review_open = self._conflict_review_is_open_for_user(
            admission, group, saved_schedule, user
        )
        visible_candidate_ids = self._visible_candidate_ids(
            admission,
            group,
            saved_schedule,
            user,
            is_admin,
        )
        review_fields_present = any(
            field in serializer.validated_data
            for field in (
                "conflicts",
                "reviewed_candidate_ids",
            )
        )
        conflict_replace_scope = None
        # Belongs to target_user regardless of who is submitting (an admin
        # can edit on someone's behalf): the filler list is whoever's row
        # this is, not whoever is signed in. Empty for admins - decoys are a
        # non-admin-only concept, so a submitted token simply won't validate.
        own_decoy_scope = (
            {
                entry["token"]
                for entry in decoy_review_scope(saved_schedule, target_user.id)
            }
            if not is_admin
            else set()
        )
        if review_fields_present:
            if not (is_admin or is_recruiter):
                if not conflict_review_open:
                    return Response(
                        {
                            "conflicts": [
                                "Inhabilitet kan bare endres mens "
                                "inhabilitetsinnsamlingen er åpen."
                            ]
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            valid_candidate_ids = visible_candidate_ids
            if valid_candidate_ids is None:
                valid_candidate_ids = {
                    str(pk)
                    for pk in UserApplication.objects.filter(
                        admission=admission, group_applications__group=group
                    )
                    .distinct()
                    .values_list("pk", flat=True)
                }
            for field in (
                "conflicts",
                "reviewed_candidate_ids",
            ):
                # A bad token gets the exact same error as a bad candidate
                # id - anything that let the two be told apart would defeat
                # the whole point of the token namespace.
                unknown = [
                    candidate_id
                    for candidate_id in serializer.validated_data.get(field, [])
                    if candidate_id not in valid_candidate_ids
                    and candidate_id not in own_decoy_scope
                ]
                if unknown:
                    return Response(
                        {field: [f"Ukjent kandidat: {unknown[0]}"]},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            if (
                conflict_replace_scope is None
                and "reviewed_candidate_ids" in serializer.validated_data
                and saved_schedule is not None
                and saved_schedule.conflict_review_open
            ):
                conflict_replace_scope = self._review_scope(
                    saved_schedule, target_user.id
                )
            elif conflict_replace_scope is None and (is_admin or is_recruiter):
                # Admins and recruiters set inhabilitet deliberately, and their
                # reach is already bounded by the candidates they represent.
                conflict_replace_scope = set(valid_candidate_ids)
            elif conflict_replace_scope is None and (
                "conflicts" in serializer.validated_data
            ):
                # For an ordinary member, falling back to the whole visible set
                # would let a stale conflicts-only save replace inhabilitet
                # across every candidate they can see, silently clearing someone
                # else's flag. The write must declare which review produced it.
                return Response(
                    {
                        "conflicts": [
                            "Inhabilitet må lagres sammen med hvilken "
                            "kandidatsjekk som er utført."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        existing = (
            InterviewAvailability.objects.select_for_update()
            .filter(
                admission=admission,
                group=group,
                user=target_user,
            )
            .first()
        )
        defaults = {
            key: serializer.validated_data[key]
            for key in (
                "slots",
                "discouraged_slots",
                "conflicts",
                "reviewed_candidate_ids",
                "experience_level",
            )
            if key in serializer.validated_data
        }
        # Split by namespace immediately: everything below this point must
        # only ever see its own kind, real or decoy, never both mixed in one
        # list - that split is the entire mechanism that keeps a filler
        # indistinguishable from a real conflict everywhere else in this view.
        submitted_decoy_conflicts = None
        if "conflicts" in defaults:
            submitted_decoy_conflicts = {
                value for value in defaults["conflicts"] if value in own_decoy_scope
            }
            defaults["conflicts"] = [
                value for value in defaults["conflicts"] if value not in own_decoy_scope
            ]
        submitted_decoy_reviewed = None
        if "reviewed_candidate_ids" in defaults:
            submitted_decoy_reviewed = {
                value
                for value in defaults["reviewed_candidate_ids"]
                if value in own_decoy_scope
            }
            defaults["reviewed_candidate_ids"] = [
                value
                for value in defaults["reviewed_candidate_ids"]
                if value not in own_decoy_scope
            ]
        requested_participation = serializer.validated_data.get("participation")
        if "slots" in serializer.validated_data:
            defaults["participation"] = (
                InterviewAvailability.PARTICIPATION_PARTICIPATING
            )
            defaults["submitted_grid_generation"] = (
                saved_schedule.availability_generation
            )
        elif requested_participation is not None:
            defaults["participation"] = requested_participation
            defaults["slots"] = []
            defaults["discouraged_slots"] = []
            defaults["submitted_grid_generation"] = None
        if review_fields_present:
            existing_conflicts = set(
                existing.conflicts
                if existing and isinstance(existing.conflicts, list)
                else []
            )
            submitted_conflicts = set(defaults.get("conflicts", existing_conflicts))
            next_conflicts = submitted_conflicts
            if (
                "conflicts" in serializer.validated_data
                and conflict_replace_scope is not None
            ):
                next_conflicts = (
                    existing_conflicts - set(conflict_replace_scope)
                ) | submitted_conflicts
            defaults["conflicts"] = sorted(next_conflicts)
            if "reviewed_candidate_ids" in serializer.validated_data:
                next_reviewed = set(
                    defaults.get(
                        "reviewed_candidate_ids",
                        (
                            existing.reviewed_candidate_ids
                            if existing
                            and isinstance(existing.reviewed_candidate_ids, list)
                            else []
                        ),
                    )
                )
                next_reviewed.update(next_conflicts)
                defaults["reviewed_candidate_ids"] = sorted(next_reviewed)
            # Same algorithm as the real fields above, against own_decoy_scope
            # instead of conflict_replace_scope - a filler mark must round-trip
            # exactly like a real one, or its disappearance on reload would
            # itself say "this one wasn't real".
            existing_decoy_conflicts = set(
                existing.decoy_conflicts
                if existing and isinstance(existing.decoy_conflicts, list)
                else []
            )
            next_decoy_conflicts = existing_decoy_conflicts
            if submitted_decoy_conflicts is not None:
                next_decoy_conflicts = (
                    existing_decoy_conflicts - own_decoy_scope
                ) | submitted_decoy_conflicts
            defaults["decoy_conflicts"] = sorted(next_decoy_conflicts)
            if submitted_decoy_reviewed is not None:
                next_decoy_reviewed = set(submitted_decoy_reviewed)
                next_decoy_reviewed.update(next_decoy_conflicts)
                defaults["decoy_reviewed_ids"] = sorted(next_decoy_reviewed)
        if "fadderbarn" in serializer.validated_data:
            # Full replacement, and stamped so "none declared" is
            # distinguishable from "not answered yet". An identical
            # resubmission is left alone (except a first-ever confirmation,
            # which still needs its stamp).
            declared = list(
                {
                    entry["lego_user_id"]: entry
                    for entry in serializer.validated_data["fadderbarn"]
                }.values()
            )
            incoming = {
                (
                    entry["lego_user_id"],
                    entry.get("username", ""),
                    entry.get("full_name", ""),
                )
                for entry in declared
            }
            stored = {
                (row.lego_user_id, row.username, row.full_name)
                for row in FadderbarnDeclaration.objects.filter(
                    admission=admission, interviewer=target_user
                )
            }
            if incoming != stored:
                FadderbarnDeclaration.objects.filter(
                    admission=admission, interviewer=target_user
                ).delete()
                FadderbarnDeclaration.objects.bulk_create(
                    [
                        FadderbarnDeclaration(
                            admission=admission,
                            interviewer=target_user,
                            lego_user_id=entry["lego_user_id"],
                            username=entry.get("username", ""),
                            full_name=entry.get("full_name", ""),
                        )
                        for entry in declared
                    ]
                )
                defaults["fadderbarn_confirmed_at"] = timezone.now()
            elif existing is None or existing.fadderbarn_confirmed_at is None:
                defaults["fadderbarn_confirmed_at"] = timezone.now()

        saved, _ = InterviewAvailability.objects.update_or_create(
            admission=admission,
            group=group,
            user=target_user,
            defaults=defaults,
        )
        participation_changed = bool(
            requested_participation is not None
            and (existing is None or existing.participation != requested_participation)
        )
        experience_changed = bool(
            "experience_level" in serializer.validated_data
            and (
                existing is None
                or existing.experience_level
                != serializer.validated_data["experience_level"]
            )
        )
        planning_input_changed = (
            "slots" in serializer.validated_data
            or participation_changed
            or experience_changed
        )
        if planning_input_changed and saved_schedule is not None:
            saved_schedule.save(update_fields=["updated_at"])
            ScheduleDeviationApproval.objects.filter(
                saved_schedule=saved_schedule
            ).delete()
        if "reviewed_candidate_ids" in serializer.validated_data:
            ConflictReviewAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved_schedule,
                actor=user,
                actor_username=user.username,
                action=ConflictReviewAuditEvent.ACTION_SUBMITTED,
                reviewed_candidate_ids=saved.reviewed_candidate_ids,
                conflict_candidate_ids=saved.conflicts,
            )
        proposed_candidate_ids = get_proposed_candidate_ids_by_interviewer(
            saved_schedule
        ).get(str(target_user.id), set())
        can_view_assignment_scope = (
            is_interview_admin
            or is_admin
            or (target_user.id == user.id and conflict_review_open)
        )
        # Mirror of the GET projection for this row - diffing a save's echo
        # against the next poll must never separate fillers from reals or
        # leak the real proposed panel.
        is_own_unfiltered_row = target_user.id == user.id and not is_admin
        echo_decoy_tokens = (
            own_decoy_scope if is_own_unfiltered_row and conflict_review_open else set()
        )
        # Same names channel as the GET projection, same own-row-only rule.
        echo_decoy_entries = (
            [
                {"id": entry["token"], "name": entry.get("name") or ""}
                for entry in decoy_review_scope(saved_schedule, target_user.id)
            ]
            if echo_decoy_tokens
            else []
        )
        echo_filter = (
            (visible_candidate_ids or set()) | echo_decoy_tokens
            if is_own_unfiltered_row
            else visible_candidate_ids
        )
        echo_conflicts = (
            list(saved.conflicts or []) + list(saved.decoy_conflicts or [])
            if is_own_unfiltered_row
            else list(saved.conflicts or [])
        )
        echo_reviewed = (
            list(saved.reviewed_candidate_ids or [])
            + list(saved.decoy_reviewed_ids or [])
            if is_own_unfiltered_row
            else list(saved.reviewed_candidate_ids or [])
        )
        visible_proposed_candidate_ids = (
            proposed_candidate_ids
            if is_admin
            else (
                self._review_scope(saved_schedule, user.id) | echo_decoy_tokens
                if target_user.id == user.id and conflict_review_open
                else set()
            )
        )
        current_generation = (
            saved_schedule.availability_generation if saved_schedule is not None else 1
        )

        # A save is proof of a present human, same as an application submit.
        # Without this the interviewer and admin write flows were the only
        # real activity in the product that never slid the session window,
        # so a long planning session expired mid-edit.
        renew_session(request)

        return Response(
            {
                "user_id": target_user.id,
                "username": target_user.username,
                "full_name": target_user.get_full_name() or target_user.username,
                "gender": (
                    panel_gender_code(target_user.gender) if is_interview_admin else ""
                ),
                "experience_level": (
                    saved.experience_level
                    if is_interview_admin
                    else InterviewAvailability.EXPERIENCE_UNKNOWN
                ),
                "slots": saved.slots,
                "discouraged_slots": saved.discouraged_slots,
                "conflicts": self._visible_conflicts(
                    echo_conflicts,
                    echo_filter,
                ),
                "reviewed_candidate_ids": self._visible_conflicts(
                    echo_reviewed,
                    echo_filter,
                ),
                "proposed_candidate_ids": sorted(visible_proposed_candidate_ids),
                "decoy_candidates": echo_decoy_entries,
                "conflict_review_complete": self._conflict_review_complete(
                    echo_reviewed,
                    visible_proposed_candidate_ids,
                ),
                "has_submitted": (
                    saved.participation
                    != InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
                    and availability_submission_is_current(saved, saved_schedule)
                ),
                "participation": self._participation(saved, saved_schedule),
                "needs_review": (
                    saved.submitted_grid_generation is not None
                    and saved.submitted_grid_generation != current_generation
                ),
                "availability_generation": current_generation,
                "affected_assignment_count": (
                    self._affected_assignment_count(saved_schedule, target_user.id)
                    if can_view_assignment_scope
                    else 0
                ),
                "is_me": target_user.id == user.id,
                "fadderbarn": (
                    self._own_fadderbarn(admission, target_user)
                    if target_user.id == user.id
                    else []
                ),
            },
            status=status.HTTP_200_OK,
        )
