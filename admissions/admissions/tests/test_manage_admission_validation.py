from datetime import timedelta
from unittest.mock import PropertyMock, patch

from django.db import IntegrityError, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import MEMBER, RETIREE
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    LegoUser,
    Membership,
)
from admissions.admissions.serializers import AdmissionPublicSerializer


class ManageAdmissionValidationTestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(name="Webkom", lego_id=700)
        self.committee = Group.objects.create(name="Fagkom", lego_id=701)
        self.manager = LegoUser.objects.create(username="manager", lego_id=702)
        Membership.objects.create(
            user=self.manager,
            group=self.webkom,
            role=MEMBER,
        )
        self.client.force_authenticate(user=self.manager)
        self.url = reverse("manage-admission-list")

    def payload(self, **overrides):
        opening = timezone.now() + timedelta(days=1)
        payload = {
            "title": "Komiteopptak 2027",
            "slug": "komiteopptak-2027",
            "description": "Opptak til Abakus sine komiteer.",
            "group_questions": {},
            "group_content": {
                str(self.committee.pk): {
                    "committee_info": (
                        "Fagkom arrangerer kurs og andre lærerike aktiviteter."
                    ),
                    "application_guidance": (
                        "Fortell hvorfor du vil bli med og hva du ønsker å bidra med."
                    ),
                }
            },
            "open_from": opening,
            "public_deadline": opening + timedelta(days=7),
            "closed_from": opening + timedelta(days=8),
            "admin_groups": [str(self.webkom.pk)],
            "groups": [str(self.committee.pk)],
        }
        payload.update(overrides)
        return payload

    def test_rejects_an_admission_with_an_impossible_date_order(self):
        opening = timezone.now() + timedelta(days=3)

        response = self.client.post(
            self.url,
            self.payload(
                open_from=opening,
                public_deadline=opening - timedelta(days=1),
                closed_from=opening + timedelta(days=1),
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("public_deadline", response.data)
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

    def test_rejects_an_admission_without_responsible_groups(self):
        response = self.client.post(
            self.url,
            self.payload(admin_groups=[], groups=[]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("admin_groups", response.data)
        self.assertIn("groups", response.data)
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

    def test_rejects_an_admission_that_closes_before_the_public_deadline(self):
        opening = timezone.now() + timedelta(days=1)

        response = self.client.post(
            self.url,
            self.payload(
                open_from=opening,
                public_deadline=opening + timedelta(days=3),
                closed_from=opening + timedelta(days=2),
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("closed_from", response.data)

    def test_allows_checkbox_questions(self):
        question = {
            "id": "q_checkbox",
            "type": "checkbox",
            "title": "Har du erfaring?",
            "label": "Markér dette",
            "placeholder": "",
            "required": False,
        }
        response = self.client.post(
            self.url,
            self.payload(group_questions={str(self.committee.pk): [question]}),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        admission = Admission.objects.get(slug="komiteopptak-2027")
        self.assertEqual(
            AdmissionGroup.objects.get(
                admission=admission, group=self.committee
            ).header_fields,
            [question],
        )

    def test_group_questions_are_not_reused_by_a_later_admission(self):
        question = {
            "id": "q_experience",
            "type": "textinput",
            "title": "Hva slags erfaring har du?",
            "label": "",
            "placeholder": "",
            "required": False,
        }
        first = self.client.post(
            self.url,
            self.payload(group_questions={str(self.committee.pk): [question]}),
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            self.url,
            self.payload(
                title="Komiteopptak 2028",
                slug="komiteopptak-2028",
                group_questions={},
            ),
            format="json",
        )
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)

        self.assertEqual(
            AdmissionGroup.objects.get(
                admission__slug="komiteopptak-2027", group=self.committee
            ).header_fields,
            [question],
        )
        self.assertEqual(
            AdmissionGroup.objects.get(
                admission__slug="komiteopptak-2028", group=self.committee
            ).header_fields,
            [],
        )

    def test_saves_admission_scoped_committee_content(self):
        committee_info = "Fagkom skaper faglige og sosiale møteplasser for studentene."
        application_guidance = (
            "Fortell hva du liker å lære og hva du ønsker å bidra med."
        )
        interview_description = "Intervjuet er en samtale om motivasjon og samarbeid."

        response = self.client.post(
            self.url,
            self.payload(
                group_content={
                    str(self.committee.pk): {
                        "committee_info": committee_info,
                        "application_guidance": application_guidance,
                        "interview_description": interview_description,
                    }
                }
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        admission = Admission.objects.get(slug="komiteopptak-2027")
        relation = AdmissionGroup.objects.get(
            admission=admission,
            group=self.committee,
        )
        self.assertEqual(relation.committee_info, committee_info)
        self.assertEqual(relation.application_guidance, application_guidance)
        self.assertEqual(relation.interview_description, interview_description)
        serialized_group = AdmissionPublicSerializer(admission).data["groups"][0]
        self.assertEqual(serialized_group["description"], committee_info)
        self.assertEqual(serialized_group["response_label"], application_guidance)
        self.assertEqual(
            serialized_group["interview_description"], interview_description
        )

    def test_committee_content_is_not_reused_by_a_later_admission(self):
        first = self.client.post(self.url, self.payload(), format="json")
        second = self.client.post(
            self.url,
            self.payload(
                title="Komiteopptak 2028",
                slug="komiteopptak-2028",
                group_content={
                    str(self.committee.pk): {
                        "committee_info": "Ny informasjon for opptaket i 2028.",
                        "application_guidance": (
                            "Et nytt søknadsfokus som bare gjelder opptaket i 2028."
                        ),
                    }
                },
            ),
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        first_relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2027",
            group=self.committee,
        )
        second_relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2028",
            group=self.committee,
        )
        self.assertNotEqual(
            first_relation.committee_info,
            second_relation.committee_info,
        )
        self.assertNotEqual(
            first_relation.application_guidance,
            second_relation.application_guidance,
        )

    def test_fallback_content_remains_inherited_after_an_unrelated_edit(self):
        self.committee.description = "Global komitéinfo før redigering."
        self.committee.response_label = "Global søknadsveiledning før redigering."
        self.committee.save(update_fields=["description", "response_label"])
        inherited_content = {
            str(self.committee.pk): {
                "committee_info": None,
                "application_guidance": None,
            }
        }
        created = self.client.post(
            self.url,
            self.payload(group_content=inherited_content),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        detail_url = reverse(
            "manage-admission-detail",
            kwargs={"slug": "komiteopptak-2027"},
        )
        before = self.client.get(detail_url)
        self.assertEqual(before.status_code, status.HTTP_200_OK)
        self.assertEqual(before.data["groups"][0]["committee_info"], None)
        self.assertEqual(before.data["groups"][0]["application_guidance"], None)
        self.assertEqual(
            before.data["groups"][0]["description"],
            "Global komitéinfo før redigering.",
        )

        updated = self.client.patch(
            detail_url,
            {
                "title": "Komiteopptak 2027 – oppdatert",
                "group_questions": {},
                "group_content": inherited_content,
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)

        self.committee.description = "Global komitéinfo etter redigering."
        self.committee.response_label = "Global søknadsveiledning etter redigering."
        self.committee.save(update_fields=["description", "response_label"])
        after = self.client.get(detail_url)

        self.assertEqual(
            after.data["groups"][0]["description"],
            "Global komitéinfo etter redigering.",
        )
        self.assertEqual(
            after.data["groups"][0]["response_label"],
            "Global søknadsveiledning etter redigering.",
        )
        relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2027",
            group=self.committee,
        )
        self.assertIsNone(relation.committee_info)
        self.assertIsNone(relation.application_guidance)

    def test_legacy_content_update_preserves_interview_description(self):
        created = self.client.post(
            self.url,
            self.payload(
                group_content={
                    str(self.committee.pk): {
                        "committee_info": "Fagkom skaper faglige møteplasser.",
                        "application_guidance": "Fortell hva du ønsker å bidra med.",
                        "interview_description": "Intervjuet er en kort samtale.",
                    }
                }
            ),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        updated = self.client.patch(
            reverse(
                "manage-admission-detail",
                kwargs={"slug": "komiteopptak-2027"},
            ),
            {
                "group_content": {
                    str(self.committee.pk): {
                        "committee_info": "Fagkom lager kurs og arrangementer.",
                        "application_guidance": "Fortell hva du vil lære.",
                    }
                }
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2027",
            group=self.committee,
        )
        self.assertEqual(
            relation.interview_description,
            "Intervjuet er en kort samtale.",
        )

    def test_empty_question_submission_does_not_validate_hidden_legacy_questions(self):
        created = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2027",
            group=self.committee,
        )
        relation.header_fields = [{"type": "legacy-invalid-question"}]
        relation.save(update_fields=["header_fields"])

        response = self.client.patch(
            reverse(
                "manage-admission-detail",
                kwargs={"slug": "komiteopptak-2027"},
            ),
            {
                "title": "Komiteopptak 2027 – uten synlig spørsmålsbygger",
                "group_questions": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        relation.refresh_from_db()
        self.assertEqual(
            relation.header_fields,
            [{"type": "legacy-invalid-question"}],
        )

    def test_rejects_committee_content_for_a_group_outside_the_admission(self):
        response = self.client.post(
            self.url,
            self.payload(
                group_content={
                    str(self.webkom.pk): {
                        "committee_info": "Webkom lager digitale tjenester.",
                        "application_guidance": (
                            "Fortell hva du ønsker å bygge sammen med Webkom."
                        ),
                    }
                }
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("group_content", response.data)
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

    def test_saves_questions_on_the_selected_admission_group(self):
        question = {
            "id": "why_fagkom",
            "type": "textarea",
            "title": "Hva vil du bidra med i Fagkom?",
            "label": "",
            "placeholder": "",
            "required": True,
        }
        response = self.client.post(
            self.url,
            self.payload(group_questions={str(self.committee.pk): [question]}),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        admission = Admission.objects.get(slug="komiteopptak-2027")
        self.assertEqual(
            AdmissionGroup.objects.get(
                admission=admission, group=self.committee
            ).header_fields,
            [question],
        )

    def test_rejects_questions_for_a_group_outside_the_admission(self):
        question = {
            "id": "why_webkom",
            "type": "textinput",
            "title": "Hva vil du bidra med i Webkom?",
            "label": "",
            "placeholder": "",
            "required": False,
        }
        response = self.client.post(
            self.url,
            self.payload(group_questions={str(self.webkom.pk): [question]}),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("group_questions", response.data)

    def test_rejects_deprecated_general_questions(self):
        response = self.client.post(
            self.url,
            self.payload(header_fields=[]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("header_fields", response.data)

    def test_invalid_custom_questions_return_a_safe_error(self):
        response = self.client.post(
            self.url,
            self.payload(
                group_questions={
                    str(self.committee.pk): [
                        {
                            "type": "textinput",
                            "id": "question-with-private-draft",
                            "title": "No",
                            "label": "private draft value",
                            "placeholder": "",
                            "required": False,
                        }
                    ]
                }
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(response.data["group_questions"][0]),
            "Spørsmålsoppsettet er ugyldig.",
        )
        self.assertNotContains(response, "private draft value", status_code=400)

    def test_rejects_duplicate_custom_question_ids(self):
        question = {
            "type": "textinput",
            "id": "duplicate-question",
            "title": "Gyldig spørsmål",
            "label": "",
            "placeholder": "",
            "required": False,
        }

        response = self.client.post(
            self.url,
            self.payload(
                group_questions={str(self.committee.pk): [question, question]}
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(response.data["group_questions"][0]),
            "Spørsmålsoppsettet er ugyldig.",
        )
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

    def test_rejects_duplicate_slug_with_a_field_error(self):
        created = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        duplicate = self.client.post(
            self.url,
            self.payload(title="Et annet opptak"),
            format="json",
        )

        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slug", duplicate.data)
        self.assertEqual(
            Admission.objects.filter(slug="komiteopptak-2027").count(),
            1,
        )

    def test_create_does_not_require_accessing_saved_schedule_relation(self):
        with patch.object(
            Admission,
            "saved_schedules",
            new_callable=PropertyMock,
            side_effect=AssertionError("saved_schedules should not be accessed"),
        ):
            response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_inactive_webkom_member_cannot_create_an_admission(self):
        inactive = LegoUser.objects.create(username="inactive-manager", lego_id=703)
        Membership.objects.create(user=inactive, group=self.webkom, role=RETIREE)
        self.client.force_authenticate(user=inactive)

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

    def test_partial_update_preserves_omitted_admission_configuration(self):
        created = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        response = self.client.patch(
            reverse(
                "manage-admission-detail",
                kwargs={"slug": "komiteopptak-2027"},
            ),
            {"title": "Komiteopptak 2027 – oppdatert"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Komiteopptak 2027 – oppdatert")
        self.assertEqual(response.data["admin_groups"], [self.webkom.pk])
        self.assertEqual(response.data["groups"], [self.committee.pk])
        relation = AdmissionGroup.objects.get(
            admission__slug="komiteopptak-2027",
            group=self.committee,
        )
        self.assertEqual(
            relation.committee_info,
            "Fagkom arrangerer kurs og andre lærerike aktiviteter.",
        )
        self.assertEqual(
            relation.application_guidance,
            "Fortell hvorfor du vil bli med og hva du ønsker å bidra med.",
        )


class AdmissionDateConstraintTestCase(TransactionTestCase):
    def test_database_rejects_an_impossible_date_order(self):
        opening = timezone.now() + timedelta(days=2)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Admission.objects.create(
                title="Ugyldig opptak",
                slug="ugyldig-opptak",
                open_from=opening,
                public_deadline=opening - timedelta(days=1),
                closed_from=opening + timedelta(days=1),
            )
