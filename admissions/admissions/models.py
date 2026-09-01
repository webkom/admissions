import uuid
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import ExpressionWrapper, F, Q
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
    committee_info = models.TextField(
        blank=True,
        null=True,
        default=None,
        max_length=600,
    )
    application_guidance = models.TextField(
        blank=True,
        null=True,
        default=None,
        max_length=600,
    )
    interview_description = models.TextField(
        blank=True,
        null=True,
        default=None,
        max_length=600,
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "group"], name="unique_admission_group_combination"
            )
        ]


class UserApplication(TimeStampModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission, related_name="applications", on_delete=models.CASCADE
    )
    user = models.ForeignKey(LegoUser, on_delete=models.CASCADE)
    text = models.TextField(blank=True)
    phone_number = models.CharField(max_length=20)
    header_fields_response = models.JSONField(default=None, null=True)

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
    # Interview status is per committee: one applicant can be at "Tid
    # bekreftet" with Webkom and "Ikke kalt inn" with Arrkom in the same
    # admission. It therefore lives here, on the (applicant, committee) row,
    # not on UserApplication.
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
    application = models.ForeignKey(
        UserApplication, related_name="group_applications", on_delete=models.CASCADE
    )
    group = models.ForeignKey(
        Group, related_name="applications", on_delete=models.CASCADE
    )
    text = models.TextField(blank=True)
    header_fields_response = models.JSONField(default=dict, null=True)
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
        # Stable order for the per-committee list a recruiter/admin sees.
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["application", "group"],
                name="unique_application_group_combination",
            )
        ]


class InterviewStatusAuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group_application = models.ForeignKey(
        GroupApplication,
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
        max_length=20, choices=GroupApplication.INTERVIEW_STATUS_CHOICES
    )
    new_status = models.CharField(
        max_length=20, choices=GroupApplication.INTERVIEW_STATUS_CHOICES
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["group_application", "-created_at"],
                name="interview_status_ga_time_idx",
            )
        ]


class SavedSchedule(models.Model):
    admission = models.ForeignKey(
        Admission, on_delete=models.CASCADE, related_name="saved_schedules"
    )
    # One independent schedule per committee within the admission - own
    # candidate pool, interviewer pool, publish state, and conflict review.
    # See unique_admission_group_schedule below.
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="saved_schedules"
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
    # Framework days ("YYYY-MM-DD") the admin has marked finished. Their placed
    # interviews stay; their still-open slots are withheld from every later
    # solve, so extending the plan onto new days never backfills a day that is
    # done - even after someone is removed from it and leaves a hole.
    completed_days = models.JSONField(default=list, blank=True)
    availability_generation = models.PositiveIntegerField(default=1)
    panel_size = models.PositiveSmallIntegerField(null=True, blank=True)
    solver_options = models.JSONField(null=True, blank=True)
    # What the committee actually reads: a snapshot of `schedule` taken the
    # last time the admin committed one, NOT the live working copy above.
    #
    # The two are separate so an admin can unlock a published plan and
    # re-solve it without the committee either losing the plan or watching a
    # half-finished draft churn underneath them - they keep seeing the last
    # committed state until the admin saves. `schedule` is the admin's
    # working copy; everything member-facing reads this.
    #
    # Kept in step by _persist_schedule: a publish, a boundary move, or an
    # explicit commit (`commit_published_snapshot`) copies `schedule` here.
    # An ordinary draft save deliberately does not.
    published_schedule = models.JSONField(default=list, blank=True)
    # null = nothing published. A date = rows on or before that day are
    # published; the whole plan is the special case where this lands on (or
    # past) the last scheduled day. Write here, never to is_distributed
    # directly - it is a generated column and the database will reject a
    # write to it. Application code must also never move this backwards -
    # see schedule_workflow.py - a boundary can only ever move forward.
    distributed_through = models.DateField(null=True, blank=True)
    # A real, queryable database column (Postgres GENERATED ALWAYS AS ...
    # STORED under the hood), not a Python property - every existing
    # .filter(is_distributed=...)/.only(...)/.values(...) call keeps working
    # unchanged. Kept only for that backward compatibility; new code should
    # prefer distributed_through directly.
    is_distributed = models.GeneratedField(
        expression=ExpressionWrapper(
            Q(distributed_through__isnull=False),
            output_field=models.BooleanField(),
        ),
        output_field=models.BooleanField(),
        db_persist=True,
    )
    conflict_review_open = models.BooleanField(default=False)
    # Names (not ids) of reviewers whose inhabilitetssjekk was outstanding at
    # the moment the plan was published and the publish was allowed to go
    # through anyway via `publish_without_full_review`. The denormalized
    # display form is deliberate: this field exists to be read off the
    # published plan by people who are not administrators, long after the
    # roster may have changed. The authoritative "was my check waived, by
    # whom, when" answer lives in ConflictReviewAuditEvent. Cleared on a
    # fresh publish that completes the review, kept across unrelated edits,
    # cleared on taking the plan back to draft - see _persist_schedule.
    published_without_review_by = models.JSONField(default=list, blank=True)

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
    outreach_templates = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "group"],
                name="unique_admission_group_schedule",
            )
        ]

    def __init__(self, *args, **kwargs):
        # Compatibility shim for the many existing callers (mostly test
        # fixtures) built around the old plain-boolean field: is_distributed
        # is a generated column now and the database rejects a direct write
        # to it, so this translates a legacy is_distributed=True/False kwarg
        # into distributed_through before it ever reaches the database.
        # Application code should set distributed_through directly instead -
        # see schedule_workflow.py's _resolve_schedule_state.
        is_distributed = kwargs.pop("is_distributed", None)
        super().__init__(*args, **kwargs)
        if is_distributed is not None and "distributed_through" not in kwargs:
            self.distributed_through = (
                self._full_publish_boundary() if is_distributed else None
            )

    def _full_publish_boundary(self):
        start_date = self.start_date
        # Still a raw string here if a caller passed one - Django only
        # normalizes DateField values on save()/full_clean(), and this shim
        # runs during __init__, before either has happened.
        if isinstance(start_date, str):
            try:
                start_date = date.fromisoformat(start_date)
            except ValueError:
                start_date = None
        if start_date is None:
            return timezone.now().date()
        day_offsets = [
            int(item["time"]) // (24 * 60)
            for item in self.schedule or []
            if isinstance(item, dict) and isinstance(item.get("time"), int)
        ]
        return start_date + timedelta(days=max(day_offsets, default=0) + 1)

    def __str__(self):
        return (
            f"Schedule for {self.group} in {self.admission} "
            f"(distributed={self.is_distributed})"
        )

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
    PHASE_DERIVED = "derived"
    PHASE_CHOICES = [
        (PHASE_DRAFT, "Draft"),
        (PHASE_COLLECTION, "Collection"),
        (PHASE_DERIVED, "Derived"),
    ]
    ACTION_OPENED = "opened"
    ACTION_CLOSED = "closed"
    ACTION_VIEWED = "viewed"
    ACTION_SUBMITTED = "submitted"
    ACTION_FROZEN = "frozen"
    # The publish was allowed through with this reviewer's inhabilitetssjekk
    # still incomplete - the recruiter explicitly waived it via
    # `publish_without_full_review`. The pairing shows up on the published
    # plan's "published_without_review_by" list, and one event is recorded
    # per skipped reviewer so the trail answers "was my check waived, by
    # whom, when" rather than only "did this plan get a waiver".
    ACTION_BYPASSED = "bypassed"
    ACTION_CHOICES = [
        (ACTION_OPENED, "Opened"),
        (ACTION_CLOSED, "Closed"),
        (ACTION_VIEWED, "Viewed"),
        (ACTION_SUBMITTED, "Submitted"),
        (ACTION_FROZEN, "Frozen"),
        (ACTION_BYPASSED, "Bypassed"),
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
    # One submission per committee a person interviews for - two committees
    # in the same admission can run different interview weeks, so a shared
    # row could not track "is this current" against two generation counters.
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="interview_availabilities"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interview_availabilities",
    )
    slots = models.JSONField(default=list, blank=True)
    # Slots the interviewer can make but would rather not - a lecture they
    # would have to skip, say. Kept disjoint from `slots` and outside it, so
    # `slots` keeps meaning "freely available"; the schedulable set is the
    # union of the two (see interviewer_availability_slots). The solver may
    # use these, at a penalty, which is the point: it reserves a plain
    # non-answer for "genuinely cannot attend" instead of pushing people to
    # mark a slot unavailable when they merely prefer not to.
    discouraged_slots = models.JSONField(default=list, blank=True)
    conflicts = models.JSONField(default=list, blank=True)
    reviewed_candidate_ids = models.JSONField(default=list, blank=True)
    # A separate namespace from the two fields above, split by membership in
    # the owning ConflictReviewList row's decoys - deliberately not by a
    # visible format marker, which would let a viewer separate fillers from
    # real candidates.
    decoy_conflicts = models.JSONField(default=list, blank=True)
    decoy_reviewed_ids = models.JSONField(default=list, blank=True)
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
    # Without this, "I have no fadderbarn" is indistinguishable from "I have not
    # answered that question yet", and the workflow cannot tell whether an
    # interviewer is finished.
    fadderbarn_confirmed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "group", "user"],
                name="unique_admission_group_user_availability",
            )
        ]

    def __str__(self):
        return f"Availability for {self.user} in {self.group} ({self.admission})"


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
    group = models.ForeignKey(
        Group, on_delete=models.CASCADE, related_name="solve_jobs"
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
    # The best plan found so far while the solve is still running. CP-SAT
    # reaches a usable schedule within seconds and then spends the rest of the
    # budget polishing it, so this is what lets the browser show (and adopt) a
    # plan instead of watching a progress bar for four minutes. Always a
    # validated result; cleared when the final `result` lands.
    preview_result = models.JSONField(null=True, blank=True)
    preview_updated_at = models.DateTimeField(null=True, blank=True)
    solver_metrics = models.JSONField(default=dict, blank=True)
    error = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    discarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "group"],
                condition=models.Q(status__in=("PENDING", "RUNNING")),
                name="unique_active_solve_job_per_admission_group",
            ),
            models.CheckConstraint(
                condition=models.Q(applied_at__isnull=True)
                | models.Q(discarded_at__isnull=True),
                name="solve_job_not_applied_and_discarded",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["admission", "group", "status"]),
        ]

    def __str__(self):
        return (
            f"SolveJob {self.id} for {self.group} in {self.admission} ({self.status})"
        )


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


class FadderbarnDeclaration(models.Model):
    """An interviewer's declared fadderbarn for one admission.

    Kept in its own model rather than a field on InterviewAvailability because
    it is keyed on a different identity space: a LEGO user id, not a
    UserApplication pk. At declaration time the interviewer must not learn
    whether the person has applied, so a fadderbarn cannot be stored as a
    candidate reference. The match is resolved server-side, lazily, and never
    reported back to the person who declared it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    admission = models.ForeignKey(
        Admission,
        related_name="fadderbarn_declarations",
        on_delete=models.CASCADE,
    )
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="fadderbarn_declarations",
        on_delete=models.CASCADE,
    )
    # LEGO's user id. Matched on exactly; usernames change upstream, and a
    # mismatch here silently produces a missed or invented inhabilitet.
    lego_user_id = models.IntegerField()
    # Snapshots for display and audit only. Nothing matches on these.
    username = models.CharField(max_length=150, blank=True, default="")
    full_name = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["admission", "interviewer", "lego_user_id"],
                name="unique_fadderbarn_per_interviewer",
            )
        ]
        indexes = [
            models.Index(fields=["admission", "lego_user_id"]),
        ]

    def __str__(self):
        return f"{self.interviewer} is fadder for {self.full_name or self.lego_user_id}"


class ConflictReviewList(models.Model):
    """The candidates one interviewer is asked to check for inhabilitet.

    Snapshotted rather than derived per request so the list is identical across
    the GET, the POST, the completeness check and the audit log. A list that
    shifts between reads cannot be attested to.

    Three widening rings, and the difference between them is what may be
    *declared* versus what must be *confirmed*:

    - `own_candidate_ids` - this interviewer's proposed pairings.
    - `swap_candidate_ids` - candidates a repair could plausibly move onto
      their panel, so a repaired plan only ever contains reviewed pairs.
    - `pool_candidate_ids` - every candidate placed in the draft.

    `review_candidate_ids` (own + swap) is what publication waits for.
    `offered_candidate_ids` (all three) is what the interviewer is shown and
    may declare inhabilitet against. Keeping them apart is the point: the
    solver gets constraints over the whole iteration, while one unresponsive
    person still only blocks a publish over pairings that concern them.

    `decoys` padded a list that used to be a sample; a list that is the
    complete placed set has nothing to hide and carries none.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    saved_schedule = models.ForeignKey(
        "SavedSchedule",
        related_name="conflict_review_lists",
        on_delete=models.CASCADE,
    )
    # Shared by every row generated in one pass, so a stale attestation against
    # an older draft is detectable.
    revision = models.UUIDField()
    interviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="conflict_review_lists",
        on_delete=models.CASCADE,
    )
    own_candidate_ids = models.JSONField(default=list, blank=True)
    swap_candidate_ids = models.JSONField(default=list, blank=True)
    pool_candidate_ids = models.JSONField(default=list, blank=True)
    decoys = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["saved_schedule", "interviewer", "revision"],
                name="unique_conflict_review_list_per_revision",
            )
        ]

    @property
    def review_candidate_ids(self):
        """Everything this interviewer must check, real candidates only.

        Publication waits on exactly this set - deliberately not the wider
        offered list, so extending the plan never blocks a publish behind
        someone re-confirming candidates they were never assigned.
        """
        return list(
            dict.fromkeys(
                [str(value) for value in self.own_candidate_ids or []]
                + [str(value) for value in self.swap_candidate_ids or []]
            )
        )

    @property
    def offered_candidate_ids(self):
        """Everything this interviewer is shown and may flag, real only.

        The whole placed draft. Declaring inhabilitet here is what lets the
        solver avoid a bad pairing before it makes one, rather than having it
        rejected after the fact.
        """
        return list(
            dict.fromkeys(
                self.review_candidate_ids
                + [str(value) for value in self.pool_candidate_ids or []]
            )
        )

    def __str__(self):
        return f"Review list for {self.interviewer} ({self.revision})"


class CommitteeRosterEntry(models.Model):
    """One committee membership mirrored from LEGO, for roster display only.

    Deliberately not an authorization source. `Membership` stays the atomic
    snapshot taken from the person's own OAuth payload at login, and every
    permission check reads that and only that. This table answers a different
    question - who LEGO says the committee contains, including the people who
    have never opened admissions and so have no Membership row at all.

    Without it, "who has not answered yet" could only ever list the members who
    had already turned up to be asked, which is the wrong half of the committee:
    the ones an admin needs to chase are exactly the ones who never signed in.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(
        Group, related_name="roster_entries", on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="roster_entries",
        on_delete=models.CASCADE,
    )
    role = models.CharField(
        max_length=30, choices=constants.ROLES, default=constants.MEMBER
    )
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["group", "user"], name="unique_roster_group_user"
            )
        ]

    def __str__(self):
        return f"{self.user} is listed in {self.group} by LEGO"


class DirectoryEntry(models.Model):
    """A student synced from LEGO, drawn on for decoy filler names.


    Populated by a management command (and the solver worker's maintenance
    cycle) using a narrow, read-only service credential kept out of the request
    path entirely - never by anything an interviewer's own request triggers.
    Deliberately holds nothing but what a filler name needs to display; if this
    table is empty (no sync has run, e.g. no credential provisioned yet),
    decoys are simply omitted rather than synthesised - see
    build_conflict_review_lists.

    Covers every grade group, not just the first years: a decoy is only cover
    if a real applicant could plausibly have been drawn in its place.
    """

    lego_user_id = models.IntegerField(unique=True)
    username = models.CharField(max_length=150, blank=True, default="")
    full_name = models.CharField(max_length=255, blank=True, default="")
    synced_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name or self.username or str(self.lego_user_id)


class GodUser(models.Model):
    """LEGO id of a user granted admission-wide org leadership.

    The sole source of truth for god access. Only Webkom
    members can add or remove rows. The runtime check
    ``user_is_org_leadership(user)`` reads from this table.
    """

    id = models.AutoField(primary_key=True)
    lego_id = models.IntegerField(unique=True)
    note = models.CharField(max_length=200, blank=True, default="")
    added_by = models.ForeignKey(
        "LegoUser",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="god_user_entries_added",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"GodUser(lego_id={self.lego_id})"
