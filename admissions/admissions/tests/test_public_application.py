from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import (
    AdmissionGroup,
    Group,
    GroupApplication,
    LegoUser,
    UserApplication,
)
from admissions.admissions.serializers import AdmissionPublicSerializer
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class CreateApplicationTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        # Create admission and group
        self.admission = create_admission()
        self.webkom = Group.objects.create(
            name="Webkom",
            lego_id=13,
            logo="https://example.com/webkom.png",
            response_label="Hvorfor vil du søke Webkom?",
        )
        self.koskom = Group.objects.create(name="Koskom", lego_id=9)
        self.admission.groups.add(self.webkom, self.koskom)

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna", lego_id=2)

        self.application_data = {
            "phone_number": "12345678",
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

    def test_priority_comment_is_saved_and_returned_to_the_applicant(self):
        self.client.force_authenticate(user=self.pleb_anna)
        priority_text = "1. Webkom\n2. Koskom"

        create_response = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            {**self.application_data, "priority_text": priority_text},
            format="json",
        )
        mine_response = self.client.get(
            reverse(
                "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            UserApplication.objects.get(
                user=self.pleb_anna, admission=self.admission
            ).text,
            priority_text,
        )
        self.assertEqual(mine_response.status_code, status.HTTP_200_OK)
        self.assertEqual(mine_response.data["priority_text"], priority_text)

    def test_my_application_includes_group_receipt_details(self):
        self.client.force_authenticate(user=self.pleb_anna)
        list_url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(list_url, self.application_data, format="json")

        res = self.client.get(
            reverse(
                "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        webkom = next(
            group_application["group"]
            for group_application in res.json()["group_applications"]
            if group_application["group"]["name"] == "Webkom"
        )
        self.assertEqual(webkom["logo"], "https://example.com/webkom.png")
        self.assertEqual(webkom["response_label"], "Hvorfor vil du søke Webkom?")

    def test_missing_group_selection_is_rejected_without_creating_candidate(self):
        self.client.force_authenticate(user=self.pleb_anna)
        data = {
            key: value
            for key, value in self.application_data.items()
            if key != "applications"
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

    def test_empty_group_selection_is_rejected_without_creating_candidate(self):
        self.client.force_authenticate(user=self.pleb_anna)
        data = {**self.application_data, "applications": {}}

        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_non_object_group_selection_is_rejected_without_server_error(self):
        self.client.force_authenticate(user=self.pleb_anna)
        data = {**self.application_data, "applications": ["webkom"]}

        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

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
            "phone_number": "12345678",
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
        Group.objects.create(name="Bedkom", lego_id=5)
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "phone_number": "12345678",
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
            "phone_number": "12345678",
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

    def test_legacy_general_questions_do_not_block_submission(self):
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
            "phone_number": "12345678",
            "applications": {"webkom": "x"},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_rejects_deprecated_general_application_answers(self):
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            {
                **self.application_data,
                "text": "Dette hører ikke til en komité.",
                "header_fields_response": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("text", response.data)
        self.assertIn("header_fields_response", response.data)

    def test_group_questions_are_saved_with_only_that_groups_application(self):
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(
            header_fields=[
                {
                    "id": "webkom_experience",
                    "type": "textinput",
                    "title": "Hva vil du lære i Webkom?",
                    "label": "",
                    "placeholder": "",
                    "required": True,
                }
            ]
        )
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            **self.application_data,
            "group_answers": {
                "webkom": {"webkom_experience": "Bygge nyttige ting"},
                "koskom": {},
            },
        }
        response = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        webkom_application = GroupApplication.objects.get(
            application__user=self.pleb_anna, group=self.webkom
        )
        koskom_application = GroupApplication.objects.get(
            application__user=self.pleb_anna, group=self.koskom
        )
        self.assertEqual(
            webkom_application.header_fields_response,
            {"webkom_experience": "Bygge nyttige ting"},
        )
        self.assertEqual(koskom_application.header_fields_response, {})

    def test_public_admission_exposes_questions_for_the_matching_group(self):
        question = {
            "id": "webkom_experience",
            "type": "textinput",
            "title": "Hva vil du lære i Webkom?",
            "label": "",
            "placeholder": "",
            "required": True,
        }
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(header_fields=[question])

        groups = AdmissionPublicSerializer(self.admission).data["groups"]
        questions_by_group = {group["name"]: group["header_fields"] for group in groups}

        self.assertEqual(questions_by_group["Webkom"], [question])
        self.assertEqual(questions_by_group["Koskom"], [])

    def test_missing_required_group_question_is_rejected(self):
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(
            header_fields=[
                {
                    "id": "webkom_experience",
                    "type": "textinput",
                    "title": "Hva vil du lære i Webkom?",
                    "label": "",
                    "placeholder": "",
                    "required": True,
                }
            ]
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            {**self.application_data, "group_answers": {"webkom": {}}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_group_checkbox_question_can_be_answered_with_boolean(self):
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(
            header_fields=[
                {
                    "id": "q_checkbox",
                    "type": "checkbox",
                    "title": "Har du erfaring?",
                    "label": "Merke dette",
                    "placeholder": "",
                    "required": True,
                }
            ]
        )
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "phone_number": "12345678",
            "applications": {"webkom": "x"},
            "group_answers": {"webkom": {"q_checkbox": True}},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            GroupApplication.objects.get(
                application__user=self.pleb_anna, group=self.webkom
            ).header_fields_response,
            {"q_checkbox": True},
        )

    def test_group_checkbox_question_rejects_false_when_required(self):
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(
            header_fields=[
                {
                    "id": "q_checkbox",
                    "type": "checkbox",
                    "title": "Har du erfaring?",
                    "label": "Merke dette",
                    "placeholder": "",
                    "required": True,
                }
            ]
        )
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "phone_number": "12345678",
            "applications": {"webkom": "x"},
            "group_answers": {"webkom": {"q_checkbox": False}},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_group_checkbox_question_rejects_non_boolean_payload(self):
        AdmissionGroup.objects.filter(
            admission=self.admission, group=self.webkom
        ).update(
            header_fields=[
                {
                    "id": "q_checkbox",
                    "type": "checkbox",
                    "title": "Har du erfaring?",
                    "label": "Merke dette",
                    "placeholder": "",
                    "required": False,
                }
            ]
        )
        self.client.force_authenticate(user=self.pleb_anna)

        data = {
            "phone_number": "12345678",
            "applications": {"webkom": "x"},
            "group_answers": {"webkom": {"q_checkbox": "true"}},
        }
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_email_failure_does_not_block_application_edit(self):
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(
            url,
            self.application_data,
            format="json",
        )
        self.assertEqual(
            2,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

        edit = {
            "phone_number": "12345678",
            "applications": {"webkom": "still want webkom"},
        }
        with patch(
            "admissions.admissions.serializers.send_message",
            side_effect=Exception("smtp down"),
        ):
            res = self.client.post(url, edit, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
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
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())
