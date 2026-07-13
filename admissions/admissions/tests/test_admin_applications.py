from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING, RETIREE
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.serializers import UserApplicationSerializer
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class AdminAdmissionPrivacyTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.committee = Group.objects.create(name="Committee", lego_id=20)
        self.admin_group = Group.objects.create(name="Admission admins", lego_id=21)
        self.admission.groups.add(self.committee)
        self.admission.admin_groups.add(self.admin_group)
        self.candidate = LegoUser.objects.create(username="candidate", lego_id=22)
        self.recruiter = LegoUser.objects.create(username="recruiter", lego_id=23)
        self.admin = LegoUser.objects.create(username="admin", lego_id=24)
        Membership.objects.create(
            user=self.recruiter, group=self.committee, role=RECRUITING
        )
        Membership.objects.create(user=self.admin, group=self.admin_group, role=MEMBER)
        UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        self.url = reverse(
            "admin-admission-detail", kwargs={"slug": self.admission.slug}
        )

    def test_anonymous_user_cannot_retrieve_admin_admission(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_candidate_cannot_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.candidate)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_recruiter_can_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("applications", response.data)
        self.assertNotIn(str(self.candidate.pk), str(response.data))

    def test_empty_filtered_prefetch_does_not_expose_global_answers(self):
        application = UserApplication.objects.get(
            admission=self.admission, user=self.candidate
        )
        application.text = "private global answer"
        application.header_fields_response = {"private": "value"}
        application.group_applications_filtered = []

        data = UserApplicationSerializer(application).data

        self.assertIsNone(data["text"])
        self.assertEqual(data["header_fields_response"], {})

    def test_admin_group_member_can_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_retired_membership_does_not_grant_candidate_access(self):
        retired = LegoUser.objects.create(username="retired", lego_id=25)
        Membership.objects.create(user=retired, group=self.admin_group, role=RETIREE)
        Membership.objects.create(user=retired, group=self.committee, role=RETIREE)
        self.client.force_authenticate(user=retired)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ListApplicationsTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG

        self.pleb = LegoUser.objects.create(lego_id=2)
        leader_group = Group.objects.create(name="Abakus-Leder", lego_id=1)

        self.admission = create_admission()
        self.admission.admin_groups.add(leader_group)

        # Abakus leader
        self.staff_user = LegoUser.objects.create(
            username="staff_user", lego_id=3, is_staff=True
        )

        Membership.objects.create(user=self.staff_user, role=MEMBER, group=leader_group)

        # Webkom
        self.webkom_leader = LegoUser.objects.create(username="webkomleader", lego_id=4)
        self.webkom_rec = LegoUser.objects.create(username="webkomrec", lego_id=5)

        self.webkom = Group.objects.create(name="Webkom", lego_id=2)
        self.admission.groups.add(self.webkom)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        Membership.objects.create(
            user=self.webkom_rec, role=RECRUITING, group=self.webkom
        )

        # Bedkom
        self.bedkom_leader = LegoUser.objects.create(username="bedkomleader", lego_id=6)
        self.bedkom_rec = LegoUser.objects.create(username="bedkomrec", lego_id=7)

        self.bedkom = Group.objects.create(name="Bedkom", lego_id=3)
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
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_see_other_applications(self):
        """Normal users should not be able to list applications"""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_admission_slug_returns_404(self):
        """An unknown slug should 404 (via the permission lookup), not 500."""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": "does-not-exist"},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # Should test for both application-mine and application-list unless editing current view
    def test_can_see_own_application(self):
        UserApplication.objects.create(user=self.pleb, admission=self.admission)

        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse(
                "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
            )
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_cannot_get_application_by_pk(self):
        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
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
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
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
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
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
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Bedkom")

        # Re-Auth as bedkom_leader
        self.client.force_authenticate(user=self.bedkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_group_recruiter_cannot_see_applications_for_other_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
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
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_staff_user_can_see_all_applications(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Auth user as AbakusLeader
        self.client.force_authenticate(user=self.staff_user)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        apps = res.json()[0]["group_applications"]

        # Ensure that the leader can see both the webkom and the bedkom application
        self.assertEqual(apps[0]["group"]["name"], "Webkom")
        self.assertEqual(apps[1]["group"]["name"], "Bedkom")


class DeleteGroupApplicationsTestCase(APITestCase):
    """
    Tests for api endpoint allowing leader of group / opptaksansvarlig and staff_user to delete group
    applications

    representative_of_group can only delete applications to their own group. staff_user can
    delete any group applications.

    Users can delete their own applications with the /mine endpoint
    """

    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        self.admission = create_admission()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader", lego_id=6)
        self.pleb = LegoUser.objects.create(lego_id=7)

        self.webkom = Group.objects.create(name="Webkom", lego_id=1)
        self.arrkom = Group.objects.create(name="Arrkom", lego_id=2)
        self.admission.groups.add(self.webkom, self.arrkom)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )

        self.staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=8, is_staff=True
        )

    def test_unauthorized_user_cannot_delete_application(self):
        res = self.client.delete(
            reverse(
                "admin-userapplication-detail",
                kwargs={"admission_slug": self.admission_slug, "pk": "not-a-uuid"},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_can_not_delete_own_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )

        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "admin-userapplication-detail",
                kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
            ),
            {"groupId": self.webkom.pk},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_leader_can_delete_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission, phone_number="12345678"
        )
        arrkom_application = GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Some application text",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Some application text",
        )
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.delete(
            f"{reverse('admin-userapplication-detail', kwargs={'admission_slug': self.admission_slug, 'pk': application.pk})}?groupId={self.webkom.pk}",
        )

        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())
        self.assertEqual(
            GroupApplication.objects.filter(application=application.pk).count(), 1
        )
        self.assertEqual(
            GroupApplication.objects.get(application=application.pk),
            arrkom_application,
        )
