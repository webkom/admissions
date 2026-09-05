"""The withdrawal audit log: who withdrew, from which committee, and when.

Withdrawal itself is a hard delete (see signals.purge_withdrawn_candidate),
so these events are the only remaining record of an exit. The tests pin the
three properties that make the log trustworthy: every withdrawal path writes
it, the snapshot survives the delete, and reading it is scoped to recruiters
of the committee (admins see the whole admission, everyone else nothing).
"""

from django.test import TestCase
from rest_framework.test import APITestCase

from admissions.admissions.constants import RECRUITING
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
    WithdrawalAuditEvent,
)
from admissions.admissions.tests.utils import create_admission
from admissions.admissions.withdrawal_audit import record_withdrawal


class WithdrawalAuditWriteTestCase(APITestCase):
    """Every path that removes an application must leave an audit event."""

    def setUp(self):
        self.admin = LegoUser.objects.create(username="audit-admin", lego_id=1100)
        self.candidate = LegoUser.objects.create(
            username="audit-candidate",
            lego_id=1101,
            first_name="Kari",
            last_name="Kand",
        )
        self.admission = create_admission(created_by=self.admin, slug="audit-opptak")
        self.committee = Group.objects.create(name="Audit committee", lego_id=1105)
        self.admission.groups.add(self.committee)
        # A dedicated, non-competing admin group. Making the committee itself
        # an admin group would confine its members to that one committee
        # (get_application_view_mode), which is not what these tests exercise.
        self.admin_group = Group.objects.create(name="Opptaksadmin", lego_id=1104)
        self.admission.admin_groups.add(self.admin_group)
        # Being admission's created_by grants nothing on its own: the admin
        # standing comes from admin-group membership.
        Membership.objects.create(
            user=self.admin, group=self.admin_group, role=RECRUITING
        )

    def _application(self):
        application = UserApplication.objects.create(
            admission=self.admission, user=self.candidate, phone_number="12345678"
        )
        GroupApplication.objects.create(
            application=application, group=self.committee, text="Wants in"
        )
        return application

    def test_self_service_withdrawal_records_full_event(self):
        """DELETE /mine/ - the applicant pulls their own application."""
        self._application()
        self.client.force_authenticate(user=self.candidate)

        response = self.client.delete("/api/admission/audit-opptak/application/mine/")

        self.assertEqual(response.status_code, 204)
        event = WithdrawalAuditEvent.objects.get(admission=self.admission)
        self.assertEqual(event.candidate_username, "audit-candidate")
        self.assertEqual(event.candidate_full_name, "Kari Kand")
        self.assertEqual(event.group_name, "Audit committee")
        self.assertEqual(event.kind, WithdrawalAuditEvent.KIND_FULL)
        self.assertEqual(event.actor, self.candidate)
        self.assertTrue(event.withdrawn_by_candidate)
        self.assertEqual(str(event), "Kari Kand withdrew from Audit committee (full)")

    def test_admin_single_committee_delete_records_event(self):
        """The committee-scoped destroy endpoint, dropping the candidate's
        only committee, is a full withdrawal."""
        application = self._application()
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(
            f"/api/admin/admission/audit-opptak/application/{application.pk}/"
            f"?groupId={self.committee.pk}"
        )

        self.assertEqual(response.status_code, 204)
        event = WithdrawalAuditEvent.objects.get(admission=self.admission)
        self.assertEqual(event.kind, WithdrawalAuditEvent.KIND_FULL)
        self.assertEqual(event.actor, self.admin)
        self.assertFalse(event.withdrawn_by_candidate)
        self.assertEqual(
            str(event), "Kari Kand was removed from Audit committee (full)"
        )

    def test_admin_whole_application_delete_records_event(self):
        """The unscoped destroy endpoint - an admin removing the candidate from
        the admission outright - is the widest withdrawal there is, and every
        committee they had applied to must be recorded."""
        other = Group.objects.create(name="Second committee", lego_id=1109)
        self.admission.groups.add(other)
        application = self._application()
        GroupApplication.objects.create(
            application=application, group=other, text="Also wants in"
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(
            f"/api/admin/admission/audit-opptak/application/{application.pk}/"
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(UserApplication.objects.filter(pk=application.pk).exists())
        events = WithdrawalAuditEvent.objects.filter(admission=self.admission)
        self.assertEqual(events.count(), 2)
        self.assertEqual(
            sorted(events.values_list("group_name", flat=True)),
            ["Audit committee", "Second committee"],
        )
        for event in events:
            self.assertEqual(event.kind, WithdrawalAuditEvent.KIND_FULL)
            self.assertEqual(event.candidate_full_name, "Kari Kand")
            self.assertEqual(event.actor, self.admin)
            self.assertFalse(event.withdrawn_by_candidate)

    def test_terminating_a_committee_is_a_removal_not_a_withdrawal(self):
        """Wiping a committee's applicants must never be recorded as those
        people having withdrawn - they did nothing."""
        self._application()
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            f"/api/admin/admission/audit-opptak/group/{self.committee.pk}/terminate/",
            {"confirmation_name": "Audit committee"},
            format="json",
        )

        self.assertEqual(response.status_code, 204, response.content)
        event = WithdrawalAuditEvent.objects.get(admission=self.admission)
        self.assertFalse(event.withdrawn_by_candidate)
        self.assertEqual(event.actor, self.admin)

    def test_partial_committee_delete_records_partial_event(self):
        """Dropping one of two committees keeps the application alive, and
        the event must say so."""
        other = Group.objects.create(name="Other committee", lego_id=1106)
        self.admission.groups.add(other)
        application = self._application()
        GroupApplication.objects.create(
            application=application, group=other, text="Also wants in"
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(
            f"/api/admin/admission/audit-opptak/application/{application.pk}/"
            f"?groupId={self.committee.pk}"
        )

        self.assertEqual(response.status_code, 204)
        event = WithdrawalAuditEvent.objects.get(admission=self.admission)
        self.assertEqual(event.kind, WithdrawalAuditEvent.KIND_PARTIAL)
        # The candidate still exists - only the one committee was dropped.
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())

    def test_resubmit_dropping_a_committee_records_partial_event(self):
        """Unticking a committee on a resubmit withdraws it silently through
        the serializer - the path with no DELETE request at all."""
        other = Group.objects.create(name="Resubmit committee", lego_id=1107)
        self.admission.groups.add(other)
        application = self._application()
        GroupApplication.objects.create(
            application=application, group=other, text="Also wants in"
        )
        self.client.force_authenticate(user=self.candidate)

        response = self.client.post(
            "/api/admission/audit-opptak/application/",
            {
                "phone_number": "12345678",
                "applications": {"Resubmit committee": "Staying here"},
                "group_answers": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        event = WithdrawalAuditEvent.objects.get(admission=self.admission)
        self.assertEqual(event.kind, WithdrawalAuditEvent.KIND_PARTIAL)
        self.assertEqual(event.group_name, "Audit committee")
        self.assertEqual(event.actor, self.candidate)
        self.assertTrue(event.withdrawn_by_candidate)

    def test_no_event_when_resubmit_drops_nothing(self):
        other = Group.objects.create(name="Keep committee", lego_id=1108)
        self.admission.groups.add(other)
        application = self._application()
        GroupApplication.objects.create(
            application=application, group=other, text="Also wants in"
        )
        self.client.force_authenticate(user=self.candidate)

        response = self.client.post(
            "/api/admission/audit-opptak/application/",
            {
                "phone_number": "12345678",
                "applications": {
                    "Audit committee": "Staying",
                    "Keep committee": "Also staying",
                },
                "group_answers": {},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertFalse(WithdrawalAuditEvent.objects.exists())


class WithdrawalAuditReadTestCase(APITestCase):
    """Recruiters of a committee read its withdrawals; admins read the whole
    admission; everyone else is shut out."""

    def setUp(self):
        self.admin = LegoUser.objects.create(username="read-admin", lego_id=1200)
        self.admission = create_admission(created_by=self.admin, slug="read-opptak")
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=1205)
        self.webkom = Group.objects.create(name="Webkom", lego_id=1206)
        self.admission.groups.add(self.bedkom, self.webkom)
        # A dedicated admin group: making one of the competing committees an
        # admin group would make its recruiters admission-wide readers (and
        # rightly so - but that is not what these tests are about).
        self.admin_group = Group.objects.create(name="Opptaksadmin", lego_id=1204)
        self.admission.admin_groups.add(self.admin_group)
        Membership.objects.create(
            user=self.admin, group=self.admin_group, role=RECRUITING
        )
        candidate = LegoUser.objects.create(username="gone-candidate", lego_id=1207)
        application = UserApplication.objects.create(
            admission=self.admission, user=candidate, phone_number="12345678"
        )
        GroupApplication.objects.create(application=application, group=self.bedkom)
        # Seed the log directly: the reads under test should not depend on
        # which write path produced the event.
        record_withdrawal(
            admission=self.admission,
            group=self.bedkom,
            candidate=application,
            candidate_id=application.pk,
            kind=WithdrawalAuditEvent.KIND_FULL,
            actor=candidate,
        )
        application.delete()

        self.bedkom_recruiter = LegoUser.objects.create(
            username="bedkom-rec", lego_id=1210
        )
        Membership.objects.create(
            user=self.bedkom_recruiter, group=self.bedkom, role=RECRUITING
        )
        self.url = "/api/admin/admission/read-opptak/withdrawals/"
        self.group_url = (
            f"/api/admin/admission/read-opptak/group/{self.bedkom.pk}/withdrawals/"
        )

    def test_admin_sees_events_across_committees(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["group_name"], "Bedkom")
        self.assertEqual(response.data[0]["candidate_username"], "gone-candidate")

    def test_payload_does_not_reveal_withdrawal_scope(self):
        """`kind` (full vs this-committee-only) is internal: a recruiter must
        not learn whether the person still applies elsewhere."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("kind", response.data[0])

    def test_payload_carries_no_identifiers_beyond_the_name(self):
        """The list exists to name who left - not to hand back a join key."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("candidate_id", response.data[0])
        self.assertNotIn("actor", response.data[0])

    def test_recruiter_sees_own_committee_only(self):
        self.client.force_authenticate(user=self.bedkom_recruiter)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

        # Webkom recruiter must not see the Bedkom event.
        webkom_recruiter = LegoUser.objects.create(username="webkom-rec", lego_id=1211)
        Membership.objects.create(
            user=webkom_recruiter, group=self.webkom, role=RECRUITING
        )
        self.client.force_authenticate(user=webkom_recruiter)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_recruiter_group_scoped_url_rejects_foreign_committee(self):
        webkom_recruiter = LegoUser.objects.create(username="webkom-rec2", lego_id=1212)
        Membership.objects.create(
            user=webkom_recruiter, group=self.webkom, role=RECRUITING
        )
        self.client.force_authenticate(user=webkom_recruiter)

        response = self.client.get(self.group_url)

        self.assertEqual(response.status_code, 403)

    def test_plain_member_is_rejected(self):
        member = LegoUser.objects.create(username="plain-member", lego_id=1213)
        Membership.objects.create(user=member, group=self.bedkom)
        self.client.force_authenticate(user=member)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)

    def test_anonymous_is_rejected(self):
        response = self.client.get(self.url)
        self.assertIn(response.status_code, (401, 403))

    def test_other_admission_is_isolated(self):
        other_admin = LegoUser.objects.create(username="other-admin", lego_id=1214)
        other = create_admission(
            created_by=other_admin,
            slug="other-opptak",
            title="Annet opptak",
        )
        other.groups.add(self.bedkom)
        self.client.force_authenticate(user=self.bedkom_recruiter)

        response = self.client.get("/api/admin/admission/other-opptak/withdrawals/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])


class WithdrawalAuditCompetingAdminGroupTestCase(APITestCase):
    """An admin group that also competes is confined to its own committees.

    This is the same rule applications follow: a group that recruits for
    itself is a rival to every other committee, and admin standing must not
    become a window onto a rival's applicants - withdrawn ones included.
    """

    def setUp(self):
        self.creator = LegoUser.objects.create(username="comp-creator", lego_id=1300)
        self.admission = create_admission(created_by=self.creator, slug="comp-opptak")
        self.webkom = Group.objects.create(name="Webkom", lego_id=1305)
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=1306)
        self.admission.groups.add(self.webkom, self.bedkom)
        # Webkom both competes for applicants and is an admin group here.
        self.admission.admin_groups.add(self.webkom)

        self.webkom_recruiter = LegoUser.objects.create(
            username="webkom-rec", lego_id=1310
        )
        Membership.objects.create(
            user=self.webkom_recruiter, group=self.webkom, role=RECRUITING
        )

        for offset, (group, username) in enumerate(
            ((self.webkom, "left-webkom"), (self.bedkom, "left-bedkom"))
        ):
            candidate = LegoUser.objects.create(
                username=username, lego_id=1400 + offset
            )
            application = UserApplication.objects.create(
                admission=self.admission, user=candidate, phone_number="12345678"
            )
            GroupApplication.objects.create(application=application, group=group)
            record_withdrawal(
                admission=self.admission,
                group=group,
                candidate=application,
                candidate_id=application.pk,
                kind=WithdrawalAuditEvent.KIND_FULL,
                actor=candidate,
            )
            application.delete()

        self.url = "/api/admin/admission/comp-opptak/withdrawals/"

    def test_competing_admin_group_sees_only_its_own_committee(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["group_name"], "Webkom")

    def test_competing_admin_group_cannot_scope_to_a_rival(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        response = self.client.get(
            f"/api/admin/admission/comp-opptak/group/{self.bedkom.pk}/withdrawals/"
        )

        self.assertEqual(response.status_code, 403)

    def test_non_competing_admin_group_still_sees_everything(self):
        """The confinement keys on competing, not on being an admin group."""
        central = Group.objects.create(name="Hovedstyret", lego_id=1320)
        self.admission.admin_groups.add(central)
        officer = LegoUser.objects.create(username="hs-officer", lego_id=1321)
        Membership.objects.create(user=officer, group=central, role=RECRUITING)
        self.client.force_authenticate(user=officer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_group_scoped_url_narrows_for_a_full_admin(self):
        """The URL names one committee, so the answer must be that committee -
        a full admin previously got the whole admission back regardless."""
        central = Group.objects.create(name="Hovedstyret2", lego_id=1330)
        self.admission.admin_groups.add(central)
        officer = LegoUser.objects.create(username="hs-officer2", lego_id=1331)
        Membership.objects.create(user=officer, group=central, role=RECRUITING)
        self.client.force_authenticate(user=officer)

        response = self.client.get(
            f"/api/admin/admission/comp-opptak/group/{self.bedkom.pk}/withdrawals/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["group_name"], "Bedkom")

    def test_org_leadership_in_competing_admin_group_still_sees_everything(self):
        """Org leadership oversees the whole admission, so it is exempt from the
        competing admin group confinement."""
        from admissions.admissions.models import GodUser

        GodUser.objects.create(lego_id=self.webkom_recruiter.lego_id)
        self.client.force_authenticate(user=self.webkom_recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
