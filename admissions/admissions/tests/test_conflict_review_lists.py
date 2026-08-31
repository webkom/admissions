from uuid import uuid4

from django.test import TestCase, override_settings

from admissions.admissions.models import (
    ConflictReviewList,
    DirectoryEntry,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.scheduling_utils import (
    build_conflict_review_lists,
    conflict_review_offered_scope,
    conflict_review_scope,
    get_conflict_review_readiness,
)
from admissions.admissions.tests.utils import create_admission


class ConflictReviewListTestCase(TestCase):
    """The review list is wider than an interviewer's own panel on purpose.

    If a repair moves a candidate onto their panel, that pair must already have
    been checked — otherwise the repaired plan contains an unreviewed pairing.
    """

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.mine = LegoUser.objects.create(username="mine", lego_id=7001)
        self.other = LegoUser.objects.create(username="other", lego_id=7002)
        for user in (self.mine, self.other):
            Membership.objects.create(user=user, group=self.group, role="member")

    def _candidate(self, name, lego_id):
        user = LegoUser.objects.create(username=name, lego_id=lego_id)
        application = UserApplication.objects.create(
            user=user, admission=self.admission
        )
        GroupApplication.objects.create(
            application=application, group=self.group, text="søknad"
        )
        return application

    def _persist_lists(self, saved):
        """Mirrors _refresh_conflict_review_lists: the builder returns rows,
        the workflow is what stores them."""
        revision = uuid4()
        ConflictReviewList.objects.bulk_create(
            [
                ConflictReviewList(
                    saved_schedule=saved,
                    revision=revision,
                    interviewer_id=interviewer_id,
                    own_candidate_ids=entry["own_candidate_ids"],
                    swap_candidate_ids=entry["swap_candidate_ids"],
                    pool_candidate_ids=entry.get("pool_candidate_ids", []),
                    decoys=entry["decoys"],
                )
                for interviewer_id, entry in build_conflict_review_lists(saved).items()
            ]
        )

    def _plan(self, rows, my_slots):
        InterviewAvailability.objects.create(
            admission=self.admission, group=self.group, user=self.mine, slots=my_slots
        )
        return SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=rows,
            start_date="2026-04-21",
            session_duration=60,
        )

    def _row(self, application, time, panel_user):
        return {
            "candidate_id": str(application.pk),
            "candidate": application.user.username,
            "time": time,
            "panel": [{"id": str(panel_user.id), "name": panel_user.username}],
        }

    def test_the_list_includes_candidates_i_could_be_swapped_onto(self):
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540", "2026-04-21:600"],
        )

        lists = build_conflict_review_lists(saved)

        mine = lists[str(self.mine.id)]
        self.assertEqual([str(ours.pk)], mine["own_candidate_ids"])
        self.assertEqual([str(theirs.pk)], mine["swap_candidate_ids"])

    @override_settings(ADMISSIONS_CONFLICT_REVIEW_V2=False)
    def test_the_kill_switch_disables_review_list_generation(self):
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540", "2026-04-21:600"],
        )

        self.assertEqual({}, build_conflict_review_lists(saved))

    def test_a_candidate_i_cannot_interview_is_not_a_swap_partner(self):
        """Ranking is pointless if I am not free at their time."""
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540"],
        )

        lists = build_conflict_review_lists(saved)

        self.assertEqual([], lists[str(self.mine.id)]["swap_candidate_ids"])

    def test_fillers_stay_empty_until_a_real_roster_exists(self):
        """Invented names would pad the count without providing any cover."""
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        lists = build_conflict_review_lists(saved)

        self.assertEqual([], lists[str(self.mine.id)]["decoys"])

    def test_no_fillers_are_issued_once_the_list_is_complete(self):
        """Fillers padded a list that was a *sample* of the plan: with only
        your own pairings plus a handful of likely swap partners, the set you
        held was itself a signal, so it had to be diluted with people who had
        not applied.

        The list is now the whole placed draft - the same set for everyone -
        so there is nothing left to infer from holding it, and a fake name in
        it would be strictly harmful: a person the interviewer cannot flag and
        who does not exist.
        """
        DirectoryEntry.objects.create(
            lego_user_id=9001, username="filler1", full_name="Filler One"
        )
        DirectoryEntry.objects.create(
            lego_user_id=9002, username="filler2", full_name="Filler Two"
        )
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        lists = build_conflict_review_lists(saved)

        self.assertEqual([], lists[str(self.mine.id)]["decoys"])

    def test_every_placed_candidate_is_offered_for_flagging(self):
        """An interviewer may declare inhabilitet against anyone this
        iteration places, not merely against the pairings that already exist.
        Declaring one early is how the solver *avoids* a bad pairing instead
        of having it rejected after the fact.
        """
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.other,
            slots=["2026-04-21:540", "2026-04-21:600"],
        )

        self._persist_lists(saved)
        row = ConflictReviewList.objects.filter(interviewer=self.mine).first()

        # `theirs` sits on the other interviewer's panel at a time `mine` is
        # not even free for, so it is neither an own pairing nor a swap
        # partner - but it is still offered.
        self.assertIn(str(theirs.pk), row.offered_candidate_ids)
        self.assertNotIn(str(theirs.pk), row.review_candidate_ids)

    def test_widening_the_offered_list_does_not_widen_the_publish_gate(self):
        """The whole point of keeping the two sets apart: extending the plan
        must never block a publish behind someone re-confirming candidates
        they were never assigned. Publication waits on own + swap only.
        """
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.other,
            slots=["2026-04-21:540", "2026-04-21:600"],
        )
        self._persist_lists(saved)

        gate_scope = conflict_review_scope(saved, self.mine.id)
        offered = conflict_review_offered_scope(saved, self.mine.id)

        self.assertTrue(gate_scope.issubset(offered))
        self.assertIn(str(theirs.pk), offered - gate_scope)

    def test_the_filler_cohort_is_stable_across_rebuilds(self):
        """Re-saving a draft must not rotate a fresh cast of fillers through
        the review lists: a name that shows up once and never again stands out
        exactly as much as one that never recurs."""

        for lego_id in range(9100, 9200):
            DirectoryEntry.objects.create(
                lego_user_id=lego_id,
                username=f"filler{lego_id}",
                full_name=f"Filler {lego_id}",
            )
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        def cohort():
            return {
                decoy["name"]
                for entry in build_conflict_review_lists(saved).values()
                for decoy in entry["decoys"]
            }

        self.assertEqual(cohort(), cohort())

    def test_an_interviewer_who_opted_out_gets_no_review_list(self):
        """Someone who opted out cannot complete the check, so a list for
        them would be a roster row that can never be confirmed. The plan is
        what must change if their panel still sits in it."""
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540", "2026-04-21:600"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.other,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )

        lists = build_conflict_review_lists(saved)

        self.assertIn(str(self.mine.id), lists)
        self.assertNotIn(str(self.other.id), lists)

    def test_readiness_ignores_an_interviewer_who_opted_out(self):
        """Readiness must not deadlock behind someone who will never answer:
        they cannot complete the check, so they are not required to."""
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540", "2026-04-21:600"],
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.other,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )

        readiness = get_conflict_review_readiness(
            self.admission, self.group, saved_schedule=saved
        )

        # The required/incomplete lists carry raw user ids, not strings.
        required = {str(value) for value in readiness["required_participant_ids"]}
        incomplete = {str(value) for value in readiness["incomplete_participant_ids"]}
        self.assertNotIn(str(self.other.id), required)
        self.assertNotIn(str(self.other.id), incomplete)
        # Mine still needs to confirm before the plan is ready.
        self.assertIn(str(self.mine.id), incomplete)

    def test_readiness_is_complete_when_the_only_pending_reviewer_opted_out(self):
        ours = self._candidate("ada", 8001)
        theirs = self._candidate("eirik", 8002)
        saved = self._plan(
            [
                self._row(ours, 540, self.mine),
                self._row(theirs, 600, self.other),
            ],
            my_slots=["2026-04-21:540", "2026-04-21:600"],
        )
        # _plan already created mine's row; extend it with the reviewed ids.
        InterviewAvailability.objects.filter(
            admission=self.admission, group=self.group, user=self.mine
        ).update(reviewed_candidate_ids=[str(ours.pk), str(theirs.pk)])
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.other,
            participation=InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            slots=[],
        )

        readiness = get_conflict_review_readiness(
            self.admission, self.group, saved_schedule=saved
        )

        self.assertTrue(readiness["is_complete"])

    def test_the_scope_falls_back_when_no_snapshot_exists(self):
        """Plans saved before review lists existed must still be reviewable."""
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        self.assertEqual(
            {str(ours.pk)}, conflict_review_scope(saved, str(self.mine.id))
        )

    def test_admin_interviewers_receive_all_scheduled_candidates_without_decoys(self):
        """Admin interviewers (leaders/recruiters) must be given all scheduled
        candidates so they can safely swap themselves or others onto any interview,
        without needing decoy fillers."""
        Membership.objects.filter(user=self.mine, group=self.group).update(
            role="leader"
        )
        c1 = self._candidate("c1", 8101)
        c2 = self._candidate("c2", 8102)
        c3 = self._candidate("c3", 8103)
        c4 = self._candidate("c4", 8104)
        c5 = self._candidate("c5", 8105)
        c6 = self._candidate("c6", 8106)
        c7 = self._candidate("c7", 8107)
        c8 = self._candidate("c8", 8108)

        saved = self._plan(
            [
                self._row(c1, 540, self.mine),
                self._row(c2, 600, self.other),
                self._row(c3, 660, self.other),
                self._row(c4, 720, self.other),
                self._row(c5, 780, self.other),
                self._row(c6, 840, self.other),
                self._row(c7, 900, self.other),
                self._row(c8, 960, self.other),
            ],
            my_slots=["2026-04-21:540"],
        )

        lists = build_conflict_review_lists(saved, swap_size=5)

        mine = lists[str(self.mine.id)]
        self.assertEqual([str(c1.pk)], mine["own_candidate_ids"])
        # Regular swap_size is 5, but admin gets ALL 7 other scheduled candidates
        self.assertEqual(7, len(mine["swap_candidate_ids"]))
        for c in [c2, c3, c4, c5, c6, c7, c8]:
            self.assertIn(str(c.pk), mine["swap_candidate_ids"])
        # Admins do not receive decoy fillers
        self.assertEqual([], mine["decoys"])

        # In contrast, non-admin 'other' only gets at most 5 swap candidates
        other = lists[str(self.other.id)]
        self.assertLessEqual(len(other["swap_candidate_ids"]), 5)
