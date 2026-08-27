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


class AdministeredAdmissionListEndpointTestCase(APITestCase):
    """The read-only ``GET /api/manage/admission-admin/`` endpoint.

    Returns a minimal payload (slug, title, dates, userdata) of
    admissions the user can read but cannot edit. Tight blast radius:
    a custom permission class (not shared with the manage/edit
    pipeline) gates this on leader/recruiter membership in an admin group
    or participating committee.
    """

    def setUp(self):
        from admissions.admissions import constants as c

        self.webkom = Group.objects.create(name="Webkom", lego_id=800)
        self.admin_group_a = Group.objects.create(name="Hovedstyret", lego_id=801)
        self.admin_group_b = Group.objects.create(name="RevyStyret", lego_id=802)
        self.committee = Group.objects.create(name="Fagkom", lego_id=803)

        self.webkom_user = LegoUser.objects.create(username="webkom", lego_id=810)
        Membership.objects.create(
            user=self.webkom_user, group=self.webkom, role=c.MEMBER
        )
        self.admin_a_user = LegoUser.objects.create(username="admin-a", lego_id=811)
        Membership.objects.create(
            user=self.admin_a_user, group=self.admin_group_a, role=c.LEADER
        )
        self.admin_b_user = LegoUser.objects.create(username="admin-b", lego_id=812)
        Membership.objects.create(
            user=self.admin_b_user, group=self.admin_group_b, role=c.RECRUITING
        )
        self.plain_user = LegoUser.objects.create(username="plain", lego_id=813)
        self.committee_recruiter = LegoUser.objects.create(
            username="committee-recruiter", lego_id=814
        )
        Membership.objects.create(
            user=self.committee_recruiter, group=self.committee, role=c.RECRUITING
        )

        self.admission_a = Admission.objects.create(
            title="A-opptak",
            slug="a-opptak",
            open_from=timezone.now(),
            public_deadline=timezone.now() + timedelta(days=7),
            closed_from=timezone.now() + timedelta(days=8),
        )
        self.admission_a.admin_groups.add(self.admin_group_a)
        self.admission_a.groups.add(self.committee)

        self.admission_b = Admission.objects.create(
            title="B-opptak",
            slug="b-opptak",
            open_from=timezone.now(),
            public_deadline=timezone.now() + timedelta(days=7),
            closed_from=timezone.now() + timedelta(days=8),
        )
        self.admission_b.admin_groups.add(self.admin_group_b)
        self.admission_b.groups.add(self.committee)

        self.committee_admission = Admission.objects.create(
            title="Committee-opptak",
            slug="committee-opptak",
            open_from=timezone.now(),
            public_deadline=timezone.now() + timedelta(days=7),
            closed_from=timezone.now() + timedelta(days=8),
        )
        self.committee_admission.groups.add(self.committee)

        self.url = reverse("manage-admission-admin-list")

    def test_anonymous_gets_401(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_group_member_sees_only_their_admission(self):
        self.client.force_authenticate(user=self.admin_a_user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["slug"] for row in res.data],
            ["a-opptak"],
        )

    def test_admin_group_member_does_not_see_editable_fields(self):
        """The payload exposes only read fields — never admin_groups,
        groups, description, header_fields, group_content, or anything
        that could be edited. The frontend can only link to the
        per-admission admin panel.
        """
        self.client.force_authenticate(user=self.admin_a_user)
        res = self.client.get(self.url)
        row = res.data[0]
        for forbidden in (
            "admin_groups",
            "groups",
            "description",
            "header_fields",
            "group_content",
        ):
            self.assertNotIn(forbidden, row)
        # userdata is present and read-only.
        self.assertEqual(row["userdata"]["is_admin"], True)
        self.assertEqual(row["userdata"]["is_privileged"], True)
        self.assertEqual(row["userdata"]["can_manage"], False)

    def test_webkom_member_is_forbidden(self):
        """Webkom members use the manage page; this endpoint is gated to
        active admin-group members only — even Webkom gets 403 because
        the permission's gate is "is an active admin-group member", not
        "has any kind of manage access".
        """
        self.client.force_authenticate(user=self.webkom_user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_plain_user_is_forbidden(self):
        """A user with no admin-group membership cannot even reach this
        endpoint: the permission returns False, so DRF returns 403.
        """
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_recruiter_sees_admission_without_admin_group_membership(self):
        self.client.force_authenticate(user=self.committee_recruiter)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["slug"] for row in res.data],
            ["a-opptak", "b-opptak", "committee-opptak"],
        )

    def test_inactive_admin_group_membership_is_excluded(self):
        """A retired/retiree/alumni role in an admin group does not
        grant the read-only endpoint.
        """
        from admissions.admissions import constants as c

        Membership.objects.filter(user=self.admin_a_user).update(role=c.RETIREE)
        self.client.force_authenticate(user=self.admin_a_user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


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
