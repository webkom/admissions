from django.db import transaction
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

from admissions.admissions.models import Admission, UserApplication
from admissions.admissions.schedule_invalidation import invalidate_schedule_scope


@receiver(post_save, sender=UserApplication)
def invalidate_new_candidate_scope(sender, instance, created, **kwargs):
    if not created:
        return
    with transaction.atomic():
        admission = Admission.objects.select_for_update().get(pk=instance.admission_id)
        invalidate_schedule_scope(admission)


@receiver(pre_delete, sender=UserApplication)
def purge_withdrawn_candidate(sender, instance, **kwargs):
    with transaction.atomic():
        admission = Admission.objects.select_for_update().get(pk=instance.admission_id)
        invalidate_schedule_scope(
            admission,
            removed_candidate_id=instance.pk,
        )
