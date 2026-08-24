from django.test import TestCase, override_settings
from django.urls import reverse

from admissions.admissions.models import Group, LegoUser, Membership
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

    def test_conflicting_roles_for_one_group_fail_closed(self):
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

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)
