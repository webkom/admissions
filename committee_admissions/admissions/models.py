from django.conf import settings
from django.contrib.auth.models import AbstractUser, Group
from django.db import models
from django.db.models import Q
from django.utils import timezone

from committee_admissions.admissions import constants
from committee_admissions.utils.models import TimeStampModel


class LegoUser(AbstractUser):
    profile_picture = models.URLField(null=True, blank=True)

    @property
    def is_privileged(self):
        """
        Return true if the user is Abakus Leader or has admission privileges
        """
        return bool(self.is_superuser or self.admission_privileges)

    @property
    def admission_privileges(self):
        """
        Return true if the user has the role of LEADER or RECRUTING
        """
        return (
            Membership.objects.filter(user=self)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .exists()
        )

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
    def has_application(self):
        """
        Return true if this user has a registrered application
        """
        return UserApplication.objects.filter(user=self).exists()


class Admission(models.Model):
    title = models.CharField(max_length=255)
    open_from = models.DateTimeField()
    public_deadline = models.DateTimeField()
    application_deadline = models.DateTimeField()

    def __str__(self):
        return self.title

    @property
    def is_open(self):
        return self.application_deadline > timezone.now() > self.open_from

    @property
    def is_closed(self):
        return timezone.now() > self.application_deadline

    @property
    def is_appliable(self):
        return self.public_deadline > timezone.now() > self.open_from


class Group(models.Model):
    admissions = models.ManyToManyField(Admission)
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, max_length=300)
    response_label = models.TextField(blank=True, max_length=300)
    logo = models.URLField(null=True, blank=True)
    detail_link = models.CharField(max_length=150, default="")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class UserApplication(TimeStampModel):
    admission = models.ForeignKey(
        Admission, related_name="applications", on_delete=models.CASCADE
    )
    user = models.ForeignKey(LegoUser, on_delete=models.CASCADE)
    text = models.TextField(blank=True)
    phone_number = models.CharField(max_length=20)

    class Meta:
        unique_together = ("admission", "user")

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
    application = models.ForeignKey(
        UserApplication, related_name="group_applications", on_delete=models.CASCADE
    )
    group = models.ForeignKey(
        Group, related_name="applications", on_delete=models.CASCADE
    )
    text = models.TextField(blank=True)


class Membership(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    group = models.ForeignKey(Group, on_delete=models.CASCADE)
    role = models.CharField(
        max_length=30, choices=constants.ROLES, default=constants.MEMBER
    )

    class Meta:
        unique_together = ("user", "group")

    def __str__(self):
        return f"{self.user} is in {self.group}"
