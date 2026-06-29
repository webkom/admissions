from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    UserApplication,
)
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class CreateApplicationTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        # Create admission and group
        self.admission = create_admission()
        self.webkom = Group.objects.create(name="Webkom", lego_id=13)
        self.koskom = Group.objects.create(name="Koskom", lego_id=9)
        self.admission.groups.add(self.webkom, self.koskom)

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna", lego_id=2)

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {
                "webkom": "Hohohohohohohohohohooho webbis",
                "koskom": "Hahahahahahahahahahaha arris",
            },
        }

        # Setup Bob
        self.pleb_bob = LegoUser.objects.create(username="Bob", lego_id=3)

    def test_cannot_apply_for_someone_else(self):
        # Login as Bob, and try to apply as Anna. User should then be Bob
        self.client.force_authenticate(user=self.pleb_bob)

        annas_application_data = self.application_data.copy()

        annas_application_data["user"] = self.pleb_anna.pk

        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            annas_application_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        pk_res = res.json()["pk"]

        # Application registered as bob
        self.assertEqual(UserApplication.objects.get(pk=pk_res).user, self.pleb_bob)

    def test_can_apply(self):
        self.client.force_authenticate(user=self.pleb_anna)
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_editing_application_works_correctly(self):
        self.client.force_authenticate(user=self.pleb_anna)

        # Apply first with webkom and koskom
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(
            2,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"webkom": "Hohohohohohohohohohooho webbis"},
        }

        # Apply then only with webkom, removing koskom
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(
            1,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

    def test_cannot_apply_for_group_outside_admission(self):
        # Bedkom exists but is not part of this admission.
        Group.objects.create(name="Bedkom", lego_id=5)
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "text": "x",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"bedkom": "should be rejected"},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_unknown_group_name_returns_400_not_500(self):
        self.client.force_authenticate(user=self.pleb_anna)
        data = {
            "text": "x",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"this-group-does-not-exist": "x"},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_required_header_field_is_rejected(self):
        self.admission.header_fields = [
            {
                "id": "q1",
                "type": "textinput",
                "title": "Question one",
                "label": "Q1",
                "placeholder": "",
                "required": True,
            }
        ]
        self.admission.save()
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "text": "x",
            "phone_number": "12345678",
            "header_fields_response": {},  # required q1 omitted
            "applications": {"webkom": "x"},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_email_failure_does_not_block_application_edit(self):
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        # Apply to both groups first.
        self.client.post(
            url,
            self.application_data,
            format="json",
        )
        self.assertEqual(
            2,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

        # Re-apply with only webkom (drops koskom -> triggers withdrawal email),
        # but the mail server is down.
        edit = {
            "text": "x",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"webkom": "still want webkom"},
        }
        with patch(
            "admissions.admissions.serializers.send_message",
            side_effect=Exception("smtp down"),
        ):
            res = self.client.post(url, edit, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # The withdrawal still persisted despite the email failure.
        self.assertEqual(
            1,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )
        self.assertFalse(
            GroupApplication.objects.filter(
                application__user=self.pleb_anna, group=self.koskom
            ).exists()
        )

    def test_email_failure_does_not_block_withdrawal(self):
        self.client.force_authenticate(user=self.pleb_anna)
        list_url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(list_url, self.application_data, format="json")
        self.assertTrue(UserApplication.objects.filter(user=self.pleb_anna).exists())

        mine_url = reverse(
            "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
        )
        with patch(
            "admissions.admissions.views.send_message",
            side_effect=Exception("smtp down"),
        ):
            res = self.client.delete(mine_url)

        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        # The application is gone despite the notification failing.
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())
