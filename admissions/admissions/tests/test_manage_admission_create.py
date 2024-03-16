from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER
from admissions.admissions.models import Group, LegoUser, Membership
from admissions.admissions.tests.utils import create_admission, fake_timedelta


class CreateAdmissionAuthorizationTestCase(APITestCase):
    """
    Verify that the proper permissions are enforced on admission creation
    """

    def setUp(self):
        self.admission = create_admission()
        self.edit_admission_data = {
            "title": "Plebkom opptak 2020",
            "open_from": fake_timedelta(days=10),
        }

    def test_pleb_cannot_edit_admission(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_cannot_edit_admission(self):
        webkom_leader = LegoUser.objects.create(username="webkomleader")
        bedkom = Group.objects.create(name="Bedkom")
        Membership.objects.create(user=webkom_leader, role=LEADER, group=bedkom)

        self.client.force_authenticate(user=webkom_leader)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_member_cannot_edit_admission(self):
        bedkom_member = LegoUser.objects.create(username="bedkommember")
        bedkom = Group.objects.create(name="Bedkom")
        Membership.objects.create(user=bedkom_member, role=MEMBER, group=bedkom)

        self.client.force_authenticate(user=bedkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_edit_admission(self):
        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_webkom_can_edit_admission(self):
        webkom_member = LegoUser.objects.create(username="webkommember")
        webkom = Group.objects.create(name="Webkom")
        Membership.objects.create(user=webkom_member, role=MEMBER, group=webkom)

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_cannot_edit_admission_if_not_creator(self):
        staff_user = LegoUser.objects.create(username="bigsupremeleader", is_staff=True)

        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_user_can_edit_admission_if_creator(self):
        staff_user = LegoUser.objects.create(username="bigsupremeleader", is_staff=True)

        admission = create_admission(
            created_by=staff_user, title="Webkomopptak", slug="webkom"
        )

        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("manage-admission-detail", kwargs={"slug": admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(
            res.status_code, status.HTTP_200_OK, "Admission did not get updated"
        )


class CreateAdmissionTestCase(APITestCase):
    """
    Verify that the admissions are created correctly
    """

    pass
