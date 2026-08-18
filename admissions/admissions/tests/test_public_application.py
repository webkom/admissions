from unittest.mock import patch

from django.core import mail
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions import constants
from admissions.admissions.models import (
    AdmissionGroup,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    SavedSchedule,
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
            description="Webkom lager og drifter digitale tjenester for Abakus.",
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
        AdmissionGroup.objects.filter(
            admission=self.admission,
            group=self.webkom,
        ).update(
            application_guidance=("Fortell hva du vil lære og bygge sammen med Webkom.")
        )
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
        self.assertEqual(
            webkom["response_label"],
            "Fortell hva du vil lære og bygge sammen med Webkom.",
        )

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

    def test_public_admission_normalizes_null_group_questions_to_an_empty_list(self):
        AdmissionGroup.objects.filter(
            admission=self.admission,
            group=self.webkom,
        ).update(header_fields=None)

        groups = AdmissionPublicSerializer(self.admission).data["groups"]
        webkom = next(group for group in groups if group["name"] == "Webkom")

        self.assertEqual(webkom["header_fields"], [])

    def test_public_admission_exposes_scoped_committee_content_with_fallback(self):
        AdmissionGroup.objects.filter(
            admission=self.admission,
            group=self.webkom,
        ).update(
            committee_info=(
                "I dette opptaket søker Webkom spesielt etter nye utviklere."
            ),
            application_guidance=("Fortell om noe du har vært nysgjerrig på å lage."),
            interview_description=("Intervjuet består av en kort samtale."),
        )

        groups = AdmissionPublicSerializer(self.admission).data["groups"]
        groups_by_name = {group["name"]: group for group in groups}

        self.assertEqual(
            groups_by_name["Webkom"]["description"],
            "I dette opptaket søker Webkom spesielt etter nye utviklere.",
        )
        self.assertEqual(
            groups_by_name["Webkom"]["response_label"],
            "Fortell om noe du har vært nysgjerrig på å lage.",
        )
        self.assertEqual(
            groups_by_name["Webkom"]["interview_description"],
            "Intervjuet består av en kort samtale.",
        )
        self.assertEqual(groups_by_name["Koskom"]["description"], "")
        self.assertEqual(groups_by_name["Koskom"]["response_label"], "")

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

    def _publish_plan_for(self, application):
        return SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[
                {
                    "candidate_id": str(application.pk),
                    "candidate": "Anna",
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date="2026-04-21",
            session_duration=60,
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )

    def test_dropping_one_committee_flags_a_published_plan(self):
        """Consistent with a full withdrawal, which already un-publishes.

        The candidate keeps their interview, so the schedule rows stay; what
        must not stand is a published plan whose panel was chosen for a
        committee the applicant no longer applies to.
        """
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(url, self.application_data, format="json")
        application = UserApplication.objects.get(user=self.pleb_anna)
        saved = self._publish_plan_for(application)

        self.client.post(
            url,
            {
                "phone_number": "12345678",
                "applications": {"webkom": "still want webkom"},
            },
            format="json",
        )

        saved.refresh_from_db()
        self.assertFalse(saved.is_distributed)
        self.assertEqual(SavedSchedule.NAME_VISIBILITY_HIDDEN, saved.name_visibility)
        # The interview itself survives: they are still a candidate.
        self.assertEqual(1, len(saved.schedule))

    def test_full_withdrawal_still_removes_the_candidate(self):
        """The cascade must not be short-circuited by the new receiver."""
        self.client.force_authenticate(user=self.pleb_anna)
        list_url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(list_url, self.application_data, format="json")
        application = UserApplication.objects.get(user=self.pleb_anna)
        saved = self._publish_plan_for(application)

        mine_url = reverse(
            "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.delete(mine_url)

        saved.refresh_from_db()
        self.assertFalse(saved.is_distributed)
        self.assertEqual([], saved.schedule)

    def test_partial_withdrawal_uses_its_own_message(self):
        """Unticking one committee must not read as leaving the admission.

        Both paths used the same anonymous template, so recruiters could not
        tell a partial withdrawal from a full one.
        """
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(url, self.application_data, format="json")
        # Someone must be listening, or Django never puts a mail in the outbox.
        recruiter = LegoUser.objects.create(
            username="koskom-recruiter", lego_id=8801, email="koskom@abakus.no"
        )
        Membership.objects.create(
            user=recruiter, group=self.koskom, role=constants.RECRUITING
        )
        mail.outbox = []

        res = self.client.post(
            url,
            {
                "phone_number": "12345678",
                "applications": {"webkom": "still want webkom"},
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(1, len(mail.outbox))
        sent = mail.outbox[0]
        self.assertIn("trukket", sent.subject)
        self.assertIn(self.koskom.name, sent.subject)
        self.assertIn("fortsatt en aktiv søknad", sent.body)
        # Anonymous by design: the recruiter learns what happened, not who.
        # (Guarded: assertNotIn("") is vacuously true, and this fixture user
        # has no name or email set.)
        self.assertTrue(self.pleb_anna.username)
        self.assertNotIn(self.pleb_anna.username, sent.body)

    def test_reapplying_to_a_dropped_committee_notifies_nobody(self):
        """The candidate list is computed live, so a re-tick needs no mail."""
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(url, self.application_data, format="json")
        self.client.post(
            url,
            {
                "phone_number": "12345678",
                "applications": {"webkom": "still want webkom"},
            },
            format="json",
        )
        mail.outbox = []

        res = self.client.post(url, self.application_data, format="json")

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual([], mail.outbox)

    def test_partial_withdrawal_keeps_the_deadline_flag(self):
        """The dialog promises this, so pin it."""
        self.client.force_authenticate(user=self.pleb_anna)
        url = reverse(
            "userapplication-list", kwargs={"admission_slug": self.admission_slug}
        )
        self.client.post(url, self.application_data, format="json")
        before = UserApplication.objects.get(user=self.pleb_anna)
        applied_within_deadline = before.applied_within_deadline
        created_at = before.created_at

        self.client.post(
            url,
            {
                "phone_number": "12345678",
                "applications": {"webkom": "still want webkom"},
            },
            format="json",
        )

        after = UserApplication.objects.get(user=self.pleb_anna)
        self.assertEqual(created_at, after.created_at)
        self.assertEqual(applied_within_deadline, after.applied_within_deadline)

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
