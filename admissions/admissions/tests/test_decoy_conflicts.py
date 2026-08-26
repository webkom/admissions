import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, RECRUITING
from admissions.admissions.models import (
    ConflictReviewList,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.tests.utils import create_admission


class DecoyConflictRoundTripTestCase(APITestCase):
    """The mixed review list only works if a filler is indistinguishable from
    a real swap candidate everywhere an interviewer can look."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=15)
        self.admission.groups.add(self.group)
        # The reviewer is an interview admin (recruiter) now - plain members
        # have no schedule access beyond the published plan.
        self.interviewer = LegoUser.objects.create(username="mine", lego_id=6001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="recruiting"
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

    def test_the_reviewer_sees_the_decoy_in_their_availability_row(self):
        """The decoy rides the availability response's proposed list, not the
        candidate pool: an interview admin always keeps the real pool in the
        candidate list, so the filler only ever shows up where the review
        happens."""
        candidates = self.client.get(self.candidates_url)
        self.assertEqual(candidates.status_code, status.HTTP_200_OK)
        self.assertEqual(candidates.data, [])

        availability = self.client.get(self.availability_url)
        mine = next(row for row in availability.data if row["is_me"])
        self.assertIn(self.decoy_token, mine["proposed_candidate_ids"])

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

    def test_the_saves_echo_matches_the_next_get(self):
        """Diffing a save's echo against the next GET must reveal nothing."""
        post_res = self.client.post(
            self.availability_url,
            {
                "reviewed_candidate_ids": [self.decoy_token],
                "conflicts": [self.decoy_token],
            },
            format="json",
        )
        self.assertEqual(post_res.status_code, status.HTTP_200_OK, post_res.data)

        get_res = self.client.get(self.availability_url)
        mine = next(row for row in get_res.data if row["is_me"])

        for field in (
            "conflicts",
            "reviewed_candidate_ids",
            "proposed_candidate_ids",
            "conflict_review_complete",
        ):
            self.assertEqual(post_res.data[field], mine[field], field)
        self.assertIn(self.decoy_token, post_res.data["conflicts"])
        self.assertIn(self.decoy_token, post_res.data["proposed_candidate_ids"])


class DecoyOrderingAndOperatorScopeTestCase(APITestCase):
    """A filler must hide anywhere in the list, and the committee's own
    workflow operator must never be handed the collapsed list at all."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=25)
        self.admission.groups.add(self.group)
        self.interviewer = LegoUser.objects.create(username="orderer", lego_id=6101)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="recruiting"
        )
        self.recruiter = LegoUser.objects.create(username="operator", lego_id=6102)
        Membership.objects.create(
            user=self.recruiter, group=self.group, role=RECRUITING
        )
        for user in (self.interviewer, self.recruiter):
            InterviewAvailability.objects.create(
                admission=self.admission,
                group=self.group,
                user=user,
                slots=["2026-04-21|540"],
            )
        self.kari = LegoUser.objects.create(
            username="kari", first_name="Kari", last_name="Applicant", lego_id=6103
        )
        self.kari_application = UserApplication.objects.create(
            admission=self.admission, user=self.kari
        )
        GroupApplication.objects.create(
            application=self.kari_application, group=self.group, text="Kari"
        )
        self.saved_schedule = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            conflict_review_open=True,
        )
        self.anna_token = str(uuid.uuid4())
        self.zora_token = str(uuid.uuid4())
        for user in (self.interviewer, self.recruiter):
            ConflictReviewList.objects.create(
                saved_schedule=self.saved_schedule,
                revision=uuid.uuid4(),
                interviewer=user,
                own_candidate_ids=[str(self.kari_application.pk)],
                swap_candidate_ids=[],
                decoys=[
                    {"token": self.zora_token, "name": "Zora Filler"},
                    {"token": self.anna_token, "name": "Anna Filler"},
                ],
            )
        self.candidates_url = reverse(
            "interview-candidates",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )

    def test_every_interview_admin_keeps_the_full_candidate_list(self):
        """No one is handed a collapsed list with fillers anymore: members
        never see candidates at all, and interview admins always keep the
        real pool."""
        for user in (self.interviewer, self.recruiter):
            with self.subTest(role=user.username):
                self.client.force_authenticate(user=user)

                res = self.client.get(self.candidates_url)

                self.assertEqual(res.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    [entry["id"] for entry in res.data],
                    [str(self.kari_application.pk)],
                )


class PartialPublishIdentityTestCase(APITestCase):
    """Identity must stop at the same boundary the schedule rows do."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=35)
        self.admission.groups.add(self.group)
        self.member = LegoUser.objects.create(username="plain-member", lego_id=6201)
        Membership.objects.create(user=self.member, group=self.group, role="member")
        self.early = self._applicant("early", "Early", 6202)
        self.late = self._applicant("late", "Late", 6203)
        self.schedule = [
            {
                "candidate_id": str(self.early.pk),
                "candidate": "Early Candidate",
                "time": 540,
                "panel": [],
            },
            {
                "candidate_id": str(self.late.pk),
                "candidate": "Late Candidate",
                "time": 2 * 24 * 60 + 540,
                "panel": [],
            },
        ]
        self.candidates_url = reverse(
            "interview-candidates",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )
        self.client.force_authenticate(user=self.member)

    def _applicant(self, username, first_name, lego_id):
        user = LegoUser.objects.create(
            username=username,
            first_name=first_name,
            last_name="Candidate",
            lego_id=lego_id,
        )
        application = UserApplication.objects.create(
            admission=self.admission, user=user
        )
        GroupApplication.objects.create(
            application=application, group=self.group, text=username
        )
        return application

    def _saved(self, distributed_through):
        return SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=self.schedule,
            start_date="2026-04-21",
            session_duration=60,
            distributed_through=distributed_through,
            name_visibility="committee",
        )

    def test_partial_publish_reveals_only_published_candidates(self):
        self._saved("2026-04-22")

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual([entry["id"] for entry in res.data], [str(self.early.pk)])

    def test_full_publish_still_reveals_the_committee_pool(self):
        self._saved("2026-04-24")

        res = self.client.get(self.candidates_url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {entry["id"] for entry in res.data},
            {str(self.early.pk), str(self.late.pk)},
        )
