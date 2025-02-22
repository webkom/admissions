from datetime import timedelta

from django.utils import timezone

from admissions.admissions.models import Admission, LegoUser

DEFAULT_ADMISSION_SLUG = "opptak"


def fake_timedelta(days=0):
    base_date = timezone.now().replace(hour=12, minute=15, second=0, microsecond=0)

    return base_date + timedelta(days=days)


def create_admission(
    created_by=None,
    slug=None,
    title=None,
    open_from=None,
    public_deadline=None,
    closed_from=None,
):
    global DEFAULT_ADMISSION_SLUG

    if created_by is None:
        created_by = LegoUser.objects.create(username="creator", lego_id=1)

    if slug is None:
        slug = DEFAULT_ADMISSION_SLUG

    base_date = timezone.now().replace(hour=23, minute=59, second=59, microsecond=59)

    if title is None:
        title = f"Opptak {base_date.year}"

    if open_from is None:
        open_from = base_date.replace(
            hour=12, minute=15, second=0, microsecond=0
        ) - timedelta(days=1)

    if public_deadline is None:
        public_deadline = base_date + timedelta(days=7)

    if closed_from is None:
        closed_from = base_date + timedelta(days=9)

    return Admission.objects.create(
        created_by=created_by,
        slug=slug,
        title=title,
        open_from=open_from,
        public_deadline=public_deadline,
        closed_from=closed_from,
    )
