from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import MEMBER, RETIREE
from admissions.admissions.models import Admission, Group, LegoUser, Membership


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
            "header_fields": [],
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

    def test_invalid_custom_questions_return_a_safe_error(self):
        response = self.client.post(
            self.url,
            self.payload(
                header_fields=[
                    {
                        "type": "textinput",
                        "id": "question-with-private-draft",
                        "title": "No",
                        "label": "private draft value",
                        "placeholder": "",
                        "required": False,
                    }
                ]
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["header_fields"],
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
            self.payload(header_fields=[question, question]),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["header_fields"],
            "Spørsmålsoppsettet er ugyldig.",
        )
        self.assertFalse(Admission.objects.filter(slug="komiteopptak-2027").exists())

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
