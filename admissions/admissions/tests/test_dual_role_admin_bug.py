"""Regression tests for the dual-role admin-group guard.

A user who is in a committee that ALSO sits in admin_groups must be
narrowed to COMMITTEE_MINIMAL when they operate that committee, exactly
like a recruiter of a non-admin-group committee. Today the guard only
fires for (LEADER, RECRUITING) role and skips CO_LEADER/MEMBER — both of
which can still be admission-wide admins and end up seeing every other
committee's application text.
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
    """The guard that confines a competing admin group to its own
    committee's applicants must fire for every role that "represents" a
    committee, not just LEADER/RECRUITING. CO_LEADER is a co-leader — they
    can also be a recruiter/operator of the committee's schedule, and the
    same isolation rule applies.
    """

    def setUp(self):
        self.arrkom = Group.objects.create(name="Arrkom", lego_id=100)
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=101)
        self.admission = create_admission()
        self.admission.groups.add(self.arrkom, self.bedkom)
        # Arrkom runs the tool: it sits in admin_groups AND competes.
        self.admission.admin_groups.add(self.arrkom)

    def _make_user(self, username, lego_id, group, role):
        user = LegoUser.objects.create(username=username, lego_id=lego_id)
        Membership.objects.create(user=user, group=group, role=role)
        return user

    def test_co_leader_of_competing_admin_group_is_narrowed(self):
        """A CO_LEADER of Arrkom (which is also admin_groups) should be
        narrowed to COMMITTEE_MINIMAL so they only see Arrkom's
        applicants, not Bedkom's."""
        co_leader = self._make_user("co-leader-arrkom", 200, self.arrkom, CO_LEADER)
        mode = get_application_view_mode(self.admission, co_leader)
        self.assertEqual(
            mode,
            APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
            "CO_LEADER of a competing admin group must be confined to their "
            "own committee, otherwise they read every committee's private "
            "application text.",
        )

    def test_plain_member_of_competing_admin_group_does_not_see_everything(self):
        """A plain MEMBER of Arrkom (which is also admin_groups) should
        NOT be granted ADMIN_FULL view of every committee. The dual-role
        guard should fire because they are an active member of a competing
        group.

        The 5-role model says all active members of an admin group are
        equal. The compromise that prevents leaks: a competing admin
        group is narrowed to its own committee's view, regardless of the
        individual member's role in that group.
        """
        plain = self._make_user("plain-arrkom", 201, self.arrkom, MEMBER)
        mode = get_application_view_mode(self.admission, plain)
        self.assertEqual(
            mode,
            APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL,
            "Plain MEMBER of a competing admin group must NOT see other "
            "committees' applications.",
        )
        self.assertNotEqual(
            mode,
            APPLICATION_VIEW_MODE_ADMIN_FULL,
            "Plain MEMBER of a competing admin group must NOT see other "
            "committees' applications.",
        )

    def test_non_competing_admin_group_still_gets_admin_full(self):
        """Hovedstyret / Abakus-Leder pattern: a non-competing admin group
        member still gets ADMIN_FULL — no committee, no narrowing."""
        hovedstyret = Group.objects.create(name="Hovedstyret", lego_id=110)
        self.admission.admin_groups.add(hovedstyret)
        leader = self._make_user("leader-hovedstyret", 300, hovedstyret, LEADER)
        mode = get_application_view_mode(self.admission, leader)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_ADMIN_FULL)

    def test_recruiter_of_competing_admin_group_still_narrowed(self):
        """Regression: the existing LEADER/RECRUITING guard keeps working."""
        rec = self._make_user("rec-arrkom", 400, self.arrkom, RECRUITING)
        mode = get_application_view_mode(self.admission, rec)
        self.assertEqual(mode, APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL)
