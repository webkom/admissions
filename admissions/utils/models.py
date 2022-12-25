from django.db import models
from django.utils import timezone


class TimeStampModel(models.Model):
    """
    Attach created_at and updated_at fields automatically on all model instances.
    """

    created_at = models.DateTimeField(
        default=timezone.now, editable=False, db_index=True
    )
    updated_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.updated_at = timezone.now()
        super().save(*args, **kwargs)
