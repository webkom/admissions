from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    get_representing_groups,
    get_user_candidate_visible_groups,
    lock_user_admission_memberships,
    user_is_admission_admin,
    user_is_committee_member,
)
from admissions.admissions.authentication import SessionAuthentication
from admissions.admissions.models import (
    Admission,
    ConflictReviewAuditEvent,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.schedule_invalidation import (
    invalidate_planning_input,
    publication_is_invalidated_by_availability,
)
from admissions.admissions.schedule_windows import enabled_windows_to_slots
from admissions.admissions.scheduler_feature import SchedulerFeatureGateMixin
from admissions.admissions.scheduling_utils import (
    availability_submission_is_current,
    canonicalize_slot_keys,
    get_conflict_collection_readiness,
    get_conflict_review_readiness,
    get_eligible_interviewer_ids,
    get_interviewer_participation,
    get_proposed_candidate_ids_by_interviewer,
    panel_gender_code,
    user_has_interview_availability,
)
from admissions.admissions.serializers import (
    InterviewAvailabilityParticipantSerializer,
    SaveInterviewAvailabilitySerializer,
)


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

    def _get_admission(self, admission_slug):
        try:
            return Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return None

    def _conflict_review_is_open_for_user(self, admission, saved_schedule, user):
        return bool(
            saved_schedule is not None
            and saved_schedule.conflict_review_open
            and not saved_schedule.is_distributed
            and user.id in get_eligible_interviewer_ids(admission)
            and user_has_interview_availability(admission, user.id)
        )

    def _conflict_collection_is_open_for_user(
        self,
        admission,
        saved_schedule,
        user,
    ):
        return bool(
            saved_schedule is not None
            and saved_schedule.conflict_collection_open
            and not saved_schedule.is_distributed
            and str(user.id) in saved_schedule.conflict_collection_participant_ids
            and get_interviewer_participation(admission, saved_schedule).get(user.id)
            == InterviewAvailability.PARTICIPATION_PARTICIPATING
        )

    def _conflict_collection_candidate_ids(
        self,
        admission,
        saved_schedule,
        user,
    ):
        if saved_schedule is None:
            return set()
        own_application_ids = {
            str(application_id)
            for application_id in UserApplication.objects.filter(
                admission=admission,
                user=user,
            ).values_list("pk", flat=True)
        }
        return {
            str(candidate_id)
            for candidate_id in saved_schedule.conflict_collection_candidate_ids
        } - own_application_ids

    def _conflict_collection_is_current(self, admission, saved_schedule):
        current_candidate_ids = {
            str(candidate_id)
            for candidate_id in UserApplication.objects.filter(
                admission=admission
            ).values_list("pk", flat=True)
        }
        participation = get_interviewer_participation(admission, saved_schedule)
        current_participant_ids = {
            str(user_id)
            for user_id, state in participation.items()
            if state == InterviewAvailability.PARTICIPATION_PARTICIPATING
        }
        return current_candidate_ids == set(
            saved_schedule.conflict_collection_candidate_ids
        ) and current_participant_ids == set(
            saved_schedule.conflict_collection_participant_ids
        )

    def _visible_candidate_ids(self, admission, saved_schedule, user, is_admin):
        if is_admin:
            return None
        if self._conflict_collection_is_open_for_user(
            admission,
            saved_schedule,
            user,
        ) and self._conflict_collection_is_current(admission, saved_schedule):
            return self._conflict_collection_candidate_ids(
                admission,
                saved_schedule,
                user,
            )
        if self._conflict_review_is_open_for_user(admission, saved_schedule, user):
            return get_proposed_candidate_ids_by_interviewer(saved_schedule).get(
                str(user.id), set()
            )
        visible_groups = get_user_candidate_visible_groups(
            admission,
            saved_schedule,
            user,
        )
        return {
            str(pk)
            for pk in UserApplication.objects.filter(
                admission=admission,
                group_applications__group__in=visible_groups,
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

    def get(self, request, admission_slug):
        admission = self._get_admission(admission_slug)
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = is_admin
        representing_groups = get_representing_groups(admission, user)
        is_recruiter = representing_groups.exists()
        is_committee_member = user_is_committee_member(admission, user)

        if not is_committee_member and not is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if is_interview_admin:
            all_ids = get_eligible_interviewer_ids(admission)
            users = LegoUser.objects.filter(id__in=all_ids).order_by(
                "first_name", "last_name", "username"
            )
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
        else:
            users = LegoUser.objects.filter(id=user.id)

        saved_items = InterviewAvailability.objects.filter(
            admission=admission,
            user_id__in=users.values_list("id", flat=True),
        )
        availability_map = {item.user_id: item for item in saved_items}
        saved_schedule = None
        try:
            saved_schedule = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            pass
        proposed_candidate_ids_map = get_proposed_candidate_ids_by_interviewer(
            saved_schedule
        )
        review_readiness = get_conflict_review_readiness(
            admission,
            saved_schedule,
        )
        requester_review_scope_open = self._conflict_review_is_open_for_user(
            admission,
            saved_schedule,
            user,
        )
        visible_proposed_candidate_ids_map = (
            proposed_candidate_ids_map
            if is_admin
            else (
                {
                    str(user.id): proposed_candidate_ids_map.get(
                        str(user.id),
                        set(),
                    )
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
            saved_schedule,
            user,
            is_admin,
        )
        conflicts_map = {
            item.user_id: (
                self._visible_conflicts(
                    item.conflicts,
                    visible_candidate_ids,
                )
                if is_admin or item.user_id == user.id
                else []
            )
            for item in saved_items
        }
        reviewed_candidates_map = {
            item.user_id: (
                self._visible_conflicts(
                    item.reviewed_candidate_ids,
                    visible_candidate_ids,
                )
                if is_admin or item.user_id == user.id
                else []
            )
            for item in saved_items
        }
        incomplete_reviewers = {
            str(user_id) for user_id in review_readiness["incomplete_participant_ids"]
        }
        conflict_review_complete_map = {}
        for item in saved_items:
            proposed_ids = visible_proposed_candidate_ids_map.get(
                str(item.user_id),
                set(),
            )
            if is_admin and review_readiness["evidence"] == "collection":
                conflict_review_complete_map[item.user_id] = bool(
                    proposed_ids and str(item.user_id) not in incomplete_reviewers
                )
            else:
                conflict_review_complete_map[item.user_id] = (
                    self._conflict_review_complete(
                        item.reviewed_candidate_ids,
                        proposed_ids,
                    )
                )
        collection_candidate_ids_map = {}
        collection_complete_map = {}
        collection_scope_visible_map = {}
        collection_readiness = get_conflict_collection_readiness(
            admission,
            saved_schedule,
        )
        for person in users:
            can_view_collection_scope = bool(
                saved_schedule is not None
                and collection_readiness["started"]
                and str(person.id) in saved_schedule.conflict_collection_participant_ids
                and (
                    is_admin
                    or (
                        collection_readiness["open"]
                        and collection_readiness["scope_current"]
                        and person.id == user.id
                    )
                )
            )
            collection_scope_visible_map[person.id] = can_view_collection_scope
            candidate_ids = (
                self._conflict_collection_candidate_ids(
                    admission,
                    saved_schedule,
                    person,
                )
                if can_view_collection_scope
                else set()
            )
            collection_candidate_ids_map[person.id] = candidate_ids
            availability = availability_map.get(person.id)
            reviewed_collection_ids = {
                str(candidate_id)
                for candidate_id in (
                    availability.conflict_collection_reviewed_candidate_ids
                    if availability is not None
                    else []
                )
            }
            collection_complete_map[person.id] = bool(
                can_view_collection_scope
                and availability is not None
                and availability.conflict_collection_review_revision
                == saved_schedule.conflict_collection_revision
                and reviewed_collection_ids == candidate_ids
            )

        payload = [
            {
                "user_id": person.id,
                "username": person.username,
                "full_name": person.get_full_name() or person.username,
                "gender": (
                    panel_gender_code(person.gender) if is_interview_admin else ""
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
                "conflicts": conflicts_map.get(person.id, []),
                "reviewed_candidate_ids": reviewed_candidates_map.get(person.id, []),
                "proposed_candidate_ids": sorted(
                    visible_proposed_candidate_ids_map.get(str(person.id), set())
                ),
                "conflict_review_complete": conflict_review_complete_map.get(
                    person.id, False
                ),
                "conflict_collection_candidate_ids": sorted(
                    collection_candidate_ids_map.get(person.id, set())
                ),
                "conflict_collection_revision": (
                    saved_schedule.conflict_collection_revision
                    if collection_scope_visible_map.get(person.id, False)
                    else None
                ),
                "conflict_collection_complete": collection_complete_map.get(
                    person.id,
                    False,
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
                "availability_updated_at": (
                    availability_map[person.id].updated_at
                    if person.id in availability_map
                    else None
                ),
                "affected_assignment_count": (
                    self._affected_assignment_count(saved_schedule, person.id)
                    if is_admin
                    or (requester_review_scope_open and person.id == user.id)
                    else 0
                ),
                "is_me": person.id == user.id,
            }
            for person in users
        ]
        serializer = InterviewAvailabilityParticipantSerializer(payload, many=True)
        return Response(serializer.data)

    @transaction.atomic
    def post(self, request, admission_slug):
        admission = Admission.objects.filter(slug=admission_slug).first()
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser
        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = is_admin
        if not user_is_committee_member(admission, user) and not is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SaveInterviewAvailabilitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        admission = Admission.objects.select_for_update().get(pk=admission.pk)
        lock_user_admission_memberships(admission, user)
        # Re-evaluate membership after acquiring the admission lock so a
        # demotion that happened while waiting cannot authorize this write.
        is_admin = user_is_admission_admin(admission, user)
        is_interview_admin = is_admin
        if not user_is_committee_member(admission, user) and not is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)
        if "experience_level" in serializer.validated_data and not is_interview_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        target_user = user
        target_user_id = serializer.validated_data.get("user_id")
        if target_user_id is not None and target_user_id != user.id:
            if not is_interview_admin:
                return Response(status=status.HTTP_403_FORBIDDEN)
            if target_user_id not in get_eligible_interviewer_ids(admission):
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
            self_attestation_fields = {
                "slots",
                "conflicts",
                "reviewed_candidate_ids",
                "conflict_collection_reviewed_candidate_ids",
                "conflict_collection_revision",
                "expected_availability_generation",
            }
            if self_attestation_fields.intersection(serializer.validated_data):
                return Response(status=status.HTTP_403_FORBIDDEN)

        saved_schedule = (
            SavedSchedule.objects.select_for_update()
            .filter(admission=admission)
            .first()
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

        conflict_review_open = self._conflict_review_is_open_for_user(
            admission, saved_schedule, user
        )
        conflict_collection_open = self._conflict_collection_is_open_for_user(
            admission,
            saved_schedule,
            target_user,
        )
        visible_candidate_ids = self._visible_candidate_ids(
            admission,
            saved_schedule,
            user,
            is_admin,
        )
        review_fields_present = any(
            field in serializer.validated_data
            for field in (
                "conflicts",
                "reviewed_candidate_ids",
                "conflict_collection_reviewed_candidate_ids",
            )
        )
        collection_review_present = (
            "conflict_collection_reviewed_candidate_ids" in serializer.validated_data
        )
        conflict_replace_scope = None
        if collection_review_present:
            submitted_revision = serializer.validated_data.get(
                "conflict_collection_revision"
            )
            if (
                submitted_revision is None
                or saved_schedule is None
                or submitted_revision != saved_schedule.conflict_collection_revision
            ):
                return Response(
                    {
                        "conflict_collection_revision": [
                            "Kandidatlisten er endret. Last inn siden på nytt."
                        ]
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if not conflict_collection_open:
                return Response(
                    {
                        "conflict_collection_reviewed_candidate_ids": [
                            "Navnene er ikke åpne for inhabilitetskontroll."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not self._conflict_collection_is_current(
                admission,
                saved_schedule,
            ):
                return Response(
                    {
                        "conflict_collection_revision": [
                            "Kandidat- eller intervjuerlisten er endret. "
                            "Opptaksansvarlig må åpne kontrollen på nytt."
                        ]
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            collection_candidate_ids = self._conflict_collection_candidate_ids(
                admission,
                saved_schedule,
                target_user,
            )
            conflict_replace_scope = collection_candidate_ids
            reviewed_collection_ids = {
                str(candidate_id)
                for candidate_id in serializer.validated_data[
                    "conflict_collection_reviewed_candidate_ids"
                ]
            }
            if reviewed_collection_ids != collection_candidate_ids:
                return Response(
                    {
                        "conflict_collection_reviewed_candidate_ids": [
                            "Hele den åpne kandidatlisten må kontrolleres."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if review_fields_present:
            if not conflict_review_open and not conflict_collection_open:
                return Response(
                    {
                        "conflicts": [
                            "Inhabilitet kan bare endres mens "
                            "inhabilitetskontrollen er åpen."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            valid_candidate_ids = visible_candidate_ids
            if valid_candidate_ids is None:
                valid_candidate_ids = {
                    str(pk)
                    for pk in UserApplication.objects.filter(
                        admission=admission
                    ).values_list("pk", flat=True)
                }
            for field in (
                "conflicts",
                "reviewed_candidate_ids",
                "conflict_collection_reviewed_candidate_ids",
            ):
                unknown = [
                    candidate_id
                    for candidate_id in serializer.validated_data.get(field, [])
                    if candidate_id not in valid_candidate_ids
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
                conflict_replace_scope = get_proposed_candidate_ids_by_interviewer(
                    saved_schedule
                ).get(
                    str(target_user.id),
                    set(),
                )
            elif conflict_replace_scope is None and visible_candidate_ids is not None:
                conflict_replace_scope = set(visible_candidate_ids)

        existing = (
            InterviewAvailability.objects.select_for_update()
            .filter(
                admission=admission,
                user=target_user,
            )
            .first()
        )
        expected_updated_at_provided = (
            "expected_availability_updated_at" in serializer.validated_data
        )
        expected_updated_at = serializer.validated_data.get(
            "expected_availability_updated_at"
        )
        if existing is not None and not expected_updated_at_provided:
            return Response(
                {
                    "expected_availability_updated_at": [
                        "Dette feltet er påkrevd når tilgjengeligheten oppdateres."
                    ],
                    "availability_updated_at": existing.updated_at,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if existing is not None and expected_updated_at != existing.updated_at:
            return Response(
                {
                    "expected_availability_updated_at": [
                        "Tilgjengeligheten er endret. Last inn siden på nytt."
                    ],
                    "availability_updated_at": existing.updated_at,
                },
                status=status.HTTP_409_CONFLICT,
            )
        if existing is None and expected_updated_at is not None:
            return Response(
                {
                    "expected_availability_updated_at": [
                        "Tilgjengeligheten finnes ikke lenger. Last inn siden på nytt."
                    ],
                    "availability_updated_at": None,
                },
                status=status.HTTP_409_CONFLICT,
            )
        defaults = {
            key: serializer.validated_data[key]
            for key in (
                "slots",
                "conflicts",
                "reviewed_candidate_ids",
                "conflict_collection_reviewed_candidate_ids",
                "experience_level",
            )
            if key in serializer.validated_data
        }
        if collection_review_present:
            defaults["conflict_collection_review_revision"] = (
                saved_schedule.conflict_collection_revision
            )
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
        previous_planning_values = {
            "slots": list(existing.slots or []) if existing is not None else [],
            "conflicts": (
                list(existing.conflicts or []) if existing is not None else []
            ),
            "participation": (
                existing.participation
                if existing is not None
                else InterviewAvailability.PARTICIPATION_AWAITING
            ),
            "experience_level": (
                existing.experience_level
                if existing is not None
                else InterviewAvailability.EXPERIENCE_UNKNOWN
            ),
            "submitted_grid_generation": (
                existing.submitted_grid_generation if existing is not None else None
            ),
        }
        if existing is None:
            saved = InterviewAvailability.objects.create(
                admission=admission,
                user=target_user,
                **defaults,
            )
            row_changed = True
        else:
            changed_fields = [
                field
                for field, value in defaults.items()
                if getattr(existing, field) != value
            ]
            row_changed = bool(changed_fields)
            if row_changed:
                for field in changed_fields:
                    setattr(existing, field, defaults[field])
                existing.save(update_fields=[*changed_fields, "updated_at"])
            saved = existing
        planning_input_changed = any(
            previous_planning_values[field] != getattr(saved, field)
            for field in previous_planning_values
        )
        if planning_input_changed and saved_schedule is not None:
            publication_invalidated = publication_is_invalidated_by_availability(
                saved_schedule,
                target_availability=saved,
                previous_values=previous_planning_values,
            )
            invalidate_planning_input(
                saved_schedule,
                actor=user,
                publication_invalidated=publication_invalidated,
            )
        if row_changed and "reviewed_candidate_ids" in serializer.validated_data:
            ConflictReviewAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved_schedule,
                actor=user,
                actor_username=user.username,
                action=ConflictReviewAuditEvent.ACTION_SUBMITTED,
                reviewed_candidate_ids=saved.reviewed_candidate_ids,
                conflict_candidate_ids=saved.conflicts,
            )
        if row_changed and collection_review_present:
            ConflictReviewAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved_schedule,
                actor=user,
                actor_username=user.username,
                subject_user=target_user,
                subject_username=target_user.username,
                phase=ConflictReviewAuditEvent.PHASE_COLLECTION,
                collection_revision=saved_schedule.conflict_collection_revision,
                action=ConflictReviewAuditEvent.ACTION_SUBMITTED,
                reviewed_candidate_ids=(
                    saved.conflict_collection_reviewed_candidate_ids
                ),
                conflict_candidate_ids=saved.conflicts,
            )

        proposed_candidate_ids = get_proposed_candidate_ids_by_interviewer(
            saved_schedule
        ).get(str(target_user.id), set())
        can_view_assignment_scope = is_admin or (
            target_user.id == user.id and conflict_review_open
        )
        visible_proposed_candidate_ids = (
            proposed_candidate_ids if can_view_assignment_scope else set()
        )
        can_view_collection_scope = bool(
            saved_schedule is not None
            and saved_schedule.conflict_collection_open
            and self._conflict_collection_is_current(admission, saved_schedule)
            and (
                is_admin
                or (
                    target_user.id == user.id
                    and self._conflict_collection_is_open_for_user(
                        admission,
                        saved_schedule,
                        target_user,
                    )
                )
            )
        )
        visible_collection_candidate_ids = (
            self._conflict_collection_candidate_ids(
                admission,
                saved_schedule,
                target_user,
            )
            if can_view_collection_scope
            else set()
        )
        current_generation = (
            saved_schedule.availability_generation if saved_schedule is not None else 1
        )

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
                "conflicts": self._visible_conflicts(
                    saved.conflicts,
                    visible_candidate_ids,
                ),
                "reviewed_candidate_ids": self._visible_conflicts(
                    saved.reviewed_candidate_ids,
                    visible_candidate_ids,
                ),
                "proposed_candidate_ids": sorted(visible_proposed_candidate_ids),
                "conflict_review_complete": self._conflict_review_complete(
                    saved.reviewed_candidate_ids,
                    visible_proposed_candidate_ids,
                ),
                "conflict_collection_candidate_ids": sorted(
                    visible_collection_candidate_ids
                ),
                "conflict_collection_revision": (
                    saved_schedule.conflict_collection_revision
                    if can_view_collection_scope
                    else None
                ),
                "conflict_collection_complete": bool(
                    can_view_collection_scope
                    and saved.conflict_collection_review_revision
                    == saved_schedule.conflict_collection_revision
                    and {
                        str(candidate_id)
                        for candidate_id in (
                            saved.conflict_collection_reviewed_candidate_ids or []
                        )
                    }
                    == visible_collection_candidate_ids
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
                "availability_updated_at": saved.updated_at,
                "affected_assignment_count": (
                    self._affected_assignment_count(saved_schedule, target_user.id)
                    if can_view_assignment_scope
                    else 0
                ),
                "is_me": target_user.id == user.id,
            },
            status=status.HTTP_200_OK,
        )
