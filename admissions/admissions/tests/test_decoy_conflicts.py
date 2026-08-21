import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, RECRUITING
from admissions.admissions.models import (
    ConflictReviewList,
    Group,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
)
from admissions.admissions.tests.utils import create_admission


class DecoyConflictRoundTripTestCase(APITestCase):
    """The mixed review list only works if a filler is indistinguishable from
    a real swap candidate everywhere an interviewer can look."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=15)
        self.admission.groups.add(self.group)
        self.interviewer = LegoUser.objects.create(username="mine", lego_id=6001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="member"
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.interviewer,
            slots=["2026-04-21|540"],
        )
        self.saved_schedule = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            conflict_review_open=True,
        )
        self.decoy_token = f"d:{uuid.uuid4()}"
        ConflictReviewList.objects.create(
            saved_schedule=self.saved_schedule,
            revision=uuid.uuid4(),
            interviewer=self.interviewer,
            own_candidate_ids=[],
            swap_candidate_ids=[],
            decoys=[{"token": self.decoy_token, "name": "Filler One"}],
        )
        self.client.force_authenticate(user=self.interviewer)
        self.availability_url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )
        self.candidates_url = reverse(
            "interview-candidates",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )

    def test_the_decoy_appears_in_the_candidate_list(self):
        res = self.client.get(self.candidates_url)

        self.assertIn({"id": self.decoy_token, "name": "Filler One"}, res.data)

    def test_a_decoy_mark_round_trips_through_get_after_post(self):
        res = self.client.post(
            self.availability_url,
            {"reviewed_candidate_ids": [self.decoy_token]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        res = self.client.get(self.availability_url)

        mine = next(row for row in res.data if row["is_me"])
        self.assertIn(self.decoy_token, mine["reviewed_candidate_ids"])
        self.assertIn(self.decoy_token, mine["proposed_candidate_ids"])

    def test_an_unknown_decoy_token_gets_the_same_error_as_an_unknown_candidate(self):
        bogus_token = f"d:{uuid.uuid4()}"
        bogus_candidate_id = str(uuid.uuid4())

        token_res = self.client.post(
            self.availability_url,
            {"reviewed_candidate_ids": [bogus_token]},
            format="json",
        )
        candidate_res = self.client.post(
            self.availability_url,
            {"reviewed_candidate_ids": [bogus_candidate_id]},
            format="json",
        )

        self.assertEqual(token_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(candidate_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            token_res.data["reviewed_candidate_ids"][0],
            f"Ukjent kandidat: {bogus_token}",
        )
        self.assertEqual(
            candidate_res.data["reviewed_candidate_ids"][0],
            f"Ukjent kandidat: {bogus_candidate_id}",
        )

    def test_admin_never_sees_the_decoy_token(self):
        admin_group = Group.objects.create(name="AdminGroup", lego_id=16)
        self.admission.admin_groups.add(admin_group)
        admin = LegoUser.objects.create(username="admin", lego_id=6002)
        Membership.objects.create(user=admin, group=admin_group, role=LEADER)
        self.client.post(
            self.availability_url,
            {"reviewed_candidate_ids": [self.decoy_token]},
            format="json",
        )
        self.client.force_authenticate(user=admin)

        availability_res = self.client.get(self.availability_url)
        candidates_res = self.client.get(self.candidates_url)

        self.assertNotIn(self.decoy_token, str(availability_res.data))
        self.assertNotIn(self.decoy_token, str(candidates_res.data))

    def test_a_decoy_mark_survives_a_real_conflict_written_in_the_same_request(self):
        """Both namespaces round-trip independently in one request."""
        res = self.client.post(
            self.availability_url,
            {
                "reviewed_candidate_ids": [self.decoy_token],
                "conflicts": [self.decoy_token],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        res = self.client.get(self.availability_url)
        mine = next(row for row in res.data if row["is_me"])
        self.assertIn(self.decoy_token, mine["conflicts"])
        self.assertIn(self.decoy_token, mine["reviewed_candidate_ids"])
