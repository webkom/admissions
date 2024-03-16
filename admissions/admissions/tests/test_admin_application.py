from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class ApplicationAuthorizationTestCase(APITestCase):
    """
    Verify that the proper permissions are enforced
    """

    pass


class ListApplicationTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG

        self.pleb = LegoUser.objects.create()
        leader_group = Group.objects.create(name="Abakus-Leder")

        self.admission = create_admission()
        self.admission.admin_groups.add(leader_group)

        # Abakus leader
        self.staff_user = LegoUser.objects.create(username="staff_user", is_staff=True)

        Membership.objects.create(user=self.staff_user, role=MEMBER, group=leader_group)

        # Webkom
        self.webkom_leader = LegoUser.objects.create(username="webkomleader")
        self.webkom_rec = LegoUser.objects.create(username="webkomrec")

        self.webkom = Group.objects.create(name="Webkom")
        self.admission.groups.add(self.webkom)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        Membership.objects.create(
            user=self.webkom_rec, role=RECRUITING, group=self.webkom
        )

        # Bedkom
        self.bedkom_leader = LegoUser.objects.create(username="bedkomleader")
        self.bedkom_rec = LegoUser.objects.create(username="bedkomrec")

        self.bedkom = Group.objects.create(name="Bedkom")
        self.admission.groups.add(self.bedkom)

        Membership.objects.create(
            user=self.bedkom_leader, role=LEADER, group=self.bedkom
        )
        Membership.objects.create(
            user=self.bedkom_rec, role=RECRUITING, group=self.bedkom
        )

        # Sample application data
        self.application_data = {
            "text": "testtest",
            "phone_number": "00000000",
            "header_fields_response": {},
            "applications": {
                "webkom": "Webkom application",
                "bedkom": "Bedkom application",
            },
        }

    def test_unauthorized_user_cannot_see_other_applications(self):
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_see_other_applications(self):
        """Normal users should not be able to list applications"""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_get_application_by_pk(self):
        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_can_see_applications_for_own_group(self):
        self.client.force_authenticate(user=self.pleb)
        application_data = {
            "text": "testtest",
            "phone_number": "00000000",
            "header_fields_response": {},
            "applications": {"webkom": "Webkom application"},
        }
        self.client.post(
            reverse("user-application", kwargs={"admission_slug": self.admission_slug}),
            application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one GroupApplication
        self.assertEqual(len(json[0]["group_applications"]), 1)
        # This GroupApplication should be to webkom
        self.assertEqual(json[0]["group_applications"][0]["group"]["name"], "Webkom")

    def test_group_recruiter_can_see_applications_for_own_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("user-application", kwargs={"admission_slug": self.admission_slug}),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one GroupApplication
        self.assertEqual(len(json[0]["group_applications"]), 1)
        # This GroupApplication should be to webkom
        self.assertEqual(json[0]["group_applications"][0]["group"]["name"], "Webkom")

    def test_group_leader_cannot_see_applications_for_other_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("user-application", kwargs={"admission_slug": self.admission_slug}),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()

        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Bedkom")

        # Re-Auth as bedkom_leader
        self.client.force_authenticate(user=self.bedkom_leader)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_group_recruiter_cannot_see_applications_for_other_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("user-application", kwargs={"admission_slug": self.admission_slug}),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Bedkom")

        # Re-Auth as bedkom_rec
        self.client.force_authenticate(user=self.bedkom_rec)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_staff_user_can_see_all_applications(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("user-application", kwargs={"admission_slug": self.admission_slug}),
            self.application_data,
            format="json",
        )

        # Auth user as AbakusLeader
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.get(
            reverse(
                "admin-application-list", kwargs={"admission_slug": self.admission_slug}
            )
        )
        apps = res.json()[0]["group_applications"]

        # Ensure that the leader can see both the webkom and the bedkom application
        self.assertEqual(apps[0]["group"]["name"], "Webkom")
        self.assertEqual(apps[1]["group"]["name"], "Bedkom")


class DeleteApplicationTestCase(APITestCase):
    """
    Tests for api endpoint allowing leader/recruiter of group to delete group applications

    representative_of_group can only delete applications to their own group. Members of admin_groups
    can delete any group applications.
    """

    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        self.admission = create_admission()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader")
        self.pleb = LegoUser.objects.create()

        self.webkom = Group.objects.create(name="Webkom")
        self.arrkom = Group.objects.create(name="Arrkom")

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )

        self.staff_user = LegoUser.objects.create(
            username="bigsupremeleader", is_staff=True
        )

    def test_unauthorized_user_cannot_delete_application(self):
        """Normal users should not be able to delete group applications"""
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        arrkom_appliction = GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Some application text",
        )
        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "admin-application-delete-group-application",
                kwargs={
                    "admission_slug": self.admission_slug,
                    "application_pk": application.pk,
                    "group_pk": arrkom_appliction.pk,
                },
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_member_can_not_delete_own_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Some application text",
        )

        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "admin-application-delete-group-application",
                kwargs={
                    "admission_slug": self.admission_slug,
                    "application_pk": application.pk,
                    "group_pk": self.arrkom.pk,
                },
            )
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_group_can_delete_group_application(self):
        self.admission.admin_groups.set([self.arrkom])
        arrkom_member = LegoUser.objects.create(username="Arrkom-member")
        Membership.objects.create(user=arrkom_member, role=MEMBER, group=self.arrkom)

        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        arrkom_appliction = GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Some application text",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Some application text",
        )
        # Delete the group-application
        self.client.force_authenticate(user=arrkom_member)
        res = self.client.delete(
            reverse(
                "admin-application-delete-group-application",
                kwargs={
                    "admission_slug": self.admission_slug,
                    "application_pk": application.pk,
                    "group_pk": self.webkom.pk,
                },
            )
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())
        self.assertEqual(
            GroupApplication.objects.filter(application=application.pk).count(), 1
        )
        self.assertEqual(
            GroupApplication.objects.get(application=application.pk),
            arrkom_appliction,
        )
