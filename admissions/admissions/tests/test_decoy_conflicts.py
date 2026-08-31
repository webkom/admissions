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

    def test_the_owner_gets_their_filler_names_for_display(self):
        """The review UI must render filler names next to real candidates, so
        the owner's own row carries {id, name} entries keyed by the same
        tokens proposed_candidate_ids uses."""
        availability = self.client.get(self.availability_url)
        mine = next(row for row in availability.data if row["is_me"])
        self.assertEqual(
            [{"id": self.decoy_token, "name": "Filler One"}],
            mine["decoy_candidates"],
        )

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

    def test_an_unknown_decoy_token_is_dropped_like_an_unknown_candidate(self):
        """Both an unrecognised filler token and an unrecognised real id are
        dropped from the save, not rejected - identically, so the response
        still says nothing about which entries were fillers."""
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

        self.assertEqual(token_res.status_code, status.HTTP_200_OK, token_res.data)
        self.assertEqual(
            candidate_res.status_code, status.HTTP_200_OK, candidate_res.data
        )
        self.assertEqual(token_res.data["reviewed_candidate_ids"], [])
        self.assertEqual(candidate_res.data["reviewed_candidate_ids"], [])
        row = InterviewAvailability.objects.get(
            admission=self.admission, group=self.group, user=self.interviewer
        )
        self.assertEqual(row.reviewed_candidate_ids, [])
        self.assertEqual(row.decoy_reviewed_ids, [])

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
        # The admin is neither a member of nor an interview admin for this
        # committee, so the availability list itself stays out of reach.

    def test_admin_can_round_trip_a_target_users_legacy_decoy_token(self):
        admin_group = Group.objects.create(name="AdminGroup", lego_id=17)
        self.admission.admin_groups.add(admin_group)
        admin = LegoUser.objects.create(username="admin-2", lego_id=6003)
        Membership.objects.create(user=admin, group=admin_group, role=LEADER)

        self.client.force_authenticate(user=admin)
        response = self.client.post(
            self.availability_url,
            {
                "user_id": str(self.interviewer.pk),
                "reviewed_candidate_ids": [self.decoy_token],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertIn(self.decoy_token, response.data["reviewed_candidate_ids"])

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

    def test_the_save_echo_carries_the_filler_names(self):
        """A save's echo hands back the same names channel as the next GET,
        so diffing the two reveals nothing."""
        post_res = self.client.post(
            self.availability_url,
            {"reviewed_candidate_ids": [self.decoy_token]},
            format="json",
        )
        self.assertEqual(
            [{"id": self.decoy_token, "name": "Filler One"}],
            post_res.data["decoy_candidates"],
        )

        get_res = self.client.get(self.availability_url)
        mine = next(row for row in get_res.data if row["is_me"])
        self.assertEqual(post_res.data["decoy_candidates"], mine["decoy_candidates"])

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
        self.availability_url = reverse(
            "interview-availability",
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

    def test_only_the_own_row_carries_filler_names(self):
        """My filler names ride my row and nobody else's: if the response
        handed me another interviewer's decoy list, cross-comparing two
        lists would separate fillers from reals in one request."""
        self.client.force_authenticate(user=self.interviewer)

        res = self.client.get(self.availability_url)

        rows = {row["user_id"]: row for row in res.data}
        self.assertEqual(
            sorted(
                [
                    (self.zora_token, "Zora Filler"),
                    (self.anna_token, "Anna Filler"),
                ]
            ),
            sorted(
                (entry["id"], entry["name"])
                for entry in rows[str(self.interviewer.id)]["decoy_candidates"]
            ),
        )
        self.assertEqual([], rows[str(self.recruiter.id)]["decoy_candidates"])


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


class PlainMemberReviewScopeTestCase(APITestCase):
    """An ordinary committee member proposed as an interviewer must be able
    to perform their own inhabilitetssjekk pre-publication: publication waits
    on that confirmation, so without a member-reachable path the workflow
    deadlocks (the recruiter cannot publish, and the member has no UI). The
    availability row is that path - it already carries the review tokens and
    filler names, and must also carry the real names behind the tokens."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=16)
        self.admission.groups.add(self.group)
        self.recruiter = LegoUser.objects.create(username="rec", lego_id=6101)
        Membership.objects.create(
            user=self.recruiter, group=self.group, role=RECRUITING
        )
        self.member = LegoUser.objects.create(username="member", lego_id=6102)
        Membership.objects.create(user=self.member, group=self.group, role="member")
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.member,
            slots=["2026-04-21|540"],
        )
        self.candidate_user = LegoUser.objects.create(
            username="cand", lego_id=6103, first_name="Kari", last_name="Kandidat"
        )
        self.application = UserApplication.objects.create(
            admission=self.admission, user=self.candidate_user
        )
        GroupApplication.objects.create(
            application=self.application, group=self.group, text="Søknad"
        )
        self.saved_schedule = SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": "Kari Kandidat",
                    "time": 540,
                    "panel": [{"id": str(self.member.pk), "name": "member"}],
                }
            ],
            start_date="2026-04-21",
            session_duration=60,
            enabled_slots=["2026-04-21|540"],
            conflict_review_open=True,
        )
        ConflictReviewList.objects.create(
            saved_schedule=self.saved_schedule,
            revision=uuid.uuid4(),
            interviewer=self.member,
            own_candidate_ids=[str(self.application.pk)],
            swap_candidate_ids=[],
            decoys=[{"token": f"d:{uuid.uuid4()}", "name": "Filler One"}],
        )
        self.availability_url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )

    def test_member_own_row_carries_real_names_for_review(self):
        self.client.force_authenticate(user=self.member)
        res = self.client.get(self.availability_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        mine = next(row for row in res.data if row["is_me"])
        self.assertIn(str(self.application.pk), mine["proposed_candidate_ids"])
        self.assertIn(
            {"id": str(self.application.pk), "name": "Kari Kandidat"},
            mine["review_candidates"],
        )
        # The filler rides the same lookup, indistinguishable from real candidates.
        self.assertEqual(len(mine["review_candidates"]), 2)
        self.assertEqual(mine["review_candidates"], mine["decoy_candidates"])

    def test_review_names_never_appear_on_other_rows_or_admin_responses(self):
        self.client.force_authenticate(user=self.recruiter)
        res = self.client.get(self.availability_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        for row in res.data:
            self.assertEqual(row["review_candidates"], [])

    def test_member_can_complete_own_review_and_close_the_loop(self):
        self.client.force_authenticate(user=self.member)
        mine = next(
            row for row in self.client.get(self.availability_url).data if row["is_me"]
        )
        res = self.client.post(
            self.availability_url,
            {
                "reviewed_candidate_ids": [
                    entry["id"] for entry in mine["review_candidates"]
                ],
                "conflicts": [],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        mine = next(
            row for row in self.client.get(self.availability_url).data if row["is_me"]
        )
        self.assertTrue(mine["conflict_review_complete"])
