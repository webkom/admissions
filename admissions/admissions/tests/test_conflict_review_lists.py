from uuid import UUID

from django.test import TestCase, override_settings

from admissions.admissions.models import (
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

    def test_decoys_are_drawn_from_a_synced_roster(self):
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

        decoys = lists[str(self.mine.id)]["decoys"]
        self.assertEqual(2, len(decoys))
        names = {decoy["name"] for decoy in decoys}
        self.assertEqual({"Filler One", "Filler Two"}, names)
        for decoy in decoys:
            # Indistinguishable from a real candidate id: a bare uuid4, with
            # no format marker a viewer could filter on.
            self.assertEqual(decoy["token"], str(UUID(decoy["token"])))
        # Each generation mints fresh tokens - never a real candidate pk.
        real_ids = {str(ours.pk)}
        self.assertFalse(real_ids & {decoy["token"] for decoy in decoys})

    def test_a_real_applicant_is_never_offered_as_their_own_decoy(self):
        """If a first-year is both in the roster and an applicant, using them
        as a filler would tell the interviewer they definitely applied."""
        ours = self._candidate("ada", 8001)
        DirectoryEntry.objects.create(
            lego_user_id=8001, username="ada", full_name="Ada Applicant"
        )
        DirectoryEntry.objects.create(
            lego_user_id=9003, username="filler3", full_name="Filler Three"
        )
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        lists = build_conflict_review_lists(saved)

        names = {decoy["name"] for decoy in lists[str(self.mine.id)]["decoys"]}
        self.assertEqual({"Filler Three"}, names)

    def test_committee_members_are_never_offered_as_decoys(self):
        """Committee members must never show up as fillers in their own
        committee's conflict review lists."""
        DirectoryEntry.objects.create(
            lego_user_id=self.mine.lego_id,
            username=self.mine.username,
            full_name=self.mine.get_full_name() or "My Committee Member",
        )
        DirectoryEntry.objects.create(
            lego_user_id=self.other.lego_id,
            username=self.other.username,
            full_name=self.other.get_full_name() or "Other Committee Member",
        )
        DirectoryEntry.objects.create(
            lego_user_id=9004, username="filler4", full_name="Filler Four"
        )
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        lists = build_conflict_review_lists(saved)

        names = {decoy["name"] for decoy in lists[str(self.mine.id)]["decoys"]}
        self.assertIn("Filler Four", names)
        self.assertNotIn(self.mine.get_full_name() or "My Committee Member", names)
        self.assertNotIn(self.other.get_full_name() or "Other Committee Member", names)

    def test_the_filler_cohort_is_bounded_by_the_real_candidate_pool(self):
        """Drawing each list straight out of the full student directory is
        what would give the game away. With thousands of names to draw from,
        two interviewers comparing lists would find that every name they both
        hold is a real applicant, and every name only one of them holds is a
        filler. A cohort about the size of the real pool makes fillers recur
        at roughly the rate real candidates do, so the comparison says
        nothing."""

        for lego_id in range(9100, 9200):
            DirectoryEntry.objects.create(
                lego_user_id=lego_id,
                username=f"filler{lego_id}",
                full_name=f"Filler {lego_id}",
            )
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
            slots=["2026-04-21:540", "2026-04-21:600"],
        )

        lists = build_conflict_review_lists(saved)

        cohort = {
            decoy["name"] for entry in lists.values() for decoy in entry["decoys"]
        }
        # Two interviewers drawing five fillers each: if the draw were
        # unbounded they would share almost nothing out of a hundred names.
        self.assertLessEqual(len(cohort), 5)
        self.assertEqual(5, len(lists[str(self.mine.id)]["decoys"]))

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
