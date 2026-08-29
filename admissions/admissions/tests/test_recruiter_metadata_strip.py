"""Regression test for the medium-severity audit finding: the
AdminUserApplicationSerializer must strip recruiter-side
interview_status metadata (updated_at, updated_by) from
non-admin views, mirroring the PATCH endpoint's behaviour at
views.py:432-436. Otherwise a recruiter of one committee could
discover the workflow identity of a recruiter of another committee
on the list response, but not on the PATCH response - the
inconsistency is the leak.
"""

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import RECRUITING
from admissions.admissions.models import (
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class RecruiterMetadataStripTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=20)
        self.webkom = Group.objects.create(name="Webkom", lego_id=21)
        self.admission.groups.add(self.bedkom, self.webkom)
        # Bedkom is NOT in admin_groups: a recruiter here has
        # committee_full / committee_minimal mode and is the
        # non-admin viewer in this regression.
        self.recruiter = LegoUser.objects.create(username="rec-bk", lego_id=30)
        Membership.objects.create(
            user=self.recruiter, group=self.bedkom, role=RECRUITING
        )
        self.candidate = LegoUser.objects.create(username="candidate", lego_id=31)
        self.candidate_user_app = UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="00000000",
            interview_status="confirmed",
            interview_status_updated_by=self.recruiter,
            interview_status_updated_by_username=self.recruiter.username,
        )
        GroupApplication.objects.create(
            application=self.candidate_user_app,
            group=self.bedkom,
            text="bedkom application text",
        )
        self.url = reverse(
            "admin-userapplication-list",
            kwargs={"admission_slug": self.admission.slug},
        )

    def test_recruiter_list_does_not_leak_recruiter_metadata(self):
        """A Bedkom recruiter (no admin role) must not see the
        recruiter's username on the list response. The status value
        itself is still visible, so the workflow can continue."""
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["interview_status"], "confirmed")
        self.assertNotIn("interview_status_updated_by", res.data[0])
        # The timestamp of the status change is needed as the revision token
        # (expected_interview_status_updated_at) for the PATCH endpoint.
        self.assertIn("interview_status_updated_at", res.data[0])

    def test_recruiter_list_still_exposes_committee_level_text(self):
        """Stripping the metadata must not break the recruiter's
        access to the committee-level text and header_fields_response.
        """
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data[0]["group_applications"]), 1)
        self.assertEqual(
            res.data[0]["group_applications"][0]["text"],
            "bedkom application text",
        )
        # And the candidate's identity (name + phone) is still visible.
        self.assertEqual(res.data[0]["phone_number"], "00000000")
