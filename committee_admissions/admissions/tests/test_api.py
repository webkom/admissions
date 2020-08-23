from datetime import timedelta
from unittest import skip

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from committee_admissions.admissions.constants import LEADER, MEMBER, RECRUITING
from committee_admissions.admissions.models import (
    Admission,
    Committee,
    CommitteeApplication,
    LegoUser,
    Membership,
    UserApplication,
)


def fake_timedelta(days=0):
    base_date = timezone.now().replace(hour=12, minute=15, second=0, microsecond=0)

    return base_date + timedelta(days=days)


def create_admission():
    base_date = timezone.now().replace(hour=23, minute=59, second=59, microsecond=59)

    open_date = base_date.replace(
        hour=12, minute=15, second=0, microsecond=0
    ) - timedelta(days=1)
    public_deadline_date = base_date + timedelta(days=7)
    application_deadline_date = base_date + timedelta(days=9)

    return Admission.objects.create(
        title=f"Opptak {base_date.year}",
        open_from=open_date,
        public_deadline=public_deadline_date,
        application_deadline=application_deadline_date,
    )


class EditCommitteeTestCase(APITestCase):
    def setUp(self):
        self.webkom = Committee.objects.create(
            name="Webkom",
            description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!",
        )
        self.arrkom = Committee.objects.create(
            name="Arrkom",
            description="Arrkom arrangerer ting",
            response_label="Søk Arrkom fordi vi har det kult!",
        )

        self.pleb = LegoUser.objects.create()
        self.webkom_leader = LegoUser.objects.create(username="webkom_leader")
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, committee=self.webkom
        )
        self.webkom_recruiter = LegoUser.objects.create(username="webkom_recruiter")
        Membership.objects.create(
            user=self.webkom_recruiter, role=RECRUITING, committee=self.webkom
        )

        self.edit_committee_data = {
            "response_text": "Halla, Webkom er ikke noe gucci",
            "description": "Webkoms maskott er en ku(le)",
        }

    def test_pleb_cannot_edit_committee(self):
        self.client.force_authenticate(user=self.pleb)

        res = self.client.patch(
            reverse("committee-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_committee_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_committee_leader_cannot_edit_other_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("committee-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_committee_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_leader_can_edit_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse("committee-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_committee_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_committee_recruiter_can_edit_committee(self):
        self.client.force_authenticate(user=self.webkom_recruiter)

        res = self.client.patch(
            reverse("committee-detail", kwargs={"pk": self.webkom.pk}),
            self.edit_committee_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_abakus_leader_cannot_edit_committee(self):
        abakus_leader = LegoUser.objects.create(
            username="bigsupremeleader", is_superuser=True
        )
        self.client.force_authenticate(user=abakus_leader)

        res = self.client.patch(
            reverse("committee-detail", kwargs={"pk": self.arrkom.pk}),
            self.edit_committee_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

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
            reverse("admission-detail", kwargs={"pk": self.admission.pk}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_leader_cannot_edit_admission(self):
        webkom_leader = LegoUser.objects.create(username="webkomleader")
        webkom = Committee.objects.create(name="Webkom")
        Membership.objects.create(user=webkom_leader, role=LEADER, committee=webkom)

        self.client.force_authenticate(user=webkom_leader)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"pk": self.admission.pk}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_member_cannot_edit_admission(self):
        webkom_member = LegoUser.objects.create(username="webkommember")
        webkom = Committee.objects.create(name="Webkom")
        Membership.objects.create(user=webkom_member, role=MEMBER, committee=webkom)

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"pk": self.admission.pk}),
            self.edit_admission_data,
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthorized_user_cannot_edit_admission(self):
        res = self.client.patch(
            reverse("admission-detail", kwargs={"pk": self.admission.pk}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_abakus_leader_can_edit_admission(self):
        abakus_leader = LegoUser.objects.create(
            username="bigsupremeleader", is_superuser=True
        )

        self.client.force_authenticate(user=abakus_leader)

        res = self.client.patch(
            reverse("admission-detail", kwargs={"pk": self.admission.pk}),
            self.edit_admission_data,
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)


class CreateApplicationTestCase(APITestCase):
    def setUp(self):
        # Create admission and committee
        self.admission = create_admission()
        self.webkom = Committee.objects.create(name="Webkom")
        self.koskom = Committee.objects.create(name="Koskom")

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna")

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "applications": {
                "webkom": "Hohohohohohohohohohooho webbis",
                "koskom": "Hahahahahahahahahahaha arris",
            },
            "phone_number": "12345678",
        }

        # Setup Bob
        self.pleb_bob = LegoUser.objects.create(username="Bob")

    def test_cannot_apply_for_someone_else(self):
        # Login as Bob, and try to apply as Anna. User should then be Bob
        self.client.force_authenticate(user=self.pleb_bob)

        annas_application_data = self.application_data.copy()

        annas_application_data["user"] = self.pleb_anna.pk

        res = self.client.post(
            reverse("userapplication-list"), annas_application_data, format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        pk_res = res.json()["pk"]

        # Application registered as bob
        self.assertEqual(UserApplication.objects.get(pk=pk_res).user, self.pleb_bob)

    def test_can_apply(self):
        self.client.force_authenticate(user=self.pleb_anna)
        res = self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_editing_application_works_correctly(self):
        self.client.force_authenticate(user=self.pleb_anna)

        # Apply first with webkom and koskom
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        self.assertEqual(
            2,
            UserApplication.objects.get(
                user=self.pleb_anna
            ).committee_applications.count(),
        )

        self.application_data = {
            "text": "Ønsker Webkom mest",
            "applications": {"webkom": "Hohohohohohohohohohooho webbis"},
            "phone_number": "12345678",
        }

        # Apply then only with webkom, removing koskom
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        self.assertEqual(
            1,
            UserApplication.objects.get(
                user=self.pleb_anna
            ).committee_applications.count(),
        )


class ListApplicationsTestCase(APITestCase):
    def setUp(self):
        self.pleb = LegoUser.objects.create()
        self.admission = create_admission()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader")
        self.webkom_rec = LegoUser.objects.create(username="webkomrec")

        self.webkom = Committee.objects.create(name="Webkom")

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, committee=self.webkom
        )
        Membership.objects.create(
            user=self.webkom_rec, role=RECRUITING, committee=self.webkom
        )

        self.bedkom_leader = LegoUser.objects.create(username="bedkomleader")
        self.bedkom_rec = LegoUser.objects.create(username="bedkomrec")

        self.bedkom = Committee.objects.create(name="Bedkom")

        Membership.objects.create(
            user=self.bedkom_leader, role=LEADER, committee=self.bedkom
        )
        Membership.objects.create(
            user=self.bedkom_rec, role=RECRUITING, committee=self.bedkom
        )
        self.application_data = {
            "text": "testtest",
            "applications": {
                "webkom": "Webkom application",
                "bedkom": "Bedkom application",
            },
            "phone_number": "00000000",
        }

    def unauthorized_user_cannot_see_other_applications(self):
        """ Normal users should not be able to list applications """
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(reverse("userapplication-list"))

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_see_other_applications(self):
        """ Normal users should not be able to list applications """
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(reverse("userapplication-list"))

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # Should test for both application-mine and application-list unless editing current view
    def test_can_see_own_application(self):
        UserApplication.objects.create(user=self.pleb, admission=self.admission)

        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(reverse("userapplication-mine"))
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_cannot_get_application_by_pk(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse("userapplication-detail", kwargs={"pk": application.pk})
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_leader_can_see_applications_for_own_committee(self):
        self.client.force_authenticate(user=self.pleb)
        application_data = {
            "text": "testtest",
            "applications": {"webkom": "Webkom application"},
            "phone_number": "00000000",
        }
        self.client.post(
            reverse("userapplication-list"), application_data, format="json"
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one CommitteeApplication
        self.assertEqual(len(json[0]["committee_applications"]), 1)
        # This CommitteeApplication should be to webkom
        self.assertEqual(
            json[0]["committee_applications"][0]["committee"]["name"], "Webkom"
        )

    def test_committee_recruiter_can_see_applications_for_own_committee(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one CommitteeApplication
        self.assertEqual(len(json[0]["committee_applications"]), 1)
        # This CommitteeApplication should be to webkom
        self.assertEqual(
            json[0]["committee_applications"][0]["committee"]["name"], "Webkom"
        )

    def test_committee_leader_cannot_see_applications_for_other_committee(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # There should not be a committee application for bedkom here
        for committee_application in json[0]["committee_applications"]:
            self.assertNotEqual(committee_application["committee"]["name"], "Bedkom")

        # Re-Auth as bedkom_leader
        self.client.force_authenticate(user=self.bedkom_leader)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # There should not be a committee application for bedkom here
        for committee_application in json[0]["committee_applications"]:
            self.assertNotEqual(committee_application["committee"]["name"], "Webkom")

    def test_committee_recruiter_cannot_see_applications_for_other_committee(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # There should not be a committee application for bedkom here
        for committee_application in json[0]["committee_applications"]:
            self.assertNotEqual(committee_application["committee"]["name"], "Bedkom")

        # Re-Auth as bedkom_rec
        self.client.force_authenticate(user=self.bedkom_rec)
        res = self.client.get(reverse("userapplication-list"))
        json = res.json()
        # There should not be a committee application for bedkom here
        for committee_application in json[0]["committee_applications"]:
            self.assertNotEqual(committee_application["committee"]["name"], "Webkom")

    def test_abakus_leader_can_see_all_applications(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse("userapplication-list"), self.application_data, format="json"
        )

        # Auth user as AbakusLeader
        abakus_leader = LegoUser.objects.create(username="abakus_leader")
        abakus_leader.is_superuser = True

        self.client.force_authenticate(user=abakus_leader)
        res = self.client.get(reverse("userapplication-list"))
        apps = res.json()[0]["committee_applications"]

        # Ensure that the leader can see both the webkom and the bedkom application
        self.assertEqual(apps[0]["committee"]["name"], "Webkom")
        self.assertEqual(apps[1]["committee"]["name"], "Bedkom")
