import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.utils import timezone

from admissions.admissions import constants
from admissions.utils.models import TimeStampModel


class LegoUser(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lego_id = models.IntegerField(unique=True, null=False, editable=False)

    profile_picture = models.URLField(null=True, blank=True)

    @property
    def representative_of_group(self):
        """
        Return the name of the group this user is the representative for
        """
        membership = (
            Membership.objects.filter(user=self)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
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
        try:
            webkom = Group.objects.get(name=constants.WEBKOM_GROUPNAME)
        except Group.DoesNotExist:
            # Allow the project to run without a group named "webkom" initialized
            return False
        return Membership.objects.filter(user=self, group=webkom).exists()


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lego_id = models.IntegerField(unique=True, null=False, editable=False)
    name = models.CharField(max_length=80, unique=True)
    logo = models.URLField(null=True, blank=True)
    detail_link = models.CharField(max_length=150, default="")

    response_label = models.TextField(blank=True, max_length=300)
    description = models.TextField(blank=True, max_length=300)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Admission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_by = models.ForeignKey(
        LegoUser, null=True, related_name="admissions", on_delete=models.CASCADE
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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    application = models.ForeignKey(
        UserApplication, related_name="group_applications", on_delete=models.CASCADE
    )
    group = models.ForeignKey(
        Group, related_name="applications", on_delete=models.CASCADE
    )
    text = models.TextField(blank=True)


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
