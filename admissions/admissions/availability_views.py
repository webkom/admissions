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
    user_is_admission_admin,
    user_is_committee_member,
    user_is_interview_admin,
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
from admissions.admissions.schedule_windows import enabled_windows_to_slots
from admissions.admissions.scheduling_utils import (
    canonicalize_slot_keys,
    get_eligible_interviewer_ids,
    get_proposed_candidate_ids_by_interviewer,
    panel_gender_code,
    user_has_interview_availability,
)
from admissions.admissions.serializers import (
    InterviewAvailabilityParticipantSerializer,
    SaveInterviewAvailabilitySerializer,
)


class InterviewAvailabilityView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "availability"

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

    def _visible_candidate_ids(self, admission, saved_schedule, user, is_admin):
        if is_admin:
            return None
        if self._conflict_review_is_open_for_user(admission, saved_schedule, user):
            return {
                str(pk)
                for pk in UserApplication.objects.filter(
                    admission=admission
                ).values_list("pk", flat=True)
            }
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
        is_interview_admin = user_is_interview_admin(admission, user)
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
        availability_map = {item.user_id: item.slots for item in saved_items}
        saved_schedule = None
        try:
            saved_schedule = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            pass
        proposed_candidate_ids_map = get_proposed_candidate_ids_by_interviewer(
            saved_schedule
        )
        visible_candidate_ids = self._visible_candidate_ids(
            admission,
            saved_schedule,
            user,
            is_admin,
        )
        conflicts_map = {
            item.user_id: self._visible_conflicts(
                item.conflicts,
                visible_candidate_ids,
            )
            for item in saved_items
        }
        reviewed_candidates_map = {
            item.user_id: self._visible_conflicts(
                item.reviewed_candidate_ids,
                visible_candidate_ids,
            )
            for item in saved_items
        }
        conflict_review_complete_map = {
            item.user_id: self._conflict_review_complete(
                item.reviewed_candidate_ids,
                proposed_candidate_ids_map.get(str(item.user_id), set()),
            )
            for item in saved_items
        }

        payload = [
            {
                "user_id": person.id,
                "username": person.username,
                "full_name": person.get_full_name() or person.username,
                "gender": panel_gender_code(person.gender) if is_interview_admin else "",
                "slots": availability_map.get(person.id, []),
                "conflicts": conflicts_map.get(person.id, []),
                "reviewed_candidate_ids": reviewed_candidates_map.get(person.id, []),
                "proposed_candidate_ids": sorted(
                    proposed_candidate_ids_map.get(str(person.id), set())
                ),
                "conflict_review_complete": conflict_review_complete_map.get(
                    person.id, False
                ),
                "has_submitted": person.id in availability_map,
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
        is_interview_admin = user_is_interview_admin(admission, user)
        representing_groups = get_representing_groups(admission, user)
        is_recruiter = representing_groups.exists()
        if not user_is_committee_member(admission, user) and not is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SaveInterviewAvailabilitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        admission = Admission.objects.select_for_update().get(pk=admission.pk)

        try:
            saved_schedule = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            saved_schedule = None

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
        visible_candidate_ids = self._visible_candidate_ids(
            admission,
            saved_schedule,
            user,
            is_interview_admin,
        )
        review_fields_present = any(
            field in serializer.validated_data
            for field in ("conflicts", "reviewed_candidate_ids")
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
                        admission=admission
                    ).values_list("pk", flat=True)
                }
            for field in ("conflicts", "reviewed_candidate_ids"):
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

        existing = (
            InterviewAvailability.objects.select_for_update()
            .filter(
                admission=admission,
                user=user,
            )
            .first()
        )
        defaults = {
            key: serializer.validated_data[key]
            for key in ("slots", "conflicts", "reviewed_candidate_ids")
            if key in serializer.validated_data
        }
        if review_fields_present:
            next_conflicts = set(
                defaults.get(
                    "conflicts",
                    (
                        existing.conflicts
                        if existing and isinstance(existing.conflicts, list)
                        else []
                    ),
                )
            )
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
            defaults["conflicts"] = sorted(next_conflicts)
            defaults["reviewed_candidate_ids"] = sorted(next_reviewed)
        saved, _ = InterviewAvailability.objects.update_or_create(
            admission=admission,
            user=user,
            defaults=defaults,
        )
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
        ).get(str(user.id), set())

        return Response(
            {
                "user_id": user.id,
                "username": user.username,
                "full_name": user.get_full_name() or user.username,
                "gender": panel_gender_code(user.gender) if is_admin else "",
                "slots": saved.slots,
                "conflicts": self._visible_conflicts(
                    saved.conflicts,
                    visible_candidate_ids,
                ),
                "reviewed_candidate_ids": self._visible_conflicts(
                    saved.reviewed_candidate_ids,
                    visible_candidate_ids,
                ),
                "proposed_candidate_ids": sorted(proposed_candidate_ids),
                "conflict_review_complete": self._conflict_review_complete(
                    saved.reviewed_candidate_ids,
                    proposed_candidate_ids,
                ),
                "has_submitted": True,
                "is_me": True,
            },
            status=status.HTTP_200_OK,
        )
