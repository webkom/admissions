from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from committee_admissions.utils.models import TimeStampModel


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


class Committee(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True, max_length=200)
    response_label = models.TextField(blank=True, max_length=200)
    logo = models.FileField(blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class UserApplication(TimeStampModel):
    admission = models.ForeignKey(Admission, related_name='applications', on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField(blank=True)
    time_sent = models.DateTimeField(editable=False, null=True)

    class Meta:
        unique_together = ('admission', 'user')

    @property
    def is_editable(self):
        return not self.admission.is_closed

    @property
    def is_sendable(self):
        return self.is_editable and self.committee_applications.exists()

    @property
    def applied_within_deadline(self):
        return self.time_sent < self.admission.public_deadline

    @property
    def sent(self):
        return bool(self.time_sent)

    def has_committee_application(self, committee):
        return self.committee_applications.filter(committee=committee).exists()


class CommitteeApplication(TimeStampModel):
    application = models.ForeignKey(
        UserApplication, related_name='committee_applications', on_delete=models.CASCADE
    )
    committee = models.ForeignKey(Committee, related_name='applications', on_delete=models.CASCADE)
    text = models.TextField(blank=True)
