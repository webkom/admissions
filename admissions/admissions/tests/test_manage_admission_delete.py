from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import MEMBER
from admissions.admissions.models import (
    Admission,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.tests.utils import create_admission, fake_timedelta


class DeleteAdmissionAuthorizationTestCase(APITestCase):
    """
    Test that only the designated users can delete an admission
    """

    def setUp(self) -> None:
        yesterday = fake_timedelta(-1)
        self.admission = create_admission(closed_from=yesterday)

    def test_webkom_can_delete_admission(self):
        webkom_user = LegoUser.objects.create(username="webkom_member", lego_id=2)
        webkom = Group.objects.create(
            name="Webkom",
            lego_id=13,
            description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!",
        )
        Membership.objects.create(user=webkom_user, role=MEMBER, group=webkom)
        self.client.force_authenticate(user=webkom_user)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )
        self.assertTrue(
            webkom_user.is_member_of_webkom,
            "The authenticated user was supposed to be a member of webkom",
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        self.assertEqual(
            Admission.objects.count(), 0, "The admission did not get deleted"
        )

    def test_staff_creator_can_delete_admission(self):
        self.admission.created_by.is_staff = True
        self.admission.created_by.save()
        self.client.force_authenticate(user=self.admission.created_by)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        self.assertEqual(
            Admission.objects.count(), 0, "The admission did not get deleted"
        )

    def test_staff_noncreator_cannot_delete_admission(self):
        staff_user = LegoUser.objects.create(username="staff", lego_id=2, is_staff=True)
        self.client.force_authenticate(user=staff_user)

        self.assertNotEqual(
            staff_user.username,
            self.admission.created_by.username,
            "Authorized user did not create the admission",
        )
        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        self.assertEqual(Admission.objects.count(), 1, "The admission still exists")

    def test_nonstaff_creator_cannot_delete_admission(self):
        self.client.force_authenticate(user=self.admission.created_by)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.assertEqual(Admission.objects.count(), 1, "The admission got deleted")

    def test_pleb_cannot_delete_admission(self):
        pleb = LegoUser.objects.create(username="pleb", lego_id=2)
        self.client.force_authenticate(user=pleb)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.assertEqual(Admission.objects.count(), 1, "The admission still exists")


class DeleteAdmissionValidityTestCase(APITestCase):
    """
    Test that the state of the admission allows deletion
    """

    def setUp(self) -> None:
        tomorrow = fake_timedelta(1)
        self.admission = create_admission(closed_from=tomorrow)
        self.admission.created_by.is_staff = True
        self.admission.created_by.save()

    def test_unclosed_admission_cannot_be_deleted(self):
        self.client.force_authenticate(user=self.admission.created_by)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            Admission.objects.count(), 1, "The admission was not supposed be deleted"
        )


class DeleteAdmissionCompleteTestCase(APITestCase):
    """
    Test that all data pertaining to the admission has in fact been deleted
    """

    def setUp(self) -> None:
        # Create an admission and user that should be possible to delete
        yesterday = fake_timedelta(-1)
        self.admission = create_admission(closed_from=yesterday)
        self.admission.created_by.is_staff = True
        self.admission.created_by.save()

        self.pleb = LegoUser.objects.create(lego_id=2)

        self.user_application = UserApplication.objects.create(
            admission=self.admission,
            user=self.pleb,
            text="Jeg søker til dette opptaket fordi det er dritkult og sånn, prioritering er ikke så farlig",
            phone_number="004712345678",
        )

        self.group = Group.objects.create(name="Testgruppe", lego_id=3)

        GroupApplication.objects.create(
            application=self.user_application,
            group=self.group,
            text="Jeg synes denne gruppa virker dritkul så plis la meg komme på intervju",
        )

    def test_all_admission_data_is_deleted(self):
        self.client.force_authenticate(user=self.admission.created_by)

        self.assertEqual(
            Admission.objects.count(), 1, "Only 1 admission was supposed to exist"
        )
        self.assertEqual(
            UserApplication.objects.count(),
            1,
            "Only 1 user application was supposed to exist",
        )
        self.assertEqual(
            GroupApplication.objects.count(),
            1,
            "Only 1 group application was supposed to exist",
        )
        self.assertEqual(
            LegoUser.objects.count(), 2, "Only 2 users were supposed to exist"
        )

        res = self.client.delete(
            reverse("manage-admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

        self.assertEqual(Admission.objects.count(), 0, "The admission was not deleted")
        self.assertEqual(
            UserApplication.objects.count(), 0, "There are still user application(s)"
        )
        self.assertEqual(
            GroupApplication.objects.count(), 0, "There are still grup application(s)"
        )
        self.assertEqual(
            LegoUser.objects.count(), 2, "The amount of users has been changed"
        )
