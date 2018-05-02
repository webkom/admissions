from django.test import TestCase

from committee_admissions.admissions.models import (
    Admission, Committee, CommitteeApplication, UserApplication
)


class CommitteeTestCase(TestCase):
    fixtures = ['committees.yaml']

    def setUp(self):
        self.webkom = Committee.objects.get(pk=1)


class AdmissionTestCase(TestCase):
    pass


class UserApplicationTestCase(TestCase):
    pass


class CommitteeApplicationTestCase(TestCase):
    pass
