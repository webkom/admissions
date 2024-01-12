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
from admissions.admissions.tests.utils import (
    DEFAULT_ADMISSION_SLUG,
    create_admission,
    fake_timedelta,
)


class EditGroupTestCase(APITestCase):
    def setUp(self):
        self.webkom = Group.objects.create(
            name="Webkom",
            description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!",
        )
        self.arrkom = Group.objects.create(
            name="Arrkom",
            description="Arrkom arrangerer ting",
            response_label="Søk Arrkom fordi vi har det kult!",
        )

        self.pleb = LegoUser.objects.create()
        self.webkom_leader = LegoUser.objects.create(username="webkom_leader")
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        self.webkom_recruiter = LegoUser.objects.create(username="webkom_recruiter")
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
            reverse("group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_group_leader_cannot_edit_other_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("group-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_group_recruiter_can_edit_group(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        res = self.client.patch(
            reverse("group-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_group_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_staff_user_cannot_edit_group(self):
        staff_user = LegoUser.objects.create(username="bigsupremeleader", is_staff=True)
        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("group-detail", kwargs={"pk": self.arrkom.pk}),
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
        self.admission = create_admission()
        self.edit_admission_data = {
            "title": "Plebkom opptak 2020",
            "open_from": fake_timedelta(days=10),
        }

    def test_pleb_cannot_edit_admission(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_cannot_edit_admission(self):
        webkom_leader = LegoUser.objects.create(username="webkomleader")
        webkom = Group.objects.create(name="Webkom")
        Membership.objects.create(user=webkom_leader, role=LEADER, group=webkom)

        self.client.force_authenticate(user=webkom_leader)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_member_cannot_edit_admission(self):
        webkom_member = LegoUser.objects.create(username="webkommember")
        webkom = Group.objects.create(name="Webkom")
        Membership.objects.create(user=webkom_member, role=MEMBER, group=webkom)

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_edit_admission(self):
        res = self.client.patch(
            reverse("admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_user_can_edit_admission(self):
        staff_user = LegoUser.objects.create(username="bigsupremeleader", is_staff=True)

        self.client.force_authenticate(user=staff_user)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"slug": self.admission.slug}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)


class CreateApplicationTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        # Create admission and group
        self.admission = create_admission()
        self.webkom = Group.objects.create(name="Webkom")
        self.koskom = Group.objects.create(name="Koskom")

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna")

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {
                "webkom": "Hohohohohohohohohohooho webbis",
                "koskom": "Hahahahahahahahahahaha arris",
            },
        }

        # Setup Bob
        self.pleb_bob = LegoUser.objects.create(username="Bob")

    def test_cannot_apply_for_someone_else(self):
        # Login as Bob, and try to apply as Anna. User should then be Bob
        self.client.force_authenticate(user=self.pleb_bob)

        annas_application_data = self.application_data.copy()

        annas_application_data["user"] = self.pleb_anna.pk

        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            annas_application_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        pk_res = res.json()["pk"]

        # Application registered as bob
        self.assertEqual(UserApplication.objects.get(pk=pk_res).user, self.pleb_bob)

    def test_can_apply(self):
        self.client.force_authenticate(user=self.pleb_anna)
        res = self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_editing_application_works_correctly(self):
        self.client.force_authenticate(user=self.pleb_anna)

        # Apply first with webkom and koskom
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(
            2,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "phone_number": "12345678",
            "header_fields_response": {},
            "applications": {"webkom": "Hohohohohohohohohohooho webbis"},
        }

        # Apply then only with webkom, removing koskom
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.assertEqual(
            1,
            UserApplication.objects.get(user=self.pleb_anna).group_applications.count(),
        )


class ListApplicationsTestCase(APITestCase):
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

    def unauthorized_user_cannot_see_other_applications(self):
        res = self.client.get(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_see_other_applications(self):
        """Normal users should not be able to list applications"""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
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

    def unauthorized_user_cannot_delete_application(self):
        """Normal users should not be able to delete group applications"""
        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "userapplication-delete_group_application",
                kwargs={"admission_slug": self.admission_slug},
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
                "userapplication-delete_group_application",
                kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
            )
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def leader_can_delete_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        arrkomAppliction = GroupApplication.objects.create(
            application=application.pk,
            group=self.arrkom,
            text="Some application text",
        )
        GroupApplication.objects.create(
            application=application.pk,
            group=self.webkom,
            text="Some application text",
        )
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.delete(
            reverse(
                "userapplication-delete_group_application",
                kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(UserApplication.filter(application.pk).exists())
        self.assertEqual(
            GroupApplication.objects.filter(application=application.pk).count(), 1
        )
        self.assertEqual(
            GroupApplication.objects.get(application=application.pk),
            arrkomAppliction,
        )
