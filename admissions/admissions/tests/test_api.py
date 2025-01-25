from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING
from admissions.admissions.models import Group, LegoUser, Membership
from admissions.admissions.tests.utils import create_admission, fake_timedelta


class EditGroupTestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(
            name="Webkom",
            lego_id=3,
            description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!",
        )
        self.arrkom = Group.objects.create(
            name="Arrkom",
            lego_id=4,
            description="Arrkom arrangerer ting",
            response_label="Søk Arrkom fordi vi har det kult!",
        )

        self.pleb = LegoUser.objects.create(lego_id=3)
        self.webkom_leader = LegoUser.objects.create(
            username="webkom_leader", lego_id=4
        )
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        self.webkom_recruiter = LegoUser.objects.create(
            username="webkom_recruiter", lego_id=5
        )
        Membership.objects.create(
            user=self.webkom_recruiter, role=RECRUITING, group=self.webkom
        )

        self.edit_group_data = {
            "response_text": "Halla, Webkom er ikke noe gucci",
            "description": "Webkoms maskott er en rød ku(le)",
        }

    def test_pleb_cannot_edit_group(self):
        self.client.force_authenticate(user=self.pleb)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_group_leader_cannot_edit_other_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_group_recruiter_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_cannot_edit_group(self):
        staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=6, is_staff=True
        )
        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("admin-group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # What about when not logged in aka. have a user? Rewrite api (remove LoginRequiredMixins
    # from views to stop from redirecting, and handle redirecting ourselves with permissions.
    # In this way, when using the api and not viewing in frontend, you are not redirected (disabled).
    # Disable redirecting when using api not in frontend. Or something along those lines).

    # Only testing with PATCH now, might want to test with other methods as well


class EditAdmissionTestCase(APITestCase):
    def setUp(self):
        self.staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=1, is_staff=True
        )
        self.admission = create_admission(created_by=self.staff_user)
        self.edit_admission_data = {
            "title": "Plebkom opptak 2020",
            "open_from": fake_timedelta(days=10),
            "header_fields": [],
            "admin_groups": [],
            "groups": [],
        }

    def test_pleb_cannot_edit_admission(self):
        pleb = LegoUser.objects.create(lego_id=7)
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_cannot_edit_admission(self):
        bedkom_leader = LegoUser.objects.create(username="bedkomleader", lego_id=8)
        bedkom = Group.objects.create(name="Bedkom", lego_id=7)
        Membership.objects.create(user=bedkom_leader, role=LEADER, group=bedkom)

        self.client.force_authenticate(user=bedkom_leader)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_member_cannot_edit_admission(self):
        bedkom_member = LegoUser.objects.create(username="bedkommember", lego_id=9)
        bedkom = Group.objects.create(name="Bedkom", lego_id=6)
        Membership.objects.create(user=bedkom_member, role=MEMBER, group=bedkom)

        self.client.force_authenticate(user=bedkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_edit_admission(self):
        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_webkom_can_edit_admission(self):
        webkom_member = LegoUser.objects.create(
            username="webber", lego_id=10, is_staff=True
        )
        webkom = Group.objects.create(name="Webkom", lego_id=13)
        Membership.objects.create(user=webkom_member, role=MEMBER, group=webkom)

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_creator_can_edit_admission(self):

        self.client.force_authenticate(user=self.staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_nocreator_cannot_edit_admission(self):
        staff_user = LegoUser.objects.create(
            username="staffie", lego_id=11, is_staff=True
        )

        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
