from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import Group, LegoUser, Membership
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


@override_settings(ADMISSIONS_SCHEDULER_ENABLED=False)
class SchedulerFeatureGateTestCase(APITestCase):
    """The scheduler must fail closed until its worker is deployed with it.

    SolveJob is unique over active jobs per admission, so a solve started with
    no worker leaves a PENDING row that blocks every later solve for that
    admission. The gate exists so the feature cannot be reached before the
    worker service exists.
    """

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.user = LegoUser.objects.create(username="committee", lego_id=41)
        Membership.objects.create(user=self.user, group=self.group, role="member")
        self.client.force_authenticate(user=self.user)

    def test_scheduler_endpoints_are_unavailable(self):
        for route in (
            "saved-schedule",
            "interview-availability",
            "interview-candidates",
        ):
            with self.subTest(route=route):
                res = self.client.get(
                    reverse(route, kwargs={"admission_slug": DEFAULT_ADMISSION_SLUG})
                )
                self.assertEqual(status.HTTP_503_SERVICE_UNAVAILABLE, res.status_code)

    def test_solving_is_unavailable(self):
        res = self.client.post(reverse("solve-schedule"), {}, format="json")
        self.assertEqual(status.HTTP_503_SERVICE_UNAVAILABLE, res.status_code)

    def test_worker_refuses_to_run_half_enabled(self):
        """A worker claiming jobs while the web app rejects them is worse than
        a worker that exits saying why."""
        with self.assertRaises(CommandError) as caught:
            call_command("run_solver_worker", "--once")
        self.assertIn("ADMISSIONS_SCHEDULER_ENABLED", str(caught.exception))


class SchedulerEnabledTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.user = LegoUser.objects.create(username="committee", lego_id=41)
        Membership.objects.create(user=self.user, group=self.group, role="member")
        self.client.force_authenticate(user=self.user)

    def test_the_gate_is_open_by_default(self):
        """Guards against the flag silently disabling the feature everywhere."""
        res = self.client.get(
            reverse(
                "interview-availability",
                kwargs={"admission_slug": DEFAULT_ADMISSION_SLUG},
            )
        )
        self.assertNotEqual(status.HTTP_503_SERVICE_UNAVAILABLE, res.status_code)
