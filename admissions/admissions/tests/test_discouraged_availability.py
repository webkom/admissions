from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.models import (
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
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
class OnBehalfAvailabilityApiTestCase(APITestCase):
    """An interview admin can record availability on a member's behalf.

    The admin heatmap's on-behalf editor posts the target's user_id together
    with slots; this must land on the target's row, never the admin's, and
    plain members must not be able to write someone else's answer.
    """

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.recruiter = LegoUser.objects.create(username="recruiter", lego_id=4001)
        Membership.objects.create(
            user=self.recruiter, group=self.group, role="recruiting"
        )
        self.member = LegoUser.objects.create(username="member", lego_id=4002)
        Membership.objects.create(user=self.member, group=self.group, role="member")
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
            enabled_slots=["2026-04-21|540", "2026-04-21|600"],
        )
        self.url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": DEFAULT_ADMISSION_SLUG,
                "group_id": self.group.pk,
            },
        )

    def test_recruiter_can_save_availability_on_behalf_of_a_member(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "slots": ["2026-04-21|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # The answer lands on the member's row, not the recruiter's.
        member_row = InterviewAvailability.objects.get(
            admission=self.admission, group=self.group, user=self.member
        )
        self.assertEqual(member_row.slots, ["2026-04-21|540"])
        self.assertEqual(
            member_row.submitted_grid_generation,
            SavedSchedule.objects.get(
                admission=self.admission, group=self.group
            ).availability_generation,
        )
        self.assertFalse(
            InterviewAvailability.objects.filter(
                admission=self.admission, group=self.group, user=self.recruiter
            ).exists()
        )

    def test_get_drops_saved_slots_outside_current_plan_grid(self):
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.member,
            slots=["2026-04-21|780"],
            discouraged_slots=["2026-04-21|600"],
        )
        self.client.force_authenticate(user=self.member)

        res = self.client.get(self.url)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data[0]["slots"], [])
        self.assertEqual(res.data[0]["discouraged_slots"], ["2026-04-21|600"])

    def test_recruiter_can_save_conflicts_on_behalf_of_a_member(self):
        """The on-behalf inhabilitet editor: an interview admin replaces a
        member's declared conflicts (candidate ids only - the admin's scope
        is the whole candidate pool) without touching their slots or their
        reviewed candidates.
        """
        self.client.force_authenticate(user=self.recruiter)
        applicant = LegoUser.objects.create(username="conflict-candidate", lego_id=4005)
        application = UserApplication.objects.create(
            user=applicant, admission=self.admission
        )
        GroupApplication.objects.create(
            application=application, group=self.group, text="søknad"
        )
        InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.group,
            user=self.member,
            slots=["2026-04-21|540"],
            reviewed_candidate_ids=["existing-review"],
        )

        res = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "conflicts": [str(application.pk)],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        member_row = InterviewAvailability.objects.get(
            admission=self.admission, group=self.group, user=self.member
        )
        self.assertEqual(member_row.conflicts, [str(application.pk)])
        # A conflicts-only on-behalf save leaves the rest of the row alone.
        self.assertEqual(member_row.slots, ["2026-04-21|540"])
        self.assertEqual(member_row.reviewed_candidate_ids, ["existing-review"])

    def test_plain_member_cannot_save_on_behalf_of_someone_else(self):
        self.client.force_authenticate(user=self.member)

        res = self.client.post(
            self.url,
            {
                "user_id": str(self.recruiter.pk),
                "slots": ["2026-04-21|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_on_behalf_save_echoes_the_target_row(self):
        self.client.force_authenticate(user=self.recruiter)

        res = self.client.post(
            self.url,
            {
                "user_id": str(self.member.pk),
                "slots": ["2026-04-21|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["user_id"], self.member.pk)
        self.assertEqual(res.data["slots"], ["2026-04-21|540"])
        self.assertTrue(res.data["has_submitted"])


@override_settings(ADMISSIONS_SCHEDULER_ENABLED=True)
class DiscouragedAvailabilityApiTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        # An interview admin (recruiter) records answers on the committee's
        # behalf - plain members have no write access to the schedule.
        self.interviewer = LegoUser.objects.create(username="interviewer", lego_id=4001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="recruiting"
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
        """A "helst ikke" slot the plan no longer contains is a stale-grid
        signal like any other: answer with the reload conflict, never a
        per-slot 400 that leaves the user staring at a slot their grid no
        longer shows.
        """
        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|540"],
                "discouraged_slots": ["2026-04-29|540"],
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("discouraged_slots", res.data)
        self.assertIn("Last inn siden på nytt", str(res.data))

    def test_current_generation_with_a_stale_slot_is_still_a_reload_conflict(self):
        """The user-visible failure: schedule and availability caches briefly
        disagree, so a save carries the current generation together with a
        slot the plan no longer contains (the grid was built from a stale
        schedule). This must answer "reload", not the confusing per-slot 400.
        """
        saved = SavedSchedule.objects.get(admission=self.admission, group=self.group)
        saved.availability_generation = 2
        saved.enabled_slots = ["2026-04-21|540"]
        saved.save()

        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|780"],
                "expected_availability_generation": 2,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("slots", res.data)
        self.assertIn("Last inn siden på nytt", str(res.data))

    def test_stale_generation_is_reported_before_any_slot_error(self):
        """A grid built against an older framework must be answered with the
        clear "reload" conflict, not a confusing slot error: the framework
        changed after the grid was drawn, so however valid the submitted
        slots looked on screen they are evaluated against a different plan.
        """
        saved = SavedSchedule.objects.get(admission=self.admission, group=self.group)
        saved.availability_generation = 2
        saved.enabled_slots = ["2026-04-21|540"]
        saved.save()

        res = self.client.post(
            self.url,
            {
                "slots": ["2026-04-21|780"],
                "expected_availability_generation": 1,
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("expected_availability_generation", res.data)
        self.assertIn("Last inn siden på nytt", str(res.data))

    def test_stale_generation_without_generation_field_is_rejected(self):
        """When the framework has moved past generation 1, a save without the
        expected generation is a programming error, not a quiet acceptance.
        """
        saved = SavedSchedule.objects.get(admission=self.admission, group=self.group)
        saved.availability_generation = 2
        saved.save()

        res = self.client.post(
            self.url,
            {"slots": ["2026-04-21|540"]},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_availability_generation", res.data)

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
