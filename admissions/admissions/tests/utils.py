from datetime import timedelta

from django.urls import Resolver404, resolve
from django.utils import timezone
from rest_framework.test import APIClient

from admissions.admissions.models import (
    Admission,
    InterviewAvailability,
    LegoUser,
    SavedSchedule,
)

DEFAULT_ADMISSION_SLUG = "opptak"


class ScheduleRevisionAPIClient(APIClient):
    def post(self, path, data=None, *args, **kwargs):
        payload = data
        try:
            match = resolve(path)
        except Resolver404:
            match = None
        if (
            match is not None
            and match.url_name == "saved-schedule"
            and isinstance(data, dict)
            and "expected_updated_at" not in data
        ):
            saved_schedule = SavedSchedule.objects.filter(
                admission__slug=match.kwargs["admission_slug"]
            ).first()
            payload = {
                **data,
                "expected_updated_at": (
                    saved_schedule.updated_at.isoformat() if saved_schedule else None
                ),
            }
        if (
            match is not None
            and match.url_name == "interview-availability"
            and isinstance(data, dict)
            and "expected_availability_updated_at" not in data
        ):
            authenticated_user = getattr(self.handler, "_force_user", None)
            target_user_id = data.get("user_id") or getattr(
                authenticated_user,
                "pk",
                None,
            )
            availability = InterviewAvailability.objects.filter(
                admission__slug=match.kwargs["admission_slug"],
                user_id=target_user_id,
            ).first()
            payload = {
                **data,
                "expected_availability_updated_at": (
                    availability.updated_at.isoformat() if availability else None
                ),
            }
        return super().post(path, payload, *args, **kwargs)


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
