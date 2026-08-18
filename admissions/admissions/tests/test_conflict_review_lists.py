from django.test import TestCase

from admissions.admissions.models import (
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
            admission=self.admission, user=self.mine, slots=my_slots
        )
        return SavedSchedule.objects.create(
            admission=self.admission,
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

    def test_the_scope_falls_back_when_no_snapshot_exists(self):
        """Plans saved before review lists existed must still be reviewable."""
        ours = self._candidate("ada", 8001)
        saved = self._plan(
            [self._row(ours, 540, self.mine)], my_slots=["2026-04-21:540"]
        )

        self.assertEqual(
            {str(ours.pk)}, conflict_review_scope(saved, str(self.mine.id))
        )
