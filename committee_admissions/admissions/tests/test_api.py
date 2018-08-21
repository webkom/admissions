from unittest import skip

from django.http import JsonResponse
from django.forms.models import model_to_dict
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone

from rest_framework import status
from rest_framework.test import APITestCase

from committee_admissions.admissions.models import Committee, LegoUser, Membership, Admission
from committee_admissions.admissions.constants import LEADER, MEMBER

def fake_time(y, m, d):
    dt = timezone.datetime(y, m, d)
    dt = timezone.pytz.timezone('UTC').localize(dt)
    return dt


class EditCommitteeTestCase(APITestCase):
    def setUp(self):
        self.webkom = Committee.objects.create(
            name="Webkom", description="Webkom styrer tekniske ting",
            response_label="Søk Webkom fordi du lærer deg nyttige ting!"
        )
        self.arrkom = Committee.objects.create(
            name="Arrkom", description="Arrkom arrangerer ting",
            response_label="Søk Arrkom fordi vi har det kult!"
        )
        self.webkom_leader = LegoUser.objects.create(username="webkom")
        self.webkom_group = Group.objects.create(name="Webkom")
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, abakus_group=self.webkom_group
        )

        self.edit_committee_data = {
            'response_text': 'Halla, Webkom er ikke noe gucci',
            'description': 'Webkoms maskott er en ku(le)'
        }

    def test_pleb_cannot_edit_committee(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.arrkom.pk}), self.edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_committee_leader_cannot_edit_other_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.arrkom.pk}), self.edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_committee_leader_can_edit_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.webkom.pk}), self.edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_abakus_leader_cannot_edit_committee(self):
        abakus_leader = LegoUser.objects.create(username="bigsupremeleader")
        hovedstyret = Group.objects.create(name="Hovedstyret")
        Membership.objects.create(
            user=abakus_leader, role=LEADER, abakus_group=hovedstyret
        )

        self.client.force_authenticate(user=abakus_leader)

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.arrkom.pk}), self.edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


    # What about when not logged in aka. have a user? Rewrite api (remove LoginRequiredMixins
    # from views to stop from redirecting, and handle redirecting ourselves with permissions.
    # In this way, when using the api and not viewing in frontend, you are not redirected (disabled).
    # Disable redirecting when using api not in frontend. Or something along those lines).

    # Only testing with PATCH now, might want to test with other methods as well


class EditAdmissionTestCase(APITestCase):
    def setUp(self):
        self.admission = Admission.objects.create(title="Opptak 2018",
                                                  open_from=fake_time(2018, 7, 11),
                                                  public_deadline=fake_time(2018, 9, 1),
                                                  application_deadline=fake_time(2018, 9, 7)
                                                  )
        self.edit_admission_data = {
            'title': 'Plebkom opptak 2018',
            'open_from': fake_time(2019, 1, 18)
        }

    @skip
    def test_pleb_cannot_edit_admission(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        res = self.client.patch(
            reverse('admission-detail', kwargs={'pk': self.admission.pk}), self.edit_admission_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @skip
    def test_committee_leader_cannot_edit_admission(self):
        webkom_leader = LegoUser.objects.create(username="webkomleader")
        webkom_group = Group.objects.create(name="Webkom")
        Membership.objects.create(
            user=webkom_leader, role=LEADER, abakus_group=webkom_group
        )

        self.client.force_authenticate(user=webkom_leader)

        res = self.client.patch(
            reverse('admission-detail', kwargs={'pk': self.admission.pk}), self.edit_admission_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @skip
    def test_committee_member_cannot_edit_admission(self):
        webkom_member = LegoUser.objects.create(username="webkommember")
        webkom_group = Group.objects.create(name="Webkom")
        Membership.objects.create(
            user=webkom_member, role=MEMBER, abakus_group=webkom_group
        )

        self.client.force_authenticate(user=webkom_member)

        res = self.client.patch(
            reverse('admission-detail', kwargs={'pk': self.admission.pk}), self.edit_admission_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    @skip
    def test_abakus_leader_can_edit_admission(self):
        abakus_leader = LegoUser.objects.create(username="bigsupremeleader")
        hovedstyret = Group.objects.create(name="Hovedstyret")
        Membership.objects.create(
            user=abakus_leader, role=LEADER, abakus_group=hovedstyret
        )

        self.client.force_authenticate(user=abakus_leader)

        res = self.client.patch(
            reverse('admission-detail', kwargs={'pk': self.admission.pk}), self.edit_admission_data
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)


class CreateApplicationTestCase(APITestCase):

    def setUp(self):
        # Create admission and committee
        self.admission = Admission.objects.create(title="Opptak 2018",
                                                  open_from=fake_time(2018, 7, 11),
                                                  public_deadline=fake_time(2018, 9, 1),
                                                  application_deadline=fake_time(2018, 9, 7)
                                                  )

        # Setup Anna
        self.pleb_anna = LegoUser.objects.create(username="Anna")

        self.annas_application_data = {
            # 'user': self.pleb_anna,
            'text': 'Ønsker Webkom mest',
            'applications': {
                'webkom': "Hohohohohohohohohohooho webbis",
                'koskom': "Hahahahahahahahahahaha arris"
            }
        }

        # Setup Bob
        self.pleb_bob = LegoUser.objects.create(username="Bob")


    # TESTS DONT WORK
    @skip
    def test_cannot_apply_for_someone_else(self):
        # Login as Bob, and try to apply as Anna
        self.client.force_authenticate(user=self.pleb_bob)

        res = self.client.post(reverse('application-list'), self.annas_application_data)

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
    @skip
    def test_can_apply(self):
        self.client.force_authenticate(user=self.pleb_anna)
        res = self.client.post(reverse('application-list'), self.annas_application_data)

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)


class ListApplicationsTestCase(APITestCase):

    def setUp(self):
        self.pleb = LegoUser.objects.create()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader")
        self.webkom_group = Group.objects.create(name="Webkom")
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, abakus_group=self.webkom_group
        )

    # Suggesting that the application endpoint list view is blocked for normal users to get from,
    # but they have to post to it (unless changing application-mine to fit that purpose).
    # TEST DOES NOT WORK
    def test_normal_user_cannot_see_other_applications(self):
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(reverse('application-list'))

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # Should test for both application-mine and application-list unless editing current view

    def test_can_see_own_application(self):
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(reverse('application-mine'))

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # Not sure how to test
    def test_abakus_leader_can_see_all_applications(self):
        abakus_leader = LegoUser.objects.create(username="bigsupremeleader")
        hovedstyret = Group.objects.create(name="Hovedstyret")
        Membership.objects.create(
            user=abakus_leader, role=LEADER, abakus_group=hovedstyret
        )

        self.client.force_authenticate(user=abakus_leader)
        self.fail("Not implemented")

    # Not sure how to test
    def test_committee_leader_can_see_applications_for_own_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)
        self.fail("Not implemented")


    # Not sure how to test
    def test_committee_leader_cannot_see_applications_for_other_committees(self):
        self.client.force_authenticate(user=self.webkom_leader)
        self.fail("Not implemented")


