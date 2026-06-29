from datetime import datetime

from django.conf import settings
from django.contrib.auth import logout as auth_logout
from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from django.views.generic.base import TemplateView
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from structlog import get_logger

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.serializers import (
    AdminAdmissionSerializer,
    AdminCreateUpdateAdmissionSerializer,
    AdmissionListPublicSerializer,
    AdmissionPublicSerializer,
    ApplicationCreateUpdateSerializer,
    GroupSerializer,
    InterviewAvailabilityParticipantSerializer,
    SavedScheduleSerializer,
    SaveInterviewAvailabilitySerializer,
    SaveScheduleInputSerializer,
    ScheduleRequestsSerializer,
    SolveJobSerializer,
    UserApplicationSerializer,
)
from admissions.utils.email import send_message

from .authentication import SessionAuthentication
from .permissions import (
    AdmissionPermissions,
    ApplicationPermissions,
    GroupPermissions,
    IsCreatorOfObject,
    IsStaff,
    IsWebkom,
)
from .schedule_windows import (
    enabled_windows_to_slots,
    make_slot_key,
    normalize_enabled_windows,
    parse_slot_key,
    slots_to_enabled_windows,
)

log = get_logger()


def panel_gender_code(lego_gender):
    """Map a LEGO gender string ("male"/"female"/...) to the solver's
    "M"/"F"/"" panel code. Lives here because this API layer is the only place
    that translates the stored gender into the solver's representation."""
    return constants.LEGO_GENDER_TO_PANEL_CODE.get(lego_gender or "", "")


def user_is_admission_admin(admission, user):
    for group in admission.admin_groups.all():
        if Membership.objects.filter(user=user.pk, group=group.pk).exists():
            return True
    return False


def get_representing_group(admission, user):
    for group in admission.groups.all():
        if (
            Membership.objects.filter(user=user.pk, group=group.pk)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .exists()
        ):
            return group
    return None


def user_is_committee_member(admission, user):
    return Membership.objects.filter(
        user=user.pk, group__in=admission.groups.all()
    ).exists()


def canonicalize_slot_keys(keys):
    """Normalize slot keys to the canonical "<YYYY-MM-DD>|<minute>" format.

    Accepts legacy ":"-separated keys. Returns (canonical_keys, None) on
    success or (None, offending_key) when a key cannot be parsed.
    """
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


class AppView(TemplateView):
    template_name = "index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["settings"] = settings
        # :rip:
        # beacuse of proxy model
        if self.request.user.is_authenticated:
            self.request.user.__class__ = LegoUser
        return context


##################################################
################## PUBLIC VIEWS ##################
##################################################


def logout(request):
    auth_logout(request)
    return redirect("/")


class PublicAdmissionViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = Admission.objects.all()
    authentication_classes = [SessionAuthentication]
    permission_classes = [AdmissionPermissions]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AdmissionPublicSerializer

        return AdmissionListPublicSerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)

        # Sorting after the data has been fetched to be able to use the models properties
        serializer_data = sorted(
            serializer.data,
            key=lambda admission: (
                -admission["is_open"],
                -admission["is_appliable"],
                admission["is_closed"],
                admission["public_deadline"],
            ),
        )

        return Response(serializer_data)


class PublicApplicationViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = UserApplication.objects.none()
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ("create"):
            return ApplicationCreateUpdateSerializer
        return UserApplicationSerializer

    def perform_create(self, serializer):
        admission_slug = self.kwargs.get("admission_slug", None)
        serializer.save(user=self.request.user, admission_slug=admission_slug)

    @action(detail=False, methods=["GET", "DELETE"])
    def mine(self, request, admission_slug):
        try:
            if request.method == "GET":
                instance = UserApplication.objects.get(
                    user=request.user, admission__slug=admission_slug
                )
                serializer = self.get_serializer(instance)
                return Response(serializer.data)
            elif request.method == "DELETE":
                instance = UserApplication.objects.get(
                    user=request.user, admission__slug=admission_slug
                )
                serializer = self.get_serializer(instance)
                applied_groups = [
                    (group.get("group").get("pk"), group.get("group").get("name"))
                    for group in serializer.data.get("group_applications")
                ]
                recruiters = {}
                for group_pk, group_name in applied_groups:
                    group_recruiters = Membership.objects.filter(
                        Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                        group=group_pk,
                    )
                    recruiters[group_name] = [
                        recruiter.user.email for recruiter in group_recruiters
                    ]

                admission = get_object_or_404(Admission, slug=admission_slug)
                admission_title = admission.title
                # Delete first: the user must be able to withdraw even when mail
                # is down. Recruiter notifications are best-effort.
                instance.delete()
                for group, group_recruiters in recruiters.items():
                    try:
                        send_message(admission_title, group, group_recruiters)
                    except Exception:
                        log.exception("withdrawal_notification_failed", group=group)
                return Response(status=status.HTTP_204_NO_CONTENT)
        except UserApplication.DoesNotExist:
            # HTTP 204 No Content
            return HttpResponse(status=204)


#################################################
################## ADMIN VIEWS ##################
#################################################


class AdminAdmissionViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Admission.objects.all().order_by("title")
    authentication_classes = [SessionAuthentication]
    permission_classes = [AdmissionPermissions]
    serializer_class = AdminAdmissionSerializer
    lookup_field = "slug"


class AdminApplicationViewSet(
    mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    queryset = UserApplication.objects.all().select_related("admission", "user")
    authentication_classes = [SessionAuthentication]
    serializer_class = UserApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        """Instantiate the permissions for this request.

        Build a fresh local list every call — never append to the class-level
        ``permission_classes``, which is shared across all requests in a
        long-lived worker and would otherwise grow unbounded.
        """
        permission_classes = [permissions.IsAuthenticated, ApplicationPermissions]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        admission_slug = self.kwargs.get("admission_slug", None)
        admission = get_object_or_404(Admission, slug=admission_slug)
        user = self.request.user
        if user.is_anonymous:
            return UserApplication.objects.none()
        user.__class__ = LegoUser
        # Check membership in admin groups
        if user_is_admission_admin(admission, user):
            return (
                super()
                .get_queryset()
                .filter(admission__slug=admission_slug)
                .prefetch_related("group_applications", "group_applications__group")
            )
        # Check membership in admission groups
        representing_group = get_representing_group(admission, user)
        if representing_group is not None:
            qs = GroupApplication.objects.filter(
                group=representing_group
            ).select_related("group")

            return (
                super()
                .get_queryset()
                .filter(
                    group_applications__group=representing_group,
                    admission__slug=admission_slug,
                )
                .prefetch_related(
                    Prefetch(
                        "group_applications",
                        queryset=qs,
                        to_attr="group_applications_filtered",
                    )
                )
            )
        # No permissions
        return UserApplication.objects.none()

    def destroy(self, request, *args, **kwargs):
        admission_slug = self.kwargs.get("admission_slug", None)
        admission = get_object_or_404(Admission, slug=admission_slug)
        self.request.user.__class__ = LegoUser

        group_id = request.query_params.get("groupId", None)
        user_is_admin = user_is_admission_admin(admission, self.request.user)

        # Only admins can delete UserApplication objects
        if group_id is None:
            if user_is_admin:
                return super().destroy(request, *args, **kwargs)
            else:
                return Response(status=status.HTTP_400_BAD_REQUEST)

        # Verify that the user is permitted to delete the group application
        representing_group = get_representing_group(admission, self.request.user)
        if not user_is_admin and (
            representing_group is None or str(representing_group.pk) != group_id
        ):
            return Response(
                status=status.HTTP_403_FORBIDDEN,
                data="You are not permitted to delete applications for this group",
            )

        # Perform the deletion
        user_application = self.get_object()
        GroupApplication.objects.get(
            application=user_application.pk, group=group_id
        ).delete()

        # Delete the UserApplication if all GroupApplications are deleted
        if not GroupApplication.objects.filter(
            application=user_application.pk
        ).exists():
            self.perform_destroy(user_application)

        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminGroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


##################################################
################## MANAGE VIEWS ##################
##################################################


class ManageAdmissionViewSet(viewsets.ModelViewSet):
    authentication_classes = [SessionAuthentication]
    permission_classes = [
        permissions.IsAuthenticated,
        IsWebkom | (IsStaff & IsCreatorOfObject),
    ]
    http_method_names = ["get", "post", "patch", "delete"]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.request.method == "GET":
            return AdminAdmissionSerializer
        elif self.request.method == "POST" or self.request.method == "PATCH":
            return AdminCreateUpdateAdmissionSerializer

    def get_queryset(self):
        qs = Admission.objects.all().order_by("title")
        if not self.request.user.is_member_of_webkom:
            return qs.filter(created_by=self.request.user)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        admission = self.get_object()
        if admission.closed_from > timezone.make_aware(datetime.now()):
            return Response(
                data={"message": "Opptaket kan ikke slettes før det har stengt"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class ManageGroupViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Group.objects.all()
    serializer_class = GroupSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated, GroupPermissions]


class SolveScheduleView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        """Enqueue a solve. The actual solving runs in run_solver_worker, so a
        heavy solve never blocks (or times out) the request — the client gets a
        job id back and polls SolveJobStatusView for the result."""
        serializer = ScheduleRequestsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        admission = get_object_or_404(Admission, slug=data["admission_slug"])

        user = request.user
        user.__class__ = LegoUser
        is_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_group(admission, user) is not None
        if not (is_admin or is_recruiter):
            return Response(status=status.HTTP_403_FORBIDDEN)

        # One active job per admission: enqueueing again while a solve is still
        # pending/running returns the in-flight job instead of stacking work.
        existing = (
            SolveJob.objects.filter(
                admission=admission, status__in=SolveJob.ACTIVE_STATUSES
            )
            .order_by("created_at")
            .first()
        )
        if existing is not None:
            return Response(
                SolveJobSerializer(existing).data, status=status.HTTP_202_ACCEPTED
            )

        # Warm-start the solver from the currently saved plan so a re-solve
        # converges faster and stays close to what the committee already saw.
        try:
            previous_schedule = admission.saved_schedule.schedule or []
        except SavedSchedule.DoesNotExist:
            previous_schedule = []

        job = SolveJob.objects.create(
            admission=admission,
            requested_by=user,
            request_data={
                "candidates": data["candidates"],
                "interviewers": data["interviewers"],
                "panel_size": data["panel_size"],
                "options": data.get("options", {}),
                "locked_assignments": data.get("locked_assignments", []),
                "all_slots": data.get("all_slots", []),
                "blocks": data.get("blocks", []),
                "previous_schedule": previous_schedule,
            },
        )
        return Response(SolveJobSerializer(job).data, status=status.HTTP_202_ACCEPTED)


class SolveJobStatusView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def _get_authorized_job(self, request, job_id):
        job = get_object_or_404(SolveJob, id=job_id)
        user = request.user
        user.__class__ = LegoUser
        is_privileged = (
            user_is_admission_admin(job.admission, user)
            or get_representing_group(job.admission, user) is not None
        )
        if not is_privileged:
            return None, Response(status=status.HTTP_403_FORBIDDEN)
        return job, None

    def get(self, request, job_id):
        job, err = self._get_authorized_job(request, job_id)
        if err:
            return err
        return Response(SolveJobSerializer(job).data)

    def delete(self, request, job_id):
        """Cancel a pending/running solve so a fresh one can be enqueued."""
        job, err = self._get_authorized_job(request, job_id)
        if err:
            return err
        if job.status in SolveJob.ACTIVE_STATUSES:
            job.status = SolveJob.STATUS_CANCELLED
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "finished_at"])
        return Response(SolveJobSerializer(job).data)


class SavedScheduleView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _ensure_window_fields(self, saved):
        changed_fields = []
        if not saved.enabled_windows and saved.enabled_slots:
            saved.enabled_windows = slots_to_enabled_windows(
                saved.enabled_slots,
                saved.session_duration,
            )
            changed_fields.append("enabled_windows")

        if saved.enabled_windows:
            derived_slots = enabled_windows_to_slots(
                saved.enabled_windows,
                saved.session_duration,
            )
            if saved.enabled_slots != derived_slots:
                saved.enabled_slots = derived_slots
                changed_fields.append("enabled_slots")

        if changed_fields:
            saved.save(update_fields=changed_fields)

        return saved

    def _get_admission_and_check(self, request, admission_slug, require_admin=False):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return None, False, False, Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_group(admission, user) is not None

        if require_admin and not (is_admin or is_recruiter):
            return (
                None,
                is_admin,
                is_recruiter,
                Response(status=status.HTTP_403_FORBIDDEN),
            )

        if not is_admin and not is_recruiter:
            if not user_is_committee_member(admission, user):
                return (
                    None,
                    is_admin,
                    is_recruiter,
                    Response(status=status.HTTP_403_FORBIDDEN),
                )
            try:
                saved = admission.saved_schedule
                if not saved.is_distributed:
                    return (
                        None,
                        is_admin,
                        is_recruiter,
                        Response(status=status.HTTP_403_FORBIDDEN),
                    )
            except SavedSchedule.DoesNotExist:
                return (
                    None,
                    is_admin,
                    is_recruiter,
                    Response(status=status.HTTP_403_FORBIDDEN),
                )

        return admission, is_admin, is_recruiter, None

    def get(self, request, admission_slug):
        admission, is_admin, is_recruiter, err = self._get_admission_and_check(
            request, admission_slug
        )
        if err:
            return err

        try:
            saved = admission.saved_schedule
            self._ensure_window_fields(saved)
            hide_identity = saved.name_visibility != "committee" and not (
                is_admin or is_recruiter
            )
            return Response(
                SavedScheduleSerializer(
                    saved, context={"hide_candidate_identity": hide_identity}
                ).data
            )
        except SavedSchedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    def post(self, request, admission_slug):
        admission, _is_admin, _is_recruiter, err = self._get_admission_and_check(
            request, admission_slug, require_admin=True
        )
        if err:
            return err

        serializer = SaveScheduleInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        existing = SavedSchedule.objects.filter(admission=admission).first()

        # Optimistic concurrency: a client may pin the revision it loaded and
        # get a conflict instead of silently overwriting someone else's save.
        expected_updated_at = data.get("expected_updated_at")
        if (
            expected_updated_at is not None
            and existing is not None
            and existing.updated_at != expected_updated_at
        ):
            return Response(
                {"detail": "Planen ble endret av noen andre. Last inn siden på nytt."},
                status=status.HTTP_409_CONFLICT,
            )

        if existing is not None:
            self._ensure_window_fields(existing)

        if "start_date" not in data and existing is None:
            return Response(
                {"start_date": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if "session_duration" not in data and existing is None:
            return Response(
                {"session_duration": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = data.get(
            "start_date",
            existing.start_date if existing is not None else timezone.now().date(),
        )
        end_date = data.get(
            "end_date",
            existing.end_date if existing is not None else start_date,
        )
        session_duration = data.get(
            "session_duration",
            existing.session_duration if existing is not None else 60,
        )

        if "enabled_windows" in data:
            enabled_windows = normalize_enabled_windows(data["enabled_windows"])
        elif "enabled_slots" in data:
            enabled_windows = slots_to_enabled_windows(
                data["enabled_slots"],
                session_duration,
            )
        elif existing is not None:
            enabled_windows = normalize_enabled_windows(existing.enabled_windows)
        else:
            enabled_windows = []

        enabled_slots = enabled_windows_to_slots(enabled_windows, session_duration)

        grid_changed = False
        structure_changed = False
        should_clear_plan = False
        if existing is not None:
            old_windows = normalize_enabled_windows(existing.enabled_windows)
            next_chunk_size = data.get("chunk_size", existing.chunk_size)
            next_chunk_break_minutes = data.get(
                "chunk_break_minutes", existing.chunk_break_minutes
            )
            block_shape_changed = (
                existing.chunk_break_minutes != next_chunk_break_minutes
                or (
                    (existing.chunk_break_minutes > 0 or next_chunk_break_minutes > 0)
                    and existing.chunk_size != next_chunk_size
                )
            )
            # A structural change shifts where slots land, so old availability no longer aligns.
            structure_changed = (
                existing.start_date != start_date
                or existing.end_date != end_date
                or existing.session_duration != session_duration
                or block_shape_changed
                or existing.day_start_minute
                != data.get("day_start_minute", existing.day_start_minute)
                or existing.day_end_minute
                != data.get("day_end_minute", existing.day_end_minute)
            )
            grid_changed = structure_changed or old_windows != enabled_windows
            incoming_schedule = data.get("schedule")
            should_clear_plan = (
                grid_changed
                and bool(existing.schedule)
                and ("schedule" not in data or incoming_schedule == existing.schedule)
            )

        if should_clear_plan:
            schedule = []
        else:
            schedule = data.get(
                "schedule",
                existing.schedule if existing is not None else [],
            )

        # Publishing an empty plan makes no sense — reject it explicitly
        # instead of silently distributing nothing to the committee.
        if data.get("is_distributed") is True and not schedule:
            return Response(
                {"is_distributed": ["Kan ikke publisere en tom intervjuplan."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule_changed = (
            "schedule" in data
            and existing is not None
            and data["schedule"] != existing.schedule
        )

        if should_clear_plan:
            is_distributed = False
        elif "is_distributed" in data:
            is_distributed = data["is_distributed"]
        elif schedule_changed:
            # A changed plan must be re-published; otherwise it falls back to draft.
            is_distributed = False
        else:
            is_distributed = existing.is_distributed if existing is not None else False

        with transaction.atomic():
            saved, _ = SavedSchedule.objects.update_or_create(
                admission=admission,
                defaults={
                    "schedule": schedule,
                    "start_date": start_date,
                    "end_date": end_date,
                    "session_duration": session_duration,
                    "enabled_windows": enabled_windows,
                    "enabled_slots": enabled_slots,
                    "day_start_minute": data.get(
                        "day_start_minute",
                        existing.day_start_minute if existing is not None else 8 * 60,
                    ),
                    "day_end_minute": data.get(
                        "day_end_minute",
                        existing.day_end_minute if existing is not None else 18 * 60,
                    ),
                    "chunk_size": data.get(
                        "chunk_size",
                        existing.chunk_size if existing is not None else 4,
                    ),
                    "chunk_break_minutes": data.get(
                        "chunk_break_minutes",
                        existing.chunk_break_minutes if existing is not None else 0,
                    ),
                    "panel_size": data.get(
                        "panel_size",
                        existing.panel_size if existing is not None else None,
                    ),
                    "solver_options": data.get(
                        "solver_options",
                        existing.solver_options if existing is not None else None,
                    ),
                    "is_distributed": is_distributed,
                    "name_visibility": data.get(
                        "name_visibility",
                        existing.name_visibility if existing is not None else "hidden",
                    ),
                },
            )

            if structure_changed and existing is not None:
                # The grid shape changed — wipe submitted availability so it's re-registered.
                admission.interview_availabilities.all().delete()

        return Response(SavedScheduleSerializer(saved).data, status=status.HTTP_200_OK)


class InterviewAvailabilityView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def _get_admission(self, admission_slug):
        try:
            return Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return None

    def get(self, request, admission_slug):
        admission = self._get_admission(admission_slug)
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_group(admission, user) is not None
        is_committee_member = user_is_committee_member(admission, user)

        if not is_committee_member and not is_admin:
            return Response(status=status.HTTP_403_FORBIDDEN)

        if is_admin or is_recruiter:
            member_ids = set(
                Membership.objects.filter(group__in=admission.groups.all())
                .values_list("user_id", flat=True)
                .distinct()
            )
            # Always include the current user and anyone who has already
            # submitted, so availability shows up even for users who aren't
            # part of the committee groups (e.g. an admin entering their own).
            submitted_ids = set(
                InterviewAvailability.objects.filter(admission=admission).values_list(
                    "user_id", flat=True
                )
            )
            all_ids = member_ids | submitted_ids | {user.id}
            users = LegoUser.objects.filter(id__in=all_ids).order_by(
                "first_name", "last_name", "username"
            )
        else:
            users = LegoUser.objects.filter(id=user.id)

        saved_items = InterviewAvailability.objects.filter(
            admission=admission,
            user_id__in=users.values_list("id", flat=True),
        )
        availability_map = {item.user_id: item.slots for item in saved_items}
        conflicts_map = {item.user_id: item.conflicts for item in saved_items}

        payload = [
            {
                "user_id": person.id,
                "username": person.username,
                "full_name": person.get_full_name() or person.username,
                "gender": panel_gender_code(person.gender),
                "slots": availability_map.get(person.id, []),
                "conflicts": conflicts_map.get(person.id, []),
                "has_submitted": person.id in availability_map,
                "is_me": person.id == user.id,
            }
            for person in users
        ]
        serializer = InterviewAvailabilityParticipantSerializer(payload, many=True)
        return Response(serializer.data)

    def post(self, request, admission_slug):
        admission = self._get_admission(admission_slug)
        if admission is None:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser
        if not user_is_committee_member(
            admission, user
        ) and not user_is_admission_admin(admission, user):
            return Response(status=status.HTTP_403_FORBIDDEN)

        serializer = SaveInterviewAvailabilitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            saved_schedule = admission.saved_schedule
        except SavedSchedule.DoesNotExist:
            saved_schedule = None

        # Canonicalize incoming slot keys (legacy ":" separators included) so
        # only "<YYYY-MM-DD>|<minute>" keys are ever persisted.
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

            # When the admin has configured a time grid, availability may only
            # be registered on slots that are actually part of it.
            enabled_slots = []
            if saved_schedule is not None:
                enabled_slots = list(saved_schedule.enabled_slots or [])
                if not enabled_slots and saved_schedule.enabled_windows:
                    enabled_slots = enabled_windows_to_slots(
                        saved_schedule.enabled_windows,
                        saved_schedule.session_duration,
                    )
            if enabled_slots:
                canonical_enabled, _unused = canonicalize_slot_keys(enabled_slots)
                enabled_set = set(
                    canonical_enabled
                    if canonical_enabled is not None
                    else enabled_slots
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

        # Only guard when actual conflicts are being registered — an empty
        # list is a no-op and must not block a plain availability save.
        if serializer.validated_data.get("conflicts"):
            is_admin = user_is_admission_admin(admission, user)
            is_recruiter = get_representing_group(admission, user) is not None

            # Admins and recruiters always see candidate names, so they may
            # register conflicts before names are released to the committee.
            if not (is_admin or is_recruiter):
                names_are_visible = (
                    saved_schedule is not None
                    and saved_schedule.name_visibility == "committee"
                )
                if not names_are_visible:
                    return Response(
                        {
                            "conflicts": [
                                "Conflicts can only be saved after candidate names are visible."
                            ]
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            valid_candidate_ids = {
                str(pk)
                for pk in UserApplication.objects.filter(
                    admission=admission
                ).values_list("pk", flat=True)
            }
            unknown = [
                conflict
                for conflict in serializer.validated_data["conflicts"]
                if conflict not in valid_candidate_ids
            ]
            if unknown:
                return Response(
                    {"conflicts": [f"Ukjent kandidat: {unknown[0]}"]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Build defaults only from the keys actually present in the request so
        # a partial update never overwrites the other field with a stale value
        # read moments earlier (read-then-write race).
        defaults = {
            key: serializer.validated_data[key]
            for key in ("slots", "conflicts")
            if key in serializer.validated_data
        }
        saved, _ = InterviewAvailability.objects.update_or_create(
            admission=admission,
            user=user,
            defaults=defaults,
        )

        return Response(
            {
                "user_id": user.id,
                "username": user.username,
                "full_name": user.get_full_name() or user.username,
                "gender": panel_gender_code(user.gender),
                "slots": saved.slots,
                "conflicts": saved.conflicts,
                "has_submitted": True,
                "is_me": True,
            },
            status=status.HTTP_200_OK,
        )


class InterviewCandidatesView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, admission_slug):
        try:
            admission = Admission.objects.get(slug=admission_slug)
        except Admission.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_group(admission, user) is not None
        is_committee_member = user_is_committee_member(admission, user)

        if not is_committee_member and not is_admin and not is_recruiter:
            return Response(status=status.HTTP_403_FORBIDDEN)

        # Admins and recruiters are privileged: they may see candidate
        # identities, and gender (which feeds the solver). Plain committee
        # members only see names once they are released, and never see gender.
        is_privileged = is_admin or is_recruiter

        # Candidate identities follow the same visibility rule as the schedule:
        # only privileged users, or everyone once names are released to the
        # committee, may see them. Otherwise return anonymous placeholders so
        # the username embedded in the id does not leak either.
        hide_identity = not is_privileged
        if hide_identity:
            try:
                hide_identity = admission.saved_schedule.name_visibility != "committee"
            except SavedSchedule.DoesNotExist:
                hide_identity = True

        expose_gender = is_privileged

        applications = (
            UserApplication.objects.filter(admission=admission)
            .select_related("user")
            .order_by("user__first_name", "user__last_name", "user__username")
        )
        if hide_identity:
            payload = [
                {"id": f"candidate-{index}", "name": "", "gender": ""}
                for index, _ in enumerate(applications)
            ]
        else:
            payload = [
                {
                    "id": str(application.pk),
                    "name": application.user.get_full_name()
                    or application.user.username,
                    "gender": (
                        panel_gender_code(application.user.gender)
                        if expose_gender
                        else ""
                    ),
                }
                for application in applications
            ]

        return Response(payload, status=status.HTTP_200_OK)
