from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APITestCase

from admissions.admissions import constants
from admissions.admissions.models import Group, LegoUser, Membership
from admissions.oauth import LegoOAuth2


class GroupCategoryTestCase(TestCase):
    def test_every_importable_group_is_categorised(self):
        """A group that can be imported but is filed nowhere silently lands
        under "Annet". The categories may be wider than the import list - a
        group filed ahead of becoming importable costs nothing - but never
        narrower."""

        self.assertEqual(
            set(LegoOAuth2.LEGO_GROUP_NAMES),
            set(constants.LEGO_GROUP_NAMES),
        )
        filed = {
            name
            for _category, names in constants.ADMISSION_GROUP_CATEGORIES
            for name in names
        }
        self.assertEqual(set(), set(constants.LEGO_GROUP_NAMES) - filed)

    def test_no_group_is_claimed_by_two_categories(self):
        seen = set()
        for _category, names in constants.ADMISSION_GROUP_CATEGORIES:
            for name in names:
                self.assertNotIn(name, seen, f"{name} appears twice")
                seen.add(name)

    def test_the_committee_and_revue_split(self):
        self.assertEqual(
            constants.GROUP_CATEGORY_COMMITTEE, constants.group_category("Webkom")
        )
        self.assertEqual(
            constants.GROUP_CATEGORY_COMMITTEE, constants.group_category("readme")
        )
        self.assertEqual(
            constants.GROUP_CATEGORY_REVUE, constants.group_category("Teknikk")
        )
        self.assertEqual(
            constants.GROUP_CATEGORY_REVUE, constants.group_category("PR-revy")
        )

    def test_backup_and_abakus_leder_sit_outside_both(self):
        """LEGO registers backup as a komite, but an opptak organiser reading a
        list of komite-opptak does not expect to find it there."""

        self.assertEqual(
            constants.GROUP_CATEGORY_OTHER, constants.group_category("backup")
        )
        self.assertEqual(
            constants.GROUP_CATEGORY_OTHER, constants.group_category("Abakus-leder")
        )
        self.assertEqual(
            constants.GROUP_CATEGORY_OTHER, constants.group_category("Hovedstyret")
        )

    def test_revue_groups_lego_has_but_admissions_cannot_import_are_still_filed(
        self,
    ):
        """Kor and Regi are `revy` in LEGO but missing from the import list, so
        they cannot have an opptak today. Filing them anyway means the day that
        is fixed they do not turn up under the wrong heading."""

        for name in ("Kor", "Regi"):
            self.assertEqual(
                constants.GROUP_CATEGORY_REVUE, constants.group_category(name)
            )

    def test_an_unknown_group_falls_back_rather_than_failing(self):
        self.assertEqual(
            constants.GROUP_CATEGORY_OTHER, constants.group_category("Nykom")
        )


class ManageGroupCategoryAPITestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(name="Webkom", lego_id=15)
        self.teknikk = Group.objects.create(name="Teknikk", lego_id=30)
        self.backup = Group.objects.create(name="backup", lego_id=40)
        self.user = LegoUser.objects.create(
            username="manager", lego_id=6001, is_staff=True
        )
        Membership.objects.create(
            user=self.user, group=self.webkom, role=constants.LEADER
        )
        self.client.force_authenticate(user=self.user)

    def test_the_group_list_carries_the_category(self):
        res = self.client.get(reverse("manage-group-list"))

        self.assertEqual(200, res.status_code, res.data)
        categories = {group["name"]: group["category"] for group in res.data}
        self.assertEqual(
            {
                "Webkom": constants.GROUP_CATEGORY_COMMITTEE,
                "Teknikk": constants.GROUP_CATEGORY_REVUE,
                "backup": constants.GROUP_CATEGORY_OTHER,
            },
            categories,
        )
