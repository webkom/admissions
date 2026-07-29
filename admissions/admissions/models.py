import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from admissions.admissions import constants
from admissions.utils.models import TimeStampModel


class LegoUser(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lego_id = models.IntegerField(unique=True, null=False, editable=False)

    profile_picture = models.URLField(null=True, blank=True)
    gender = models.CharField(max_length=50, blank=True, default="")

    @property
    def representative_of_group(self):
        """
        Return the name of the group this user is the representative for
        """
        membership = (
            Membership.objects.filter(user=self)
            .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .first()
        )
        if not membership:
            return None
        return membership.group

    @property
    def member_of_group(self):
        membership = (
            Membership.objects.filter(user=self)
            .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
            .first()
        )
        if not membership:
            return None
        return membership.group

    @property
    def is_member_of_webkom(self):
        """
        Return whether the user is a member of the webkom-group or not
        """
        return self.is_member_of(constants.WEBKOM_GROUPNAME)

    def is_member_of(self, group_name):
        """
        Return whether the user is a member of the given group or not
        """
        return (
            Membership.objects.filter(user=self, group__name=group_name)
            .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
            .exists()
        )


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lego_id = models.IntegerField(unique=True, null=False, editable=False)
    name = models.CharField(max_length=80, unique=True)
    logo = models.URLField(null=True, blank=True)
    detail_link = models.CharField(max_length=150, default="")

    response_label = models.TextField(blank=True, max_length=600)
    description = models.TextField(blank=True, max_length=600)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Admission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by = models.ForeignKey(
        LegoUser, null=True, related_name="admissions", on_delete=models.SET_NULL
    )
    title = models.CharField(max_length=255, unique=True)
    slug = models.SlugField(max_length=200, unique=True, null=False)
    description = models.TextField(default="", blank=True)
    header_fields = models.JSONField(default=list, null=True)

    open_from = models.DateTimeField()
    public_deadline = models.DateTimeField()
    closed_from = models.DateTimeField()

    groups = models.ManyToManyField(Group, through="AdmissionGroup")
    admin_groups = models.ManyToManyField(Group, related_name="admin_groups")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(public_deadline__gt=F("open_from"))
                & Q(closed_from__gte=F("public_deadline")),
                name="admission_dates_in_chronological_order",
            )
        ]

    def __str__(self):
        return self.title

    @property
    def is_open(self):
        return self.closed_from > timezone.now() > self.open_from

    @property
    def is_appliable(self):
        return self.public_deadline > timezone.now() > self.open_from

    @property
    def is_closed(self):
        return timezone.now() > self.closed_from


class AdmissionGroup(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(Admission, on_delete=models.CASCADE)
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    header_fields = models.JSONField(default=list, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "group"], name="unique_admission_group_combination"
            )
        ]


class UserApplication(TimeStampModel):
    INTERVIEW_STATUS_NOT_INVITED = "not_invited"
    INTERVIEW_STATUS_INVITED = "invited"
    INTERVIEW_STATUS_CONFIRMED = "confirmed"
    INTERVIEW_STATUS_DECLINED = "declined"
    INTERVIEW_STATUS_COMPLETED = "completed"
    INTERVIEW_STATUS_CANCELLED = "cancelled"
    INTERVIEW_STATUS_CHOICES = [
        (INTERVIEW_STATUS_NOT_INVITED, "Not invited"),
        (INTERVIEW_STATUS_INVITED, "Invited"),
        (INTERVIEW_STATUS_CONFIRMED, "Confirmed"),
        (INTERVIEW_STATUS_DECLINED, "Declined"),
        (INTERVIEW_STATUS_COMPLETED, "Completed"),
        (INTERVIEW_STATUS_CANCELLED, "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission, related_name="applications", on_delete=models.CASCADE
    )
    user = models.ForeignKey(LegoUser, on_delete=models.CASCADE)
    text = models.TextField(blank=True)
    phone_number = models.CharField(max_length=20)
    header_fields_response = models.JSONField(default=None, null=True)
    interview_status = models.CharField(
        max_length=20,
        choices=INTERVIEW_STATUS_CHOICES,
        default=INTERVIEW_STATUS_NOT_INVITED,
    )
    interview_status_updated_at = models.DateTimeField(default=timezone.now)
    interview_status_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="interview_status_updates",
    )
    interview_status_updated_by_username = models.CharField(
        max_length=150, blank=True, default=""
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "user"], name="unique_admission_user_combination"
            )
        ]

    @property
    def is_editable(self):
        return not self.admission.is_closed

    @property
    def is_sendable(self):
        return self.is_editable and self.group_applications.exists()

    @property
    def applied_within_deadline(self):
        return self.created_at < self.admission.public_deadline

    @property
    def sent(self):
        return bool(self.created_at)

    def has_group_application(self, group):
        return self.group_applications.filter(group=group).exists()


class GroupApplication(TimeStampModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        UserApplication, related_name="group_applications", on_delete=models.CASCADE
    )
    group = models.ForeignKey(
        Group, related_name="applications", on_delete=models.CASCADE
    )
    text = models.TextField(blank=True)
    header_fields_response = models.JSONField(default=dict, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["application", "group"],
                name="unique_application_group_combination",
            )
        ]


class InterviewStatusAuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        UserApplication,
        on_delete=models.CASCADE,
        related_name="interview_status_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="interview_status_events",
    )
    actor_username = models.CharField(max_length=150)
    previous_status = models.CharField(
        max_length=20, choices=UserApplication.INTERVIEW_STATUS_CHOICES
    )
    new_status = models.CharField(
        max_length=20, choices=UserApplication.INTERVIEW_STATUS_CHOICES
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["application", "-created_at"],
                name="interview_status_app_time_idx",
            )
        ]


class SavedSchedule(models.Model):
    admission = models.OneToOneField(
        Admission, on_delete=models.CASCADE, related_name="saved_schedule"
    )
    schedule = models.JSONField()
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    session_duration = models.PositiveIntegerField(default=60)
    enabled_windows = models.JSONField(default=list, blank=True)
    enabled_slots = models.JSONField(default=list, blank=True)
    day_start_minute = models.PositiveIntegerField(default=8 * 60)
    day_end_minute = models.PositiveIntegerField(default=18 * 60)
    chunk_size = models.PositiveIntegerField(default=4)
    chunk_break_minutes = models.PositiveIntegerField(default=0)
    BLOCK_MODE_STANDARD = "standard"
    BLOCK_MODE_MANUAL = "manual"
    BLOCK_MODE_CHOICES = [
        (BLOCK_MODE_STANDARD, "Standard blocks"),
        (BLOCK_MODE_MANUAL, "Manual blocks"),
    ]
    block_mode = models.CharField(
        max_length=16,
        choices=BLOCK_MODE_CHOICES,
        default=BLOCK_MODE_STANDARD,
    )
    resolved_blocks = models.JSONField(default=list, blank=True)
    layout_version = models.PositiveSmallIntegerField(default=2)
    slot_overrides = models.JSONField(default=list, blank=True)
    availability_generation = models.PositiveIntegerField(default=1)
    panel_size = models.PositiveSmallIntegerField(null=True, blank=True)
    solver_options = models.JSONField(null=True, blank=True)
    is_distributed = models.BooleanField(default=False)
    conflict_review_open = models.BooleanField(default=False)
    conflict_collection_open = models.BooleanField(default=False)
    conflict_collection_revision = models.UUIDField(null=True, blank=True)
    conflict_collection_candidate_ids = models.JSONField(default=list, blank=True)
    conflict_collection_participant_ids = models.JSONField(default=list, blank=True)

    NAME_VISIBILITY_HIDDEN = "hidden"
    NAME_VISIBILITY_ADMIN_ONLY = "admin_only"
    NAME_VISIBILITY_COMMITTEE = "committee"
    NAME_VISIBILITY_CHOICES = [
        (NAME_VISIBILITY_HIDDEN, "Hidden"),
        (NAME_VISIBILITY_ADMIN_ONLY, "Admin only"),
        (NAME_VISIBILITY_COMMITTEE, "Committee"),
    ]
    name_visibility = models.CharField(
        max_length=16,
        choices=NAME_VISIBILITY_CHOICES,
        default=NAME_VISIBILITY_HIDDEN,
    )
    revealed_groups = models.ManyToManyField(
        Group,
        blank=True,
        related_name="revealed_interview_schedules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Schedule for {self.admission} (distributed={self.is_distributed})"

    @property
    def manual_blocks(self):
        return self.resolved_blocks

    @manual_blocks.setter
    def manual_blocks(self, value):
        self.resolved_blocks = value


class NameVisibilityAuditEvent(models.Model):
    ACTION_REVEALED = "revealed"
    ACTION_HIDDEN = "hidden"
    ACTION_CHOICES = [
        (ACTION_REVEALED, "Revealed"),
        (ACTION_HIDDEN, "Hidden"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="name_visibility_events",
    )
    saved_schedule = models.ForeignKey(
        SavedSchedule,
        null=True,
        on_delete=models.SET_NULL,
        related_name="name_visibility_events",
    )
    group = models.ForeignKey(Group, null=True, on_delete=models.SET_NULL)
    group_name = models.CharField(max_length=80)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="name_visibility_events",
    )
    actor_username = models.CharField(max_length=150)
    action = models.CharField(max_length=16, choices=ACTION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["admission", "-created_at"],
                name="name_vis_admission_time_idx",
            ),
            models.Index(
                fields=["group", "-created_at"],
                name="name_vis_group_time_idx",
            ),
        ]


class ConflictReviewAuditEvent(models.Model):
    PHASE_DRAFT = "draft"
    PHASE_COLLECTION = "collection"
    PHASE_CHOICES = [
        (PHASE_DRAFT, "Draft"),
        (PHASE_COLLECTION, "Collection"),
    ]
    ACTION_OPENED = "opened"
    ACTION_CLOSED = "closed"
    ACTION_VIEWED = "viewed"
    ACTION_SUBMITTED = "submitted"
    ACTION_FROZEN = "frozen"
    ACTION_CHOICES = [
        (ACTION_OPENED, "Opened"),
        (ACTION_CLOSED, "Closed"),
        (ACTION_VIEWED, "Viewed"),
        (ACTION_SUBMITTED, "Submitted"),
        (ACTION_FROZEN, "Frozen"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="conflict_review_events",
    )
    saved_schedule = models.ForeignKey(
        SavedSchedule,
        null=True,
        on_delete=models.SET_NULL,
        related_name="conflict_review_events",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="conflict_review_events",
    )
    actor_username = models.CharField(max_length=150)
    subject_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="conflict_review_subject_events",
    )
    subject_username = models.CharField(max_length=150, blank=True, default="")
    phase = models.CharField(
        max_length=16,
        choices=PHASE_CHOICES,
        default=PHASE_DRAFT,
    )
    collection_revision = models.UUIDField(null=True, blank=True)
    action = models.CharField(max_length=16, choices=ACTION_CHOICES)
    reviewed_candidate_ids = models.JSONField(default=list, blank=True)
    conflict_candidate_ids = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["admission", "-created_at"],
                name="conflict_review_time_idx",
            )
        ]


class ScheduleDeviationApproval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="schedule_deviation_approvals",
    )
    saved_schedule = models.ForeignKey(
        SavedSchedule,
        on_delete=models.CASCADE,
        related_name="deviation_approvals",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="schedule_deviation_approvals",
    )
    actor_username = models.CharField(max_length=150)
    schedule_fingerprint = models.CharField(max_length=64)
    deviation_fingerprint = models.CharField(max_length=64)
    policy_snapshot = models.JSONField(default=dict)
    availability_generation = models.PositiveIntegerField()
    layout_version = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["saved_schedule", "deviation_fingerprint"],
                name="sched_dev_fingerprint_idx",
            )
        ]


class InterviewAvailability(models.Model):
    EXPERIENCE_UNKNOWN = "unknown"
    EXPERIENCE_INEXPERIENCED = "inexperienced"
    EXPERIENCE_EXPERIENCED = "experienced"
    EXPERIENCE_LEVEL_CHOICES = [
        (EXPERIENCE_UNKNOWN, "Unknown"),
        (EXPERIENCE_INEXPERIENCED, "Inexperienced"),
        (EXPERIENCE_EXPERIENCED, "Experienced"),
    ]

    PARTICIPATION_AWAITING = "awaiting_response"
    PARTICIPATION_PARTICIPATING = "participating"
    PARTICIPATION_NOT_PARTICIPATING = "not_participating"
    PARTICIPATION_CHOICES = [
        (PARTICIPATION_AWAITING, "Awaiting response"),
        (PARTICIPATION_PARTICIPATING, "Participating"),
        (PARTICIPATION_NOT_PARTICIPATING, "Not participating"),
    ]

    admission = models.ForeignKey(
        Admission, on_delete=models.CASCADE, related_name="interview_availabilities"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interview_availabilities",
    )
    slots = models.JSONField(default=list, blank=True)
    conflicts = models.JSONField(default=list, blank=True)
    reviewed_candidate_ids = models.JSONField(default=list, blank=True)
    conflict_collection_reviewed_candidate_ids = models.JSONField(
        default=list,
        blank=True,
    )
    conflict_collection_review_revision = models.UUIDField(null=True, blank=True)
    participation = models.CharField(
        max_length=24,
        choices=PARTICIPATION_CHOICES,
        default=PARTICIPATION_AWAITING,
    )
    experience_level = models.CharField(
        max_length=16,
        choices=EXPERIENCE_LEVEL_CHOICES,
        default=EXPERIENCE_UNKNOWN,
    )
    submitted_grid_generation = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "user"], name="unique_admission_user_availability"
            )
        ]

    def __str__(self):
        return f"Availability for {self.user} in {self.admission}"


class SolveJob(models.Model):
    """A queued interview-schedule solve processed by run_solver_worker."""

    STATUS_PENDING = "PENDING"
    STATUS_RUNNING = "RUNNING"
    STATUS_DONE = "DONE"
    STATUS_ERROR = "ERROR"
    STATUS_CANCELLED = "CANCELLED"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_ERROR, "Error"),
        (STATUS_CANCELLED, "Cancelled"),
    ]
    ACTIVE_STATUSES = (STATUS_PENDING, STATUS_RUNNING)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission, on_delete=models.CASCADE, related_name="solve_jobs"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    request_data = models.JSONField()
    request_fingerprint = models.CharField(max_length=64, blank=True, default="")
    result = models.JSONField(null=True, blank=True)
    solver_metrics = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    applied_schedule_updated_at = models.DateTimeField(null=True, blank=True)
    discarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["admission"],
                condition=models.Q(status__in=("PENDING", "RUNNING")),
                name="unique_active_solve_job_per_admission",
            ),
            models.CheckConstraint(
                condition=models.Q(applied_at__isnull=True)
                | models.Q(discarded_at__isnull=True),
                name="solve_job_not_applied_and_discarded",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["admission", "status"]),
        ]

    def __str__(self):
        return f"SolveJob {self.id} for {self.admission} ({self.status})"


class Membership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    role = models.CharField(
        max_length=30, choices=constants.ROLES, default=constants.MEMBER
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "group", "role"], name="unique_user_group_role"
            )
        ]

    def __str__(self):
        return f"{self.user} is in {self.group}"
