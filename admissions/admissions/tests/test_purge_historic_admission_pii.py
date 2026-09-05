from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from admissions.admissions.models import (
    Admission,
    FadderbarnDeclaration,
    Group,
    GroupApplication,
    LegoUser,
    SavedSchedule,
    UserApplication,
    WithdrawalAuditEvent,
)


class PurgeHistoricAdmissionPIITestCase(TestCase):
    def setUp(self):
        now = timezone.now()
        self.old_admission = Admission.objects.create(
            title="Old Concluded Admission",
            slug="old-admission",
            open_from=now - timedelta(days=250),
            public_deadline=now - timedelta(days=220),
            closed_from=now - timedelta(days=200),
        )
        self.active_admission = Admission.objects.create(
            title="Current Active Admission",
            slug="active-admission",
            open_from=now - timedelta(days=5),
            public_deadline=now + timedelta(days=5),
            closed_from=now + timedelta(days=10),
        )

        self.webkom = Group.objects.create(name="Webkom", lego_id=101)
        self.old_admission.groups.add(self.webkom)
        self.active_admission.groups.add(self.webkom)

        self.applicant = LegoUser.objects.create(username="applicant", lego_id=9001)
        self.interviewer = LegoUser.objects.create(username="interviewer", lego_id=9002)

        # Old application with sensitive PII
        self.old_user_app = UserApplication.objects.create(
            admission=self.old_admission,
            user=self.applicant,
            phone_number="12345678",
            text="Very sensitive priority text",
        )
        self.old_group_app = GroupApplication.objects.create(
            application=self.old_user_app,
            group=self.webkom,
            text="Sensitive group application motivation",
            header_fields_response={"dietary": "Strict allergy", "experience": "high"},
        )
        self.old_fadderbarn = FadderbarnDeclaration.objects.create(
            admission=self.old_admission,
            interviewer=self.interviewer,
            lego_user_id=self.applicant.lego_id,
        )
        self.old_schedule = SavedSchedule.objects.create(
            admission=self.old_admission,
            group=self.webkom,
            start_date="2026-04-20",
            schedule=[
                {
                    "candidate_id": str(self.old_user_app.pk),
                    "candidate": "Applicant Name",
                    "candidate_phone": "12345678",
                    "time": 540,
                }
            ],
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )

        # A withdrawal from the old admission: the applicant's rows are long
        # gone, so this snapshot is the only place their name survives.
        self.old_withdrawal = WithdrawalAuditEvent.objects.create(
            admission=self.old_admission,
            group=self.webkom,
            group_name="Webkom",
            candidate_username="withdrawn-applicant",
            candidate_full_name="Withdrawn Applicant",
            candidate_id="00000000-0000-0000-0000-000000000001",
            kind=WithdrawalAuditEvent.KIND_FULL,
        )
        self.active_withdrawal = WithdrawalAuditEvent.objects.create(
            admission=self.active_admission,
            group=self.webkom,
            group_name="Webkom",
            candidate_username="active-withdrawn",
            candidate_full_name="Active Withdrawn",
            candidate_id="00000000-0000-0000-0000-000000000002",
            kind=WithdrawalAuditEvent.KIND_FULL,
        )

        # Active application with PII that must NOT be touched
        self.active_user_app = UserApplication.objects.create(
            admission=self.active_admission,
            user=self.applicant,
            phone_number="87654321",
            text="Active priority text",
        )
        self.active_group_app = GroupApplication.objects.create(
            application=self.active_user_app,
            group=self.webkom,
            text="Active motivation",
            header_fields_response={"t-shirt": "L"},
        )

    def test_purge_refuses_active_admission(self):
        out = StringIO()
        with self.assertRaises(CommandError) as cm:
            call_command(
                "purge_historic_admission_pii",
                admission="active-admission",
                stdout=out,
            )
        self.assertIn("is not yet closed", str(cm.exception))

    def test_dry_run_does_not_mutate_data(self):
        out = StringIO()
        call_command(
            "purge_historic_admission_pii",
            admission="old-admission",
            dry_run=True,
            stdout=out,
        )
        self.assertIn("[DRY RUN]", out.getvalue())

        self.old_user_app.refresh_from_db()
        self.assertEqual(self.old_user_app.phone_number, "12345678")
        self.assertEqual(self.old_user_app.text, "Very sensitive priority text")
        self.assertTrue(
            FadderbarnDeclaration.objects.filter(pk=self.old_fadderbarn.pk).exists()
        )
        self.old_withdrawal.refresh_from_db()
        self.assertEqual(self.old_withdrawal.candidate_full_name, "Withdrawn Applicant")

    def test_purge_scrubs_old_admission_pii(self):
        out = StringIO()
        call_command(
            "purge_historic_admission_pii",
            admission="old-admission",
            stdout=out,
        )
        self.assertIn("Successfully purged", out.getvalue())

        # Old application is scrubbed
        self.old_user_app.refresh_from_db()
        self.assertEqual(self.old_user_app.phone_number, "")
        self.assertEqual(self.old_user_app.text, "")

        self.old_group_app.refresh_from_db()
        self.assertEqual(self.old_group_app.text, "")
        self.assertEqual(self.old_group_app.header_fields_response, {})

        # Old fadderbarn declaration is deleted
        self.assertFalse(
            FadderbarnDeclaration.objects.filter(pk=self.old_fadderbarn.pk).exists()
        )

        # Old schedule candidate names are scrubbed
        self.old_schedule.refresh_from_db()
        self.assertEqual(
            self.old_schedule.name_visibility, SavedSchedule.NAME_VISIBILITY_HIDDEN
        )
        schedule_item = self.old_schedule.schedule[0]
        self.assertEqual(schedule_item["candidate"], "Kandidat 1")
        self.assertNotIn("candidate_phone", schedule_item)

        # Active admission data is untouched
        self.active_user_app.refresh_from_db()
        self.assertEqual(self.active_user_app.phone_number, "87654321")
        self.assertEqual(self.active_user_app.text, "Active priority text")
        self.active_group_app.refresh_from_db()
        self.assertEqual(self.active_group_app.text, "Active motivation")

    def test_purge_deletes_withdrawal_events(self):
        """The event exists only to name who left, so it goes with the rest of
        the personal data rather than lingering as a nameless shell."""
        out = StringIO()
        call_command(
            "purge_historic_admission_pii",
            admission="old-admission",
            stdout=out,
        )

        self.assertFalse(
            WithdrawalAuditEvent.objects.filter(pk=self.old_withdrawal.pk).exists()
        )
        # An admission still running keeps its withdrawal log intact.
        self.active_withdrawal.refresh_from_db()
        self.assertEqual(self.active_withdrawal.candidate_full_name, "Active Withdrawn")
