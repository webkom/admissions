"""Tests for the GodUser allowlist (org leadership) and the Webkom-only
``/api/manage/god-user/`` endpoint.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions import constants
from admissions.admissions.admission_access import user_is_org_leadership
from admissions.admissions.models import GodUser, Group, LegoUser, Membership


class GodUserEndpointTestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(name="Webkom", lego_id=900)
        self.committee = Group.objects.create(name="Arrkom", lego_id=901)
        self.webkom_member = LegoUser.objects.create(username="webkom", lego_id=910)
        Membership.objects.create(
            user=self.webkom_member, group=self.webkom, role=constants.MEMBER
        )
        self.plain_user = LegoUser.objects.create(username="plain", lego_id=911)
        Membership.objects.create(
            user=self.plain_user, group=self.committee, role=constants.MEMBER
        )
        # Real users we can promote to god-list status.
        self.existing_user = LegoUser.objects.create(username="existing", lego_id=4242)
        self.url = reverse("manage-god-user-list")

    def test_anonymous_cannot_list_god_users(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_webkom_member_cannot_list_god_users(self):
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_webkom_member_can_list_god_users(self):
        self.client.force_authenticate(user=self.webkom_member)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # The migration seeded the constants.GOD_LEGO_IDS list.
        self.assertEqual(
            {row["lego_id"] for row in res.data},
            set(constants.GOD_LEGO_IDS),
        )

    def test_webkom_member_can_add_god_user(self):
        self.client.force_authenticate(user=self.webkom_member)
        res = self.client.post(
            self.url,
            {"lego_id": self.existing_user.lego_id, "note": "test add"},
            format="json",
        )
        if res.status_code != status.HTTP_201_CREATED:
            self.fail(f"unexpected response: {res.status_code} {res.data!r}")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["lego_id"], self.existing_user.lego_id)
        self.assertEqual(res.data["note"], "test add")
        self.assertEqual(res.data["added_by"], self.webkom_member.pk)
        # The serializer resolves the user's display name from LegoUser.
        self.assertEqual(res.data["display_name"], self.existing_user.username)
        self.assertTrue(GodUser.objects.filter(lego_id=4242).exists())

    def test_adding_an_unknown_lego_id_returns_400(self):
        """A mistyped-but-nonexistent id is rejected up front: silently
        granting god power to an unused id would be a serious mistake.
        """
        self.client.force_authenticate(user=self.webkom_member)
        res = self.client.post(self.url, {"lego_id": 9_999_999}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lego_id", res.data)
        self.assertFalse(GodUser.objects.filter(lego_id=9_999_999).exists())

    def test_duplicate_lego_id_returns_400(self):
        self.client.force_authenticate(user=self.webkom_member)
        self.client.post(
            self.url, {"lego_id": self.existing_user.lego_id}, format="json"
        )
        res = self.client.post(
            self.url, {"lego_id": self.existing_user.lego_id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lego_id", res.data)

    def test_non_webkom_member_cannot_add_god_user(self):
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.post(
            self.url,
            {"lego_id": self.existing_user.lego_id},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            GodUser.objects.filter(lego_id=self.existing_user.lego_id).exists()
        )

    def test_webkom_member_can_remove_god_user(self):
        GodUser.objects.create(lego_id=self.existing_user.lego_id)
        self.client.force_authenticate(user=self.webkom_member)
        res = self.client.delete(
            reverse(
                "manage-god-user-detail",
                args=[self.existing_user.lego_id],
            )
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            GodUser.objects.filter(lego_id=self.existing_user.lego_id).exists()
        )

    def test_non_webkom_member_cannot_remove_god_user(self):
        GodUser.objects.create(lego_id=self.existing_user.lego_id)
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.delete(
            reverse(
                "manage-god-user-detail",
                args=[self.existing_user.lego_id],
            )
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            GodUser.objects.filter(lego_id=self.existing_user.lego_id).exists()
        )

    def test_negative_lego_id_is_rejected(self):
        self.client.force_authenticate(user=self.webkom_member)
        res = self.client.post(self.url, {"lego_id": -1}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("lego_id", res.data)


class GodUserOrgLeadershipTestCase(APITestCase):
    """The runtime ``user_is_org_leadership`` check now reads the
    ``GodUser`` table only - no constants fallback.
    """

    def setUp(self):
        # Clear the migration-seeded rows so each test starts from a known
        # state. The seeded id (8810) is otherwise resurrected on every
        # test in this class.
        GodUser.objects.all().delete()
        self.god = LegoUser.objects.create(username="god", lego_id=8810)
        self.plain = LegoUser.objects.create(username="plain", lego_id=5001)

    def test_added_god_user_is_org_leadership(self):
        GodUser.objects.create(lego_id=self.god.lego_id)
        self.assertTrue(user_is_org_leadership(self.god))

    def test_removed_god_user_loses_org_leadership(self):
        """Removing the row removes the privilege: no constant fallback
        silently restores it.
        """
        GodUser.objects.create(lego_id=self.god.lego_id)
        self.assertTrue(user_is_org_leadership(self.god))
        GodUser.objects.all().delete()
        self.assertFalse(user_is_org_leadership(self.god))

    def test_plain_user_is_never_org_leadership(self):
        GodUser.objects.create(lego_id=self.god.lego_id)
        self.assertFalse(user_is_org_leadership(self.plain))
