from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import Group, LegoUser, UserApplication
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission

valid_application_data = {
    "text": "Ønsker Webkom mest",
    "phone_number": "12345678",
    "header_fields_response": {},
    "applications": {
        "webkom": "Hohohohohohohohohohooho webbis",
        "koskom": "Hahahahahahahahahahaha arris",
    },
}


def post_application(self, application_data: dict = None) -> HttpResponse:
    if application_data is None:
        global valid_application_data
        application_data = valid_application_data
    return self.client.post(
        reverse("user-application", kwargs={"admission_slug": self.admission.slug}),
        application_data,
        format="json",
    )


class ApplicationAuthorizationTestCase(APITestCase):
    """
    Verify that the proper permissions are enforced
    """

    def setUp(self) -> None:
        self.admission = create_admission()
        global valid_application_data
        self.valid_application_data = valid_application_data

        Group.objects.create(name="webkom")
        Group.objects.create(name="koskom")

    def test_unauthorized_cannot_create_application(self) -> None:
        res = post_application(self)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_cannot_create_application(self) -> None:
        self.client.force_authenticate(AnonymousUser())
        res = post_application(self)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_normal_user_can_create_application(self) -> None:
        user = LegoUser.objects.create(username="pleb")
        self.client.force_authenticate(user)
        res = post_application(self)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)


class CreateApplicationTestCase(APITestCase):
    def setUp(self) -> None:
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        # Create admission and group
        self.admission = create_admission()
        self.webkom = Group.objects.create(name="Webkom")
        self.koskom = Group.objects.create(name="Koskom")

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna")

        # Setup Bob
        self.pleb_bob = LegoUser.objects.create(username="Bob")

    def test_cannot_apply_for_someone_else(self) -> None:
        # Login as Bob, and try to apply as Anna. User should then be Bob
        self.client.force_authenticate(user=self.pleb_bob)

        res = post_application(self)

        self.assertEqual(
            res.status_code,
            status.HTTP_201_CREATED,
            "Application failed to be created",
        )

        pk_res = res.json()["pk"]

        # Application registered as bob
        self.assertEqual(UserApplication.objects.get(pk=pk_res).user, self.pleb_bob)

    def test_can_apply(self) -> None:
        self.client.force_authenticate(user=self.pleb_anna)
        res = post_application(self)

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # UserApplication.objects.create(user=self.pleb, admission=self.admission)

        res = self.client.get(
            reverse(
                "user-application",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_editing_application_works_correctly(self) -> None:
        self.client.force_authenticate(user=self.pleb_anna)

        # Apply first with webkom and koskom
        post_application(self)

        self.assertEqual(
            2,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

        valid_application_data = {
            "text": "Ønsker Webkom mest",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"webkom": "Hohohohohohohohohohooho webbis"},
        }

        # Apply then only with webkom, removing koskom
        post_application(self, application_data=valid_application_data)

        self.assertEqual(
            1,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )
