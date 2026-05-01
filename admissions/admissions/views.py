from datetime import datetime

from django.conf import settings
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import User
from django.db.models import Prefetch, Q
from django.http import HttpResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.generic.base import TemplateView
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.serializers import (
    AdminAdmissionSerializer,
    AdminCreateUpdateAdmissionSerializer,
    AdmissionListPublicSerializer,
    AdmissionPublicSerializer,
    ApplicationCreateUpdateSerializer,
    GroupSerializer,
    SavedScheduleSerializer,
    SaveScheduleInputSerializer,
    SaveInterviewAvailabilitySerializer,
    InterviewAvailabilityParticipantSerializer,
    UserApplicationSerializer,
    ScheduleRequestsSerializer,
)
from admissions.utils.email import send_message
from .solve_schedule import solve_schedule
from .schedule_windows import (
    enabled_windows_to_slots,
    normalize_enabled_windows,
    remap_slots_between_durations,
    slots_to_enabled_windows,
)

from .authentication import SessionAuthentication
from .permissions import (
    AdmissionPermissions,
    ApplicationPermissions,
    GroupApplicationPermissions,
    GroupPermissions,
    IsCreatorOfObject,
    IsStaff,
    IsWebkom,
)


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

                admission_slug = self.kwargs.get("admission_slug", None)
                admission = Admission.objects.get(slug=admission_slug)
                for group, group_recruiters in recruiters.items():
                    send_message(admission, group, group_recruiters)
                instance.delete()
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
        """
        Instantiates and returns the list of permissions that this view requires.
        """
        if self.action in ["delete_group_application"]:
            self.permission_classes.append(GroupApplicationPermissions)
        else:
            self.permission_classes.append(ApplicationPermissions)
        return super(AdminApplicationViewSet, self).get_permissions()

    def get_queryset(self):
        admission_slug = self.kwargs.get("admission_slug", None)
        admission = Admission.objects.get(slug=admission_slug)
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
        admission = Admission.objects.get(slug=admission_slug)
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
        serializer = ScheduleRequestsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        result = solve_schedule(
            candidates_data=data["candidates"],
            interviewers_data=data["interviewers"],
            panel_size=data["panel_size"],
            options_data=data.get("options", {}),
            locked_assignments_data=data.get("locked_assignments", []),
        )

        return Response(result, status=status.HTTP_200_OK)


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
            return None, Response(status=status.HTTP_404_NOT_FOUND)

        user = request.user
        user.__class__ = LegoUser

        is_admin = user_is_admission_admin(admission, user)
        is_recruiter = get_representing_group(admission, user) is not None

        if require_admin and not (is_admin or is_recruiter):
            return None, Response(status=status.HTTP_403_FORBIDDEN)

        if not is_admin and not is_recruiter:
            # Allow viewing distributed schedule for any authenticated user in the admission
            try:
                saved = admission.saved_schedule
                if not saved.is_distributed:
                    return None, Response(status=status.HTTP_403_FORBIDDEN)
            except SavedSchedule.DoesNotExist:
                return None, Response(status=status.HTTP_403_FORBIDDEN)

        return admission, None

    def get(self, request, admission_slug):
        admission, err = self._get_admission_and_check(request, admission_slug)
        if err:
            return err

        try:
            saved = admission.saved_schedule
            self._ensure_window_fields(saved)
            return Response(SavedScheduleSerializer(saved).data)
        except SavedSchedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

    def post(self, request, admission_slug):
        admission, err = self._get_admission_and_check(
            request, admission_slug, require_admin=True
        )
        if err:
            return err

        serializer = SaveScheduleInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        existing = SavedSchedule.objects.filter(admission=admission).first()
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
            grid_changed = (
                existing.start_date != start_date
                or existing.end_date != end_date
                or existing.session_duration != session_duration
                or old_windows != enabled_windows
                or block_shape_changed
                or existing.day_start_minute
                != data.get("day_start_minute", existing.day_start_minute)
                or existing.day_end_minute
                != data.get("day_end_minute", existing.day_end_minute)
            )
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

        is_distributed = (
            False
            if should_clear_plan
            else data.get(
                "is_distributed",
                existing.is_distributed if existing is not None else False,
            )
        )

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
                "is_distributed": is_distributed,
                "show_candidate_names": data.get(
                    "show_candidate_names",
                    existing.show_candidate_names if existing is not None else False,
                ),
            },
        )

        if grid_changed and existing is not None:
            for availability in admission.interview_availabilities.all():
                remapped_slots = remap_slots_between_durations(
                    availability.slots,
                    existing.session_duration,
                    enabled_windows,
                    session_duration,
                )
                if availability.slots != remapped_slots:
                    availability.slots = remapped_slots
                    availability.save(update_fields=["slots", "updated_at"])

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
            member_ids = (
                Membership.objects.filter(group__in=admission.groups.all())
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
        conflicts_map = {item.user_id: item.conflicts for item in saved_items}

        payload = [
            {
                "user_id": person.id,
                "username": person.username,
                "full_name": person.get_full_name() or person.username,
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

        if "conflicts" in serializer.validated_data:
            try:
                names_are_visible = admission.saved_schedule.show_candidate_names
            except SavedSchedule.DoesNotExist:
                names_are_visible = False

            if not names_are_visible:
                return Response(
                    {
                        "conflicts": [
                            "Conflicts can only be saved after candidate names are visible."
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        existing = InterviewAvailability.objects.filter(
            admission=admission,
            user=user,
        ).first()
        saved, _ = InterviewAvailability.objects.update_or_create(
            admission=admission,
            user=user,
            defaults={
                "slots": serializer.validated_data.get(
                    "slots",
                    existing.slots if existing is not None else [],
                ),
                "conflicts": serializer.validated_data.get(
                    "conflicts",
                    existing.conflicts if existing is not None else [],
                ),
            },
        )

        return Response(
            {
                "user_id": user.id,
                "username": user.username,
                "full_name": user.get_full_name() or user.username,
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

        applications = (
            UserApplication.objects.filter(admission=admission)
            .select_related("user")
            .order_by("user__first_name", "user__last_name", "user__username")
        )
        payload = [
            {
                "id": f"real-candidate-{application.user.username}",
                "name": application.user.get_full_name() or application.user.username,
                "gender": "",
            }
            for application in applications
        ]

        return Response(payload, status=status.HTTP_200_OK)
