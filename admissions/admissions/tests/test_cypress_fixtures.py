import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase, override_settings

from admissions.admissions.models import (
    Admission,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.utils.management.commands.load_fixtures import Command


class CypressFixturePreparationTestCase(TestCase):
    def call_cypress_fixtures(self, project_dir):
        with override_settings(BASE_PROJECT_DIR=project_dir):
            call_command("load_fixtures", cypress=True, verbosity=0)
        return Path(project_dir) / Command.cypress_credentials_filename

    @override_settings(ALLOW_CYPRESS_FIXTURES=False)
    def test_cypress_mode_refuses_before_database_or_file_writes(self):
        with TemporaryDirectory() as project_dir, mock.patch.object(
            Command,
            "clear_seeded_admission_relationships",
        ) as clear_relationships:
            with self.assertRaisesMessage(
                CommandError,
                "Cypress fixture preparation is disabled",
            ):
                self.call_cypress_fixtures(project_dir)

            clear_relationships.assert_not_called()
            self.assertFalse(
                (Path(project_dir) / Command.cypress_credentials_filename).exists()
            )
            self.assertFalse(Admission.objects.exists())

    @override_settings(ALLOW_CYPRESS_FIXTURES=True)
    def test_cypress_mode_seeds_a_real_csrf_protected_admin_session_flow(self):
        with TemporaryDirectory() as project_dir:
            credentials_path = self.call_cypress_fixtures(project_dir)
            credentials = json.loads(credentials_path.read_text(encoding="utf-8"))

            admin = LegoUser.objects.get(
                pk=Command.cypress_admin_id,
                username=Command.cypress_admin_username,
            )
            admission = Admission.objects.get(
                pk=Command.cypress_admission_id,
                slug=Command.cypress_admission_slug,
            )
            saved_schedule = SavedSchedule.objects.get(admission=admission)
            availability = InterviewAvailability.objects.get(
                admission=admission,
                user=admin,
            )

            self.assertTrue(admin.check_password(credentials["password"]))
            self.assertTrue(admin.is_active)
            self.assertEqual(credentials["username"], admin.username)
            self.assertFalse(
                LegoUser.objects.exclude(pk=admin.pk)
                .filter(password__regex=r"^(?![!*])")
                .exists()
            )
            self.assertEqual(len(saved_schedule.schedule), 3)
            self.assertTrue(saved_schedule.is_distributed)
            self.assertEqual(
                saved_schedule.name_visibility,
                SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            )
            self.assertEqual(
                set(availability.reviewed_candidate_ids),
                set(Command.cypress_candidate_ids),
            )
            self.assertEqual(Session.objects.count(), 0)

            client = Client(enforce_csrf_checks=True)
            login_page = client.get("/api-auth/login/")
            csrf_token = re.search(
                rb'name="csrfmiddlewaretoken" value="([^"]+)"',
                login_page.content,
            )
            self.assertIsNotNone(csrf_token)
            login = client.post(
                "/api-auth/login/",
                {
                    "csrfmiddlewaretoken": csrf_token.group(1).decode(),
                    "username": credentials["username"],
                    "password": credentials["password"],
                    "next": "/",
                },
            )

            self.assertEqual(login.status_code, 302)
            self.assertIn(settings.SESSION_COOKIE_NAME, client.cookies)
            schedule_response = client.get(
                f"/api/admin/admission/{Command.cypress_admission_slug}/schedule/"
            )
            self.assertEqual(schedule_response.status_code, 200)
            self.assertEqual(len(schedule_response.json()["schedule"]), 3)

    @override_settings(ALLOW_CYPRESS_FIXTURES=True)
    def test_cypress_mode_is_idempotent_and_rotates_the_temporary_password(self):
        with TemporaryDirectory() as project_dir:
            first_path = self.call_cypress_fixtures(project_dir)
            first_password = json.loads(first_path.read_text(encoding="utf-8"))[
                "password"
            ]
            admin = LegoUser.objects.get(pk=Command.cypress_admin_id)
            admission = Admission.objects.get(pk=Command.cypress_admission_id)
            stale_user = LegoUser.objects.create(
                username="stale-cypress-member",
                lego_id=987654,
            )
            Membership.objects.create(
                user=stale_user,
                group=admission.groups.get(),
                role="member",
            )
            stale_session = Client().session
            stale_session["fixture"] = "stale"
            stale_session.save()
            UserApplication.objects.create(
                admission=admission,
                user=admin,
                text="Interrupted Cypress application",
                phone_number="12345678",
            )
            second_path = self.call_cypress_fixtures(project_dir)
            second_password = json.loads(second_path.read_text(encoding="utf-8"))[
                "password"
            ]

            admin.refresh_from_db()
            self.assertNotEqual(first_password, second_password)
            self.assertFalse(admin.check_password(first_password))
            self.assertTrue(admin.check_password(second_password))
            self.assertFalse(
                UserApplication.objects.filter(
                    admission=admission,
                    user=admin,
                ).exists()
            )
            self.assertFalse(Membership.objects.filter(user=stale_user).exists())
            self.assertEqual(Session.objects.count(), 0)
            self.assertEqual(
                SavedSchedule.objects.filter(admission=admission).count(),
                1,
            )
            self.assertEqual(
                InterviewAvailability.objects.filter(
                    admission=admission,
                    user=admin,
                ).count(),
                1,
            )

    @override_settings(ALLOW_CYPRESS_FIXTURES=True)
    def test_cypress_mode_rolls_back_and_removes_credentials_on_seed_failure(self):
        with TemporaryDirectory() as project_dir, mock.patch.object(
            Command,
            "prepare_cypress_state",
            side_effect=RuntimeError("seed failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "seed failed"):
                self.call_cypress_fixtures(project_dir)

            self.assertFalse(Admission.objects.exists())
            self.assertFalse(
                (Path(project_dir) / Command.cypress_credentials_filename).exists()
            )

    @override_settings(ALLOW_CYPRESS_FIXTURES=True)
    def test_cypress_mode_refuses_when_the_fixture_user_is_not_an_admin(self):
        with TemporaryDirectory() as project_dir, mock.patch(
            "admissions.utils.management.commands.load_fixtures."
            "user_is_admission_admin",
            return_value=False,
        ):
            with self.assertRaisesMessage(
                CommandError,
                "not an administrator",
            ):
                self.call_cypress_fixtures(project_dir)

            self.assertFalse(Admission.objects.exists())
            self.assertFalse(
                (Path(project_dir) / Command.cypress_credentials_filename).exists()
            )
