"""Verify the recruiter/leader sees ONLY their own committee's applicants
regardless of whether the committee is an admin group.

The 5-role model: recruiters/leaders of a committee that accepts
applicants see that committee's full applicants (with the committee-level
text/header_fields_response). The admin group standing is irrelevant to
the recruiter/leader of a non-admin-group committee.

Conversely, if the committee IS an admin group, the recruiter/leader is
narrowed to their own committee's view to prevent reading the rival
committees' answers.
"""

from django.test import TestCase

from admissions.admissions.admission_access import (
    APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
    get_application_view_mode,
)
from admissions.admissions.constants import LEADER, RECRUITING
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.tests.utils import create_admission


class RecruiterSeesOwnCommitteeTestCase(TestCase):
    """Regression: a Bedkom recruiter must only see Bedkom applicants,
    no matter whether Bedkom is in admin_groups or not."""

    def setUp(self):
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=10)
        self.webkom = Group.objects.create(name="Webkom", lego_id=11)
        self.admission = create_admission()
        self.admission.groups.add(self.bedkom, self.webkom)

    def _make_recruiter(self, group, role, lego_id):
        user = LegoUser.objects.create(username=f"rec-{group.name}", lego_id=lego_id)
        Membership.objects.create(user=user, group=group, role=role)
        return user

    def test_bedkom_recruiter_with_no_admin_role_is_narrowed(self):
        """Bedkom recruiter, Bedkom NOT in admin_groups. The recruiter
        must see only Bedkom applicants — not Webkom's."""
        rec = self._make_recruiter(self.bedkom, RECRUITING, 100)
        mode = get_application_view_mode(self.admission, rec)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL)

    def test_bedkom_leader_with_no_admin_role_is_narrowed(self):
        """Bedkom leader, Bedkom NOT in admin_groups. The leader must
        see only Bedkom applicants — not Webkom's."""
        leader = self._make_recruiter(self.bedkom, LEADER, 101)
        mode = get_application_view_mode(self.admission, leader)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL)

    def test_bedkom_recruiter_with_bedkom_in_admin_groups_still_narrowed(self):
        """Bedkom recruiter, Bedkom IS in admin_groups. The recruiter
        must still see only Bedkom applicants, not Webkom's."""
        self.admission.admin_groups.add(self.bedkom)
        rec = self._make_recruiter(self.bedkom, RECRUITING, 102)
        mode = get_application_view_mode(self.admission, rec)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL)

    def test_queryset_filters_to_recruiter_own_committee(self):
        """End-to-end: the API response must only contain applicants
        who applied to Bedkom."""
        from django.test import Client
        from rest_framework.test import APIClient

        self.admission.admin_groups.add(self.bedkom)
        rec = self._make_recruiter(self.bedkom, RECRUITING, 103)
        candidate = LegoUser.objects.create(username="candidate", lego_id=200)
        candidate_user_app = UserApplication.objects.create(
            admission=self.admission,
            user=candidate,
            phone_number="00000000",
            text="global private note",
        )
        GroupApplication.objects.create(
            application=candidate_user_app,
            group=self.bedkom,
            text="bedkom application text",
            header_fields_response={"k": "bedkom answer"},
        )
        GroupApplication.objects.create(
            application=candidate_user_app,
            group=self.webkom,
            text="webkom application text",
            header_fields_response={"k": "webkom answer"},
        )

        client = APIClient()
        client.force_authenticate(user=rec)
        from django.urls import reverse

        res = client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        # Only the recruiter's own group_application is in the response.
        self.assertEqual(len(res.data[0]["group_applications"]), 1)
        self.assertEqual(
            res.data[0]["group_applications"][0]["group"]["name"], "Bedkom"
        )
        # And the committee-level answer is preserved.
        self.assertEqual(
            res.data[0]["group_applications"][0]["text"],
            "bedkom application text",
        )
        # But the rival committee's answer is NOT exposed.
        text_blob = str(res.data)
        self.assertNotIn("webkom application text", text_blob)
        self.assertNotIn("webkom answer", text_blob)
        # And the global priority text is also not exposed.
        self.assertNotIn("global private note", text_blob)
