from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from committee_admissions.admissions.models import LegoUser, Committee


class EditCommitteeTestCase(APITestCase):

    def setUp(self):
        self.webkom = Committee.objects.create(name="Webkom", description="Webkom styrer tekniske ting", response_label="Søk Webkom fordi du lærer deg nyttige ting!")
        self.arrkom = Committee.objects.create(name="Arrkom", description="Arrkom arrangerer ting", response_label="Søk Arrkom fordi vi har det kult!")

    def test_pleb_cannot_edit_committee(self):
        pleb = LegoUser.objects.create()
        self.client.force_authenticate(user=pleb)

        edit_committee_data = [
            {
                'response_text': 'Halla, Webkom er ikke noe gucci',
                'description': 'Webkoms maskott er en ku(le)'
            }
        ]

        res = self.client.patch(reverse('committe-detail', kwargs={'pk': 1}), edit_committee_data)
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


    def test_wrong_committee_leader_cannot_edit_other_committee(self):
        self.fail("Not implemented")

    def test_abakus_leader_cannot_edit_committee(self):
        self.fail("Not implemented")

    # What about when not logged in aka. have a user?


class EditAdmissionTestCase(TestCase):
    def test_pleb_cannot_edit_admission(self):
        self.fail("Not implemented")

    def test_committee_leader_cannot_edit_admission(self):
        self.fail("Not implemented")

    def test_abakus_can_edit_admission(self):
        self.fail("Not implemented")


class CreateApplicationTestCase(TestCase):

    def test_cannot_apply_for_someone_else(self):
        self.fail("Not implemented")

    def test_can_apply(self):
        self.fail("Not implemented")


class ListApplicationsTestCase(TestCase):

    def test_normal_user_cannot_see_other_applications(self):
        self.fail("Not implemented")

    def test_can_see_own_application(self):
        self.fail("Not implemented")

    def test_abakus_leader_can_see_all_applications(self):
        self.fail("Not implemented")

    def test_committee_leader_can_see_applications_for_own_committee(self):
        self.fail("Not implemented")

    def test_committee_leader_cannot_see_applications_for_other_committees(self):
        self.fail("Not implemented")






