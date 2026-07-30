from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import (
    AdmissionGroup,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    NameVisibilityAuditEvent,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission
from admissions.admissions.views import PublicApplicationViewSet


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

    def test_legacy_client_payload_maps_global_answers_to_selected_groups(self):
        legacy_fields = [
            {
                "id": "motivation",
                "type": "textarea",
                "title": "Motivasjon",
                "label": "Motivasjon",
                "placeholder": "",
                "required": True,
            }
        ]
        self.admission.header_fields = legacy_fields
        self.admission.save(update_fields=["header_fields"])
        AdmissionGroup.objects.filter(admission=self.admission).update(
            header_fields=legacy_fields
        )
        self.client.force_authenticate(user=self.pleb_anna)

        detail_response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission_slug})
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data["header_fields"], legacy_fields)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "text": "Ønsker Webkom mest",
                "phone_number": "12345678",
                "header_fields_response": {
                    "motivation": "Jeg vil bidra i begge komiteene."
                },
                "applications": {
                    "webkom": "Webkom-svar",
                    "koskom": "Koskom-svar",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        application = UserApplication.objects.get(user=self.pleb_anna)
        self.assertEqual(application.text, "Ønsker Webkom mest")
        self.assertEqual(
            application.header_fields_response,
            {"motivation": "Jeg vil bidra i begge komiteene."},
        )
        self.assertEqual(
            list(
                application.group_applications.order_by("group__name").values_list(
                    "header_fields_response", flat=True
                )
            ),
            [
                {"motivation": "Jeg vil bidra i begge komiteene."},
                {"motivation": "Jeg vil bidra i begge komiteene."},
            ],
        )

        updated_response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "text": "Oppdatert prioritering",
                "phone_number": "87654321",
                "header_fields_response": {"motivation": "Oppdatert svar."},
                "applications": {
                    "webkom": "Oppdatert Webkom-svar",
                    "koskom": "Oppdatert Koskom-svar",
                },
            },
            format="json",
        )

        self.assertEqual(
            updated_response.status_code,
            status.HTTP_201_CREATED,
            updated_response.data,
        )
        application.refresh_from_db()
        self.assertEqual(application.phone_number, "87654321")
        self.assertEqual(application.text, "Oppdatert prioritering")
        self.assertEqual(
            list(
                application.group_applications.order_by("group__name").values_list(
                    "header_fields_response", flat=True
                )
            ),
            [
                {"motivation": "Oppdatert svar."},
                {"motivation": "Oppdatert svar."},
            ],
        )

    def test_equal_legacy_and_scoped_payload_fields_are_accepted(self):
        self.client.force_authenticate(user=self.pleb_anna)
        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                **self.application_data,
                "text": "Samme prioritering",
                "priority_text": "Samme prioritering",
                "header_fields_response": {},
                "group_answers": {"webkom": {}, "koskom": {}},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_conflicting_legacy_and_scoped_payload_is_rejected_atomically(self):
        application = UserApplication.objects.create(
            user=self.pleb_anna,
            admission=self.admission,
            phone_number="12345678",
            text="Behold prioriteringen",
            header_fields_response={"motivation": "Behold legacy-svaret"},
        )
        group_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Behold komitésvaret",
            header_fields_response={"motivation": "Behold gruppesvaret"},
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "phone_number": "87654321",
                "applications": {"webkom": "Skal ikke lagres"},
                "text": "Legacy-prioritering",
                "priority_text": "Ny prioritering",
                "header_fields_response": {"motivation": "Legacy-svar"},
                "group_answers": {"webkom": {"motivation": "Ulikt gruppesvar"}},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("text", response.data)
        self.assertIn("header_fields_response", response.data)
        application.refresh_from_db()
        group_application.refresh_from_db()
        self.assertEqual(application.phone_number, "12345678")
        self.assertEqual(application.text, "Behold prioriteringen")
        self.assertEqual(
            application.header_fields_response,
            {"motivation": "Behold legacy-svaret"},
        )
        self.assertEqual(group_application.text, "Behold komitésvaret")
        self.assertEqual(
            group_application.header_fields_response,
            {"motivation": "Behold gruppesvaret"},
        )

    def test_legacy_answers_are_rejected_after_committee_schemas_diverge(self):
        self.admission.header_fields = []
        self.admission.save(update_fields=["header_fields"])
        webkom_admission = AdmissionGroup.objects.get(
            admission=self.admission,
            group=self.webkom,
        )
        webkom_admission.header_fields = [
            {
                "id": "webkom-only",
                "type": "textinput",
                "title": "Webkom-spørsmål",
                "label": "Webkom-spørsmål",
                "placeholder": "",
                "required": False,
            }
        ]
        webkom_admission.save(update_fields=["header_fields"])
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                **self.application_data,
                "text": "Legacy-prioritering",
                "header_fields_response": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("header_fields_response", response.data)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())

    def test_legacy_answers_are_rejected_after_saved_answers_diverge(self):
        application = UserApplication.objects.create(
            user=self.pleb_anna,
            admission=self.admission,
            phone_number="12345678",
            text="Behold prioriteringen",
        )
        webkom_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Behold Webkom-svaret",
            header_fields_response={"motivation": "Webkom-svar"},
        )
        koskom_application = GroupApplication.objects.create(
            application=application,
            group=self.koskom,
            text="Behold Koskom-svaret",
            header_fields_response={"motivation": "Koskom-svar"},
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                **self.application_data,
                "text": "Skal ikke lagres",
                "header_fields_response": {"motivation": "Globalt svar"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("header_fields_response", response.data)
        application.refresh_from_db()
        webkom_application.refresh_from_db()
        koskom_application.refresh_from_db()
        self.assertEqual(application.text, "Behold prioriteringen")
        self.assertEqual(webkom_application.text, "Behold Webkom-svaret")
        self.assertEqual(koskom_application.text, "Behold Koskom-svaret")
        self.assertEqual(
            webkom_application.header_fields_response,
            {"motivation": "Webkom-svar"},
        )
        self.assertEqual(
            koskom_application.header_fields_response,
            {"motivation": "Koskom-svar"},
        )

    def test_new_candidate_invalidates_a_published_plan_atomically(self):
        existing_candidate = UserApplication.objects.create(
            admission=self.admission,
            user=self.pleb_bob,
        )
        GroupApplication.objects.create(
            application=existing_candidate,
            group=self.webkom,
        )
        revision = "11111111-1111-1111-1111-111111111111"
        schedule = [
            {
                "candidate_id": str(existing_candidate.pk),
                "candidate": self.pleb_bob.username,
                "time": 540,
                "panel": [],
            }
        ]
        saved = SavedSchedule.objects.create(
            admission=self.admission,
            schedule=schedule,
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            conflict_review_open=True,
            conflict_collection_open=True,
            conflict_collection_revision=revision,
            conflict_collection_candidate_ids=[str(existing_candidate.pk)],
            conflict_collection_participant_ids=[],
        )
        saved.revealed_groups.add(self.webkom)
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.pleb_bob,
            reviewed_candidate_ids=[str(existing_candidate.pk)],
            conflict_collection_reviewed_candidate_ids=[str(existing_candidate.pk)],
            conflict_collection_review_revision=revision,
        )
        job = SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.pleb_bob,
            request_data={"private": "input"},
        )
        previous_revision = saved.updated_at
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        saved.refresh_from_db()
        availability.refresh_from_db()
        job.refresh_from_db()
        self.assertEqual(saved.schedule, schedule)
        self.assertFalse(saved.is_distributed)
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )
        self.assertFalse(saved.conflict_review_open)
        self.assertFalse(saved.conflict_collection_open)
        self.assertIsNone(saved.conflict_collection_revision)
        self.assertEqual(saved.conflict_collection_candidate_ids, [])
        self.assertEqual(saved.conflict_collection_participant_ids, [])
        self.assertFalse(saved.revealed_groups.exists())
        self.assertGreater(saved.updated_at, previous_revision)
        self.assertEqual(availability.reviewed_candidate_ids, [])
        self.assertEqual(
            availability.conflict_collection_reviewed_candidate_ids,
            [],
        )
        self.assertIsNone(availability.conflict_collection_review_revision)
        self.assertEqual(job.status, SolveJob.STATUS_CANCELLED)
        self.assertEqual(job.request_data, {})
        audit_event = NameVisibilityAuditEvent.objects.get(
            admission=self.admission,
            group=self.webkom,
        )
        self.assertEqual(
            audit_event.action,
            NameVisibilityAuditEvent.ACTION_HIDDEN,
        )
        self.assertIsNone(audit_event.actor)
        self.assertEqual(audit_event.actor_username, "system")

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

    def test_omitted_group_answers_preserve_existing_committee_answers(self):
        admission_group = AdmissionGroup.objects.get(
            admission=self.admission,
            group=self.webkom,
        )
        admission_group.header_fields = [
            {
                "id": "motivation",
                "type": "textarea",
                "title": "Motivasjon",
                "label": "Motivasjon",
                "placeholder": "",
                "required": False,
            }
        ]
        admission_group.save(update_fields=["header_fields"])
        application = UserApplication.objects.create(
            user=self.pleb_anna,
            admission=self.admission,
            phone_number="12345678",
        )
        group_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Original application",
            header_fields_response={"motivation": "Behold dette svaret."},
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "phone_number": "87654321",
                "applications": {"webkom": "Oppdatert søknad"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        group_application.refresh_from_db()
        self.assertEqual(
            group_application.header_fields_response,
            {"motivation": "Behold dette svaret."},
        )
        self.assertEqual(group_application.text, "Oppdatert søknad")

    def test_partial_group_answers_preserve_the_omitted_committee_answer(self):
        question_fields = [
            {
                "id": "motivation",
                "type": "textarea",
                "title": "Motivasjon",
                "label": "Motivasjon",
                "placeholder": "",
                "required": False,
            }
        ]
        AdmissionGroup.objects.filter(admission=self.admission).update(
            header_fields=question_fields
        )
        application = UserApplication.objects.create(
            user=self.pleb_anna,
            admission=self.admission,
            phone_number="12345678",
        )
        webkom_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Original Webkom application",
            header_fields_response={"motivation": "Originalt Webkom-svar"},
        )
        koskom_application = GroupApplication.objects.create(
            application=application,
            group=self.koskom,
            text="Original Koskom application",
            header_fields_response={"motivation": "Behold Koskom-svaret"},
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "phone_number": "87654321",
                "applications": {
                    "webkom": "Oppdatert Webkom-søknad",
                    "koskom": "Oppdatert Koskom-søknad",
                },
                "group_answers": {"webkom": {"motivation": "Oppdatert Webkom-svar"}},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        webkom_application.refresh_from_db()
        koskom_application.refresh_from_db()
        self.assertEqual(
            webkom_application.header_fields_response,
            {"motivation": "Oppdatert Webkom-svar"},
        )
        self.assertEqual(
            koskom_application.header_fields_response,
            {"motivation": "Behold Koskom-svaret"},
        )

    def test_schema_change_after_validation_rejects_stale_answers(self):
        required_fields = [
            {
                "id": "motivation",
                "type": "textarea",
                "title": "Motivasjon",
                "label": "Motivasjon",
                "placeholder": "",
                "required": True,
            }
        ]
        original_perform_create = PublicApplicationViewSet.perform_create

        def change_schema_before_save(view, serializer):
            AdmissionGroup.objects.filter(
                admission=self.admission,
                group=self.webkom,
            ).update(header_fields=required_fields)
            return original_perform_create(view, serializer)

        self.client.force_authenticate(user=self.pleb_anna)
        with patch.object(
            PublicApplicationViewSet,
            "perform_create",
            change_schema_before_save,
        ):
            response = self.client.post(
                reverse(
                    "userapplication-list",
                    kwargs={"admission_slug": self.admission_slug},
                ),
                {
                    "phone_number": "12345678",
                    "applications": {"webkom": "Webkom-søknad"},
                    "group_answers": {"webkom": {}},
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("group_answers", response.data)
        self.assertFalse(UserApplication.objects.filter(user=self.pleb_anna).exists())
        self.assertFalse(
            GroupApplication.objects.filter(application__user=self.pleb_anna).exists()
        )

    def test_explicit_empty_group_answers_clear_existing_committee_answers(self):
        application = UserApplication.objects.create(
            user=self.pleb_anna,
            admission=self.admission,
            phone_number="12345678",
        )
        group_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Original application",
            header_fields_response={"motivation": "Fjern dette svaret."},
        )
        self.client.force_authenticate(user=self.pleb_anna)

        response = self.client.post(
            reverse(
                "userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            ),
            {
                "phone_number": "87654321",
                "applications": {"webkom": "Oppdatert søknad"},
                "group_answers": {"webkom": {}},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        group_application.refresh_from_db()
        self.assertEqual(group_application.header_fields_response, {})

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
