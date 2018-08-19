from unittest import skip

from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from committee_admissions.admissions.models import Committee, LegoUser, Membership


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
        self.webkom_leader = LegoUser.objects.create(pk=2, username="webkom")
        self.webkom_group = Group.objects.create(name="Webkom")
        Membership.objects.create(
            user=self.webkom_leader, role="leader", abakus_group=self.webkom_group
        )

    def test_pleb_cannot_edit_committee(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        edit_committee_data = {
            'response_text': 'Halla, Webkom er ikke noe gucci',
            'description': 'Webkoms maskott er en ku(le)'
        }

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.arrkom.pk}), edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_wrong_committee_leader_cannot_edit_other_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        edit_committee_data = {
            'response_text': 'Halla, Arrkom er ikke noe gucci',
            'description': 'Webkoms maskott er en ku(le)'
        }

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.arrkom.pk}), edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_abakus_leader_cannot_edit_committee(self):
        self.client.force_authenticate(user=self.webkom_leader)

        edit_committee_data = {
            'response_text': 'Halla, Arrkom er ikke noe gucci',
            'description': 'Webkoms maskott er en ku(le)'
        }

        res = self.client.patch(
            reverse('committee-detail', kwargs={'pk': self.webkom.pk}), edit_committee_data
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # What about when not logged in aka. have a user?


class EditAdmissionTestCase(TestCase):
    @skip
    def test_pleb_cannot_edit_admission(self):
        self.fail("Not implemented")

    @skip
    def test_committee_leader_cannot_edit_admission(self):
        self.fail("Not implemented")

    @skip
    def test_abakus_can_edit_admission(self):
        self.fail("Not implemented")


class CreateApplicationTestCase(TestCase):
    @skip
    def test_cannot_apply_for_someone_else(self):
        self.fail("Not implemented")

    @skip
    def test_can_apply(self):
        self.fail("Not implemented")


class ListApplicationsTestCase(TestCase):
    @skip
    def test_normal_user_cannot_see_other_applications(self):
        self.fail("Not implemented")

    @skip
    def test_can_see_own_application(self):
        self.fail("Not implemented")

    @skip
    def test_abakus_leader_can_see_all_applications(self):
        self.fail("Not implemented")

    @skip
    def test_committee_leader_can_see_applications_for_own_committee(self):
        self.fail("Not implemented")

    @skip
    def test_committee_leader_cannot_see_applications_for_other_committees(self):
        self.fail("Not implemented")
