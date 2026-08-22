from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import (
    Group,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
)
from admissions.admissions.solve_schedule import solve_schedule
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


def interviewer(interviewer_id, availability, discouraged=None):
    return {
        "id": interviewer_id,
        "name": interviewer_id,
        "availability": list(availability),
        "discouraged": list(discouraged or []),
        "biased": [],
        "experience_level": "experienced",
    }


SOLVE_OPTIONS = {
    "policy_version": 2,
    "panel_stability": "flexible",
    "availability_fallback": "stop",
    "max_solver_seconds": 5,
}


class DiscouragedSolverPreferenceTestCase(SimpleTestCase):
    """A "helst ikke" slot is usable, but only when nothing better exists."""

    def _solve(self, interviewers, model_version):
        return solve_schedule(
            candidates_data=[{"id": "c1", "name": "Kandidat"}],
            interviewers_data=interviewers,
            panel_size=1,
            options_data=SOLVE_OPTIONS,
            all_slots_data=[0, 60],
            model_version=model_version,
        )

    def test_a_freely_available_interviewer_wins_over_a_reluctant_one(self):
        for model_version in ("v1", "v2"):
            with self.subTest(model_version=model_version):
                result = self._solve(
                    [
                        interviewer("reluctant", [0, 60], [0, 60]),
                        interviewer("free", [0, 60]),
                    ],
                    model_version,
                )

                self.assertEqual(result["status"], "SUCCESS")
                panel = [member["name"] for member in result["schedule"][0]["panel"]]
                self.assertEqual(panel, ["free"])

    def test_a_discouraged_slot_is_still_used_rather_than_dropping_a_candidate(self):
        # The whole point of the tier: it must never harden into "unavailable".
        for model_version in ("v1", "v2"):
            with self.subTest(model_version=model_version):
                result = self._solve(
                    [interviewer("reluctant", [0, 60], [0, 60])],
                    model_version,
                )

                self.assertEqual(result["status"], "SUCCESS")
                self.assertEqual(len(result["schedule"]), 1)

    def test_the_free_half_of_a_mixed_answer_is_preferred(self):
        for model_version in ("v1", "v2"):
            with self.subTest(model_version=model_version):
                result = self._solve(
                    [interviewer("mixed", [0, 60], [0])],
                    model_version,
                )

                self.assertEqual(result["status"], "SUCCESS")
                self.assertEqual(result["schedule"][0]["time"], 60)

    def test_a_discouraged_time_outside_availability_is_ignored(self):
        # Guards the intersection: it may only ever narrow, never widen.
        for model_version in ("v1", "v2"):
            with self.subTest(model_version=model_version):
                result = self._solve(
                    [interviewer("free", [60], [0])],
                    model_version,
                )

                self.assertEqual(result["status"], "SUCCESS")
                self.assertEqual(result["schedule"][0]["time"], 60)


@override_settings(ADMISSIONS_SCHEDULER_ENABLED=True)
class DiscouragedAvailabilityApiTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.interviewer = LegoUser.objects.create(username="interviewer", lego_id=4001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="member"
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            enabled_slots=["2026-04-21|540", "2026-04-21|600"],
        )
        self.client.force_authenticate(user=self.interviewer)
        self.url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": DEFAULT_ADMISSION_SLUG,
                "group_id": self.group.pk,
            },
        )

    def _saved(self):
        return InterviewAvailability.objects.get(
            admission=self.admission, group=self.group, user=self.interviewer
        )

    def test_discouraged_slots_are_stored_alongside_available_ones(self):
        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-21|600"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = self._saved()
        self.assertEqual(saved.slots, ["2026-04-21|540"])
        self.assertEqual(saved.discouraged_slots, ["2026-04-21|600"])

    def test_a_slot_claimed_by_both_lists_stays_freely_available(self):
        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-21|540", "2026-04-21|600"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = self._saved()
        self.assertEqual(saved.slots, ["2026-04-21|540"])
        self.assertEqual(saved.discouraged_slots, ["2026-04-21|600"])

    def test_a_discouraged_slot_outside_the_grid_is_rejected(self):
        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-29|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discouraged_slots", res.data)

    def test_discouraged_slots_without_slots_is_rejected(self):
        """A discouraged-only POST must not slip past the slot validation.

        Canonicalisation, the disjointness filter and the grid-membership
        check all hang off the submitted slots, while the persistence
        defaults pick discouraged_slots up unconditionally - so before this
        was rejected, a payload like this one stored raw unvalidated keys,
        broke the disjointness invariant against the slots already on the
        row, and echoed the junk back to every client on the next GET.
        """
        self.client.post(
            self.url,
            {"slots": ["2026-04-21|540"], "discouraged_slots": ["2026-04-21|600"]},
            format="json",
        )

        res = self.client.post(
            self.url,
            {
                "discouraged_slots": [
                    "total-garbage",
                    "2026-12-24|540",
                    "2026-04-21|540",
                ]
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discouraged_slots", res.data)
        # The earlier, validated answer is left exactly as it was.
        self.assertEqual(self._saved().slots, ["2026-04-21|540"])
        self.assertEqual(self._saved().discouraged_slots, ["2026-04-21|600"])

    def test_omitting_the_field_leaves_an_earlier_answer_untouched(self):
        self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-21|600"],
            },
            format="json",
        )

        res = self.client.post(self.url, {"slots": ["2026-04-21|540"]}, format="json")

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(self._saved().discouraged_slots, ["2026-04-21|600"])

    def test_opting_out_clears_both_answers(self):
        self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-21|600"],
            },
            format="json",
        )

        res = self.client.post(
            self.url, {"participation": "not_participating"}, format="json"
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        saved = self._saved()
        self.assertEqual(saved.slots, [])
        self.assertEqual(saved.discouraged_slots, [])
