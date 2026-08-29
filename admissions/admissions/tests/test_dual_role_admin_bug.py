"""Regression tests for admin group members receiving ADMIN_FULL.

All active members of an admin group for an admission (regardless of role:
LEADER, CO_LEADER, RECRUITING, MEMBER) get ADMIN_FULL view mode, granting
access to all applications for that admission regardless of group.
"""

from django.test import TestCase

from admissions.admissions.admission_access import (
    APPLICATION_VIEW_MODE_ADMIN_FULL,
    APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
    get_application_view_mode,
)
from admissions.admissions.constants import CO_LEADER, LEADER, MEMBER, RECRUITING
from admissions.admissions.models import Admission, Group, LegoUser, Membership
from admissions.admissions.tests.utils import create_admission


class CompetingAdminGroupGuardTestCase(TestCase):
    """When a committee is in admin_groups, all active members of that committee
    have full access (ADMIN_FULL) to all applications for that admission.
    """

    def setUp(self):
        self.arrkom = Group.objects.create(name="Arrkom", lego_id=100)
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=101)
        self.admission = create_admission()
        self.admission.groups.add(self.arrkom, self.bedkom)
        # Arrkom is in admin_groups
        self.admission.admin_groups.add(self.arrkom)

    def _make_user(self, username, lego_id, group, role):
        user = LegoUser.objects.create(username=username, lego_id=lego_id)
        Membership.objects.create(user=user, group=group, role=role)
        return user

    def test_co_leader_of_admin_group_gets_admin_full(self):
        """A CO_LEADER of Arrkom (admin_groups) gets ADMIN_FULL."""
        co_leader = self._make_user("co-leader-arrkom", 200, self.arrkom, CO_LEADER)
        mode = get_application_view_mode(self.admission, co_leader)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_ADMIN_FULL)

    def test_plain_member_of_admin_group_gets_admin_full(self):
        """A plain MEMBER of Arrkom (admin_groups) gets ADMIN_FULL."""
        plain = self._make_user("plain-arrkom", 201, self.arrkom, MEMBER)
        mode = get_application_view_mode(self.admission, plain)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_ADMIN_FULL)

    def test_non_competing_admin_group_still_gets_admin_full(self):
        """A non-participating admin group member gets ADMIN_FULL."""
        hovedstyret = Group.objects.create(name="Hovedstyret", lego_id=110)
        self.admission.admin_groups.add(hovedstyret)
        leader = self._make_user("leader-hovedstyret", 300, hovedstyret, LEADER)
        mode = get_application_view_mode(self.admission, leader)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_ADMIN_FULL)

    def test_recruiter_of_admin_group_gets_admin_full(self):
        """A recruiter of Arrkom (admin_groups) gets ADMIN_FULL."""
        rec = self._make_user("rec-arrkom", 400, self.arrkom, RECRUITING)
        mode = get_application_view_mode(self.admission, rec)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_ADMIN_FULL)

    def test_non_admin_group_recruiter_is_narrowed(self):
        """A recruiter of Bedkom (NOT in admin_groups) is narrowed to COMMITTEE_MINIMAL."""
        rec = self._make_user("rec-bedkom", 500, self.bedkom, RECRUITING)
        mode = get_application_view_mode(self.admission, rec)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL)
