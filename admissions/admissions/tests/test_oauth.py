from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from admissions.admissions.models import Group, LegoUser, Membership
from admissions.admissions.tests.utils import create_admission
from admissions.oauth import (
    VALID_MEMBERSHIP_ROLES,
    update_custom_user_details,
    use_existing_lego_user,
)


class OAuthMembershipSyncTestCase(TestCase):
    def setUp(self):
        self.user = LegoUser.objects.create(
            username="oauth-user",
            lego_id=92000,
            is_staff=True,
            profile_picture="https://example.com/old.png",
            gender="male",
        )
        self.group = Group.objects.create(
            name="backup",
            lego_id=92001,
        )

    def sync(self, response):
        update_custom_user_details(None, {}, user=self.user, response=response)
        self.user.refresh_from_db()

    def test_existing_user_is_reused_by_lego_id(self):
        result = use_existing_lego_user(
            {"lego_id": self.user.lego_id},
            {"id": self.user.lego_id},
            uid=str(self.user.lego_id),
        )

        self.assertEqual(result["user"], self.user)

    @override_settings(
        SOCIAL_AUTH_LEGO_API_URL="http://127.0.0.1:8000",
        ALLOWED_HOSTS=["127.0.0.1"],
        SESSION_COOKIE_NAME="admissions_sessionid",
    )
    def test_login_stores_lego_state_in_the_admissions_session(self):
        response = self.client.get(
            reverse("social:begin", args=["lego"]),
            HTTP_HOST="127.0.0.1:5002",
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("lego_state", self.client.session)
        self.assertIn("admissions_sessionid", response.cookies)
        self.assertIn("redirect_uri=http%3A%2F%2F127.0.0.1%3A5002", response.url)

    def test_empty_response_revokes_stale_memberships_and_staff_access(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        self.sync({})

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, "")
        self.assertEqual(self.user.gender, "")

    def test_valid_memberships_replace_stale_state(self):
        response = {
            "memberships": [
                {"abakusGroup": str(self.group.lego_id), "role": "leader"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
            "profilePicture": "https://example.com/new.png",
            "gender": "female",
        }

        self.sync(response)

        membership = Membership.objects.get(user=self.user)
        self.assertEqual(membership.group, self.group)
        self.assertEqual(membership.role, "leader")
        self.assertTrue(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, response["profilePicture"])
        self.assertEqual(self.user.gender, "female")

    def test_unknown_role_cannot_create_an_authorizing_membership(self):
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "administrator"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_unmodelled_role_elsewhere_keeps_the_real_memberships(self):
        """One role LEGO has and this app does not must not de-authorise a user.

        An opptaksansvarlig who also held, say, photo_admin in another group
        was logged in with every membership deleted: the payload parse vetoed
        the whole response, the caller substituted an empty list, and the sync
        wiped the rows it was meant to refresh. They then belonged to no
        committee at all, so the landing page hid both admin actions.
        """
        committee = Group.objects.create(name="Webkom", lego_id=92010)
        other = Group.objects.create(name="Fotokom", lego_id=92011)
        response = {
            "memberships": [
                {"abakusGroup": committee.lego_id, "role": "recruiting"},
                {"abakusGroup": other.lego_id, "role": "photo_admin"},
            ],
            "abakusGroups": [
                {"id": committee.lego_id, "name": committee.name},
                {"id": other.lego_id, "name": other.name},
            ],
        }

        self.sync(response)

        self.assertEqual(
            sorted(
                Membership.objects.filter(user=self.user).values_list(
                    "group__name", "role"
                )
            ),
            [("Fotokom", "photo_admin"), ("Webkom", "recruiting")],
        )

    def test_every_lego_role_is_modelled(self):
        """Drift here silently strips memberships, so it is asserted directly."""
        for role in (
            "merch_admin",
            "hs_representative",
            "cuddling_manager",
            "photo_admin",
            "graphic_admin",
            "social_media_admin",
            "booking_admin",
            "purchasing_manager",
            "event_manager",
            "snackoverflow_manager",
        ):
            with self.subTest(role=role):
                self.assertIn(role, VALID_MEMBERSHIP_ROLES)

    def test_missing_group_details_cannot_preserve_stale_access(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "leader"},
            ],
            "abakusGroups": [],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_duplicate_upstream_memberships_are_collapsed(self):
        membership = {"abakusGroup": self.group.lego_id, "role": "member"}
        response = {
            "memberships": [membership, membership.copy()],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        self.sync(response)

        # Same group AND same role twice is a true duplicate, and both this
        # app and LEGO make that pair unique - so it collapses to one row.
        self.assertEqual(Membership.objects.filter(user=self.user).count(), 1)

    def test_malformed_response_revokes_access_without_raising(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        self.sync(
            {
                "memberships": None,
                "abakusGroups": None,
                "profilePicture": {"url": "invalid"},
                "gender": ["invalid"],
            }
        )

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, "")
        self.assertEqual(self.user.gender, "")

    def test_partially_malformed_response_grants_no_membership_access(self):
        other_group = Group.objects.create(name="other", lego_id=92002)
        Membership.objects.create(
            user=self.user,
            group=other_group,
            role="leader",
        )
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "leader"},
                {"abakusGroup": other_group.lego_id},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
                {"id": other_group.lego_id, "name": other_group.name},
            ],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def _hovedstyret_response(self, role):
        # Deliberately NOT a local Group: Hovedstyret has no reason to exist
        # in the local table, and staff must not depend on it doing so.
        return {
            "memberships": [{"abakusGroup": 92100, "role": role}],
            "abakusGroups": [{"id": 92100, "name": "Hovedstyret"}],
        }

    def test_hovedstyret_leader_gets_staff_without_a_local_group_row(self):
        self.user.is_staff = False
        self.user.save(update_fields=["is_staff"])

        self.sync(self._hovedstyret_response("leader"))

        self.assertTrue(self.user.is_staff)
        self.assertFalse(Membership.objects.filter(user=self.user).exists())

    def test_hovedstyret_non_leader_roles_do_not_get_staff(self):
        for role in ("member", "co-leader"):
            with self.subTest(role=role):
                self.sync(self._hovedstyret_response(role))

                self.assertFalse(self.user.is_staff)

    def test_two_roles_in_one_group_are_both_kept(self):
        """LEGO makes memberships unique per (user, group, ROLE), so holding
        two roles in one committee is ordinary upstream, not a corrupt payload.
        Treating it as ambiguous dropped the group entirely and left a
        recruiter who was also a plain member with no membership at all."""

        other_group = Group.objects.create(name="other", lego_id=92003)
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "member"},
                {"abakusGroup": self.group.lego_id, "role": "leader"},
                {"abakusGroup": other_group.lego_id, "role": "member"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
                {"id": other_group.lego_id, "name": other_group.name},
            ],
        }

        self.sync(response)

        self.assertEqual(
            {("backup", "member"), ("backup", "leader"), ("other", "member")},
            {
                (m.group.name, m.role)
                for m in Membership.objects.filter(user=self.user).select_related(
                    "group"
                )
            },
        )

    def test_a_group_repeated_in_the_payload_does_not_revoke_everything(self):
        """abakusGroups is the M2M behind those memberships, so it repeats the
        group once per membership row. Vetoing the payload over the repeat
        deleted every membership the user had - a Bedkom recruiter who was
        also a Bedkom member arrived with no access to anything."""

        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "member"},
                {"abakusGroup": self.group.lego_id, "role": "recruiting"},
            ],
            # The same group, twice, exactly as LEGO sends it.
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        self.sync(response)

        self.assertEqual(
            {"member", "recruiting"},
            set(
                Membership.objects.filter(user=self.user, group=self.group).values_list(
                    "role", flat=True
                )
            ),
        )


class CommitteeRecruiterAccessTestCase(APITestCase):
    """The landing page's two admin actions, end to end from the LEGO payload.

    "Velg intervjutider" is gated on committee membership and "Admin panel" on
    is_privileged, and both are derived from Membership rows this app only ever
    learns about at login. A recruiter who holds an unmodelled role in some
    unrelated group used to arrive here with no rows at all, so both buttons
    vanished for a reason nothing in the admission code could explain.
    """

    def setUp(self):
        self.admission = create_admission()
        self.committee = Group.objects.create(name="Webkom", lego_id=94001)
        self.admission.groups.add(self.committee)
        # An Abakus group that is nothing to do with this admission.
        self.unrelated = Group.objects.create(name="Fotokom", lego_id=94002)
        self.user = LegoUser.objects.create(username="viljen", lego_id=94000)

    def sync_and_read_userdata(self, memberships):
        update_custom_user_details(
            None,
            {},
            user=self.user,
            response={
                "memberships": memberships,
                "abakusGroups": [
                    {"id": self.committee.lego_id, "name": self.committee.name},
                    {"id": self.unrelated.lego_id, "name": self.unrelated.name},
                ],
            },
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(response.status_code, 200)
        return response.data["userdata"]

    def test_committee_recruiter_can_see_both_admin_actions(self):
        userdata = self.sync_and_read_userdata(
            [{"abakusGroup": self.committee.lego_id, "role": "recruiting"}]
        )

        # "Velg intervjutider"
        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        # "Admin panel"
        self.assertTrue(userdata["is_privileged"])
        self.assertEqual(userdata["committee_role"], "recruiting")
        self.assertEqual(userdata["represented_groups"], ["Webkom"])

    def test_a_role_lego_already_had_is_recorded_not_merely_survived(self):
        """Guards the role list itself.

        The parse fix alone would let this membership be skipped and access
        would still look right, so asserting on the userdata flags here would
        prove nothing. The role list is what decides whether the row exists,
        so that is what is asserted.
        """
        userdata = self.sync_and_read_userdata(
            [
                {"abakusGroup": self.committee.lego_id, "role": "recruiting"},
                {"abakusGroup": self.unrelated.lego_id, "role": "photo_admin"},
            ]
        )

        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        self.assertTrue(userdata["is_privileged"])
        self.assertEqual(
            sorted(
                Membership.objects.filter(user=self.user).values_list(
                    "group__name", "role"
                )
            ),
            [("Fotokom", "photo_admin"), ("Webkom", "recruiting")],
        )

    def test_recruiter_who_is_also_a_member_of_the_same_committee(self):
        """The exact shape LEGO sends for somebody holding two roles in one
        committee: two membership rows, and abakusGroups - the M2M behind them
        - repeating that group once per row.

        This used to arrive as no memberships at all. The repeated group
        vetoed the whole payload, and even past that the two roles were called
        ambiguous and the group dropped, so a Bedkom recruiter got neither the
        admin panel nor the scheduler for their own committee.
        """

        update_custom_user_details(
            None,
            {},
            user=self.user,
            response={
                "memberships": [
                    {"abakusGroup": self.committee.lego_id, "role": "member"},
                    {"abakusGroup": self.committee.lego_id, "role": "recruiting"},
                ],
                "abakusGroups": [
                    {"id": self.committee.lego_id, "name": self.committee.name},
                    {"id": self.committee.lego_id, "name": self.committee.name},
                ],
            },
        )
        self.client.force_authenticate(user=self.user)
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        userdata = response.data["userdata"]

        # "Velg intervjutider"
        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        # "Admin panel"
        self.assertTrue(userdata["is_privileged"])
        self.assertTrue(userdata["is_recruiter"])
        self.assertEqual(userdata["represented_groups"], ["Webkom"])
        # The recruiting role wins the summary, both rows are kept.
        self.assertEqual(userdata["committee_role"], "recruiting")
        self.assertEqual(
            {"member", "recruiting"},
            set(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
        )

    def test_recruiter_keeps_both_actions_when_lego_adds_an_unknown_role(self):
        """Guards the parse: a role we do not model yet must not de-authorise.

        Deliberately a role that is in no list anywhere, standing in for
        whatever LEGO adds next. Listing the ten known roles fixes today; this
        is what stops the same outage happening again on the eleventh.
        """
        userdata = self.sync_and_read_userdata(
            [
                {"abakusGroup": self.committee.lego_id, "role": "recruiting"},
                {
                    "abakusGroup": self.unrelated.lego_id,
                    "role": "a_role_from_the_future",
                },
            ]
        )

        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        self.assertTrue(userdata["is_privileged"])
        self.assertEqual(userdata["committee_role"], "recruiting")

    def test_committee_leader_is_equivalent_to_a_recruiter_here(self):
        userdata = self.sync_and_read_userdata(
            [{"abakusGroup": self.committee.lego_id, "role": "leader"}]
        )

        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        self.assertTrue(userdata["is_privileged"])

    def test_plain_committee_member_gets_the_schedule_but_not_the_admin_panel(self):
        userdata = self.sync_and_read_userdata(
            [{"abakusGroup": self.committee.lego_id, "role": "member"}]
        )

        self.assertEqual(userdata["committee_groups"], ["Webkom"])
        self.assertFalse(userdata["is_privileged"])


class MultiRoleMembershipSideEffectsTestCase(TestCase):
    """Holding two roles in one committee is now stored as two rows, so
    anything that iterates memberships has to stay per-person."""

    def setUp(self):
        self.group = Group.objects.create(name="Bedkom", lego_id=95001)
        self.user = LegoUser.objects.create(
            username="leader-and-recruiter", lego_id=95000, email="both@example.com"
        )
        Membership.objects.create(user=self.user, group=self.group, role="leader")
        Membership.objects.create(user=self.user, group=self.group, role="recruiting")

    def test_a_leader_who_is_also_recruiter_is_notified_once(self):
        """Two rows, one person, one mail. Counting rows would tell them about
        the same withdrawal twice."""

        from django.db.models import Q

        from admissions.admissions import constants

        recipients = list(
            Membership.objects.filter(
                Q(role=constants.RECRUITING) | Q(role=constants.LEADER),
                group=self.group.pk,
            )
            .values_list("user__email", flat=True)
            .distinct()
        )

        self.assertEqual(["both@example.com"], recipients)

    def test_the_privileged_role_still_decides_access(self):
        admission = create_admission(slug="multirole-opptak")
        admission.groups.add(self.group)

        from admissions.admissions.admission_access import (
            get_representing_groups,
            user_is_group_member,
        )

        self.assertEqual(
            ["Bedkom"], [g.name for g in get_representing_groups(admission, self.user)]
        )
        self.assertTrue(user_is_group_member(self.group, self.user))

    def test_an_extra_plain_membership_grants_nothing_on_its_own(self):
        """The widening must not turn a member into a recruiter anywhere."""

        admission = create_admission(slug="plain-opptak")
        other = Group.objects.create(name="Arrkom", lego_id=95002)
        admission.groups.add(other)
        plain = LegoUser.objects.create(username="plain", lego_id=95003)
        Membership.objects.create(user=plain, group=other, role="member")
        Membership.objects.create(user=plain, group=other, role="treasurer")

        from admissions.admissions.admission_access import (
            get_representing_groups,
            user_is_admission_admin,
        )

        self.assertEqual([], list(get_representing_groups(admission, plain)))
        self.assertFalse(user_is_admission_admin(admission, plain))
