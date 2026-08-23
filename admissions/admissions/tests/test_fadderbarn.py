from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import RECRUITING
from admissions.admissions.lego_directory import (
    DirectoryAuthenticationRequired,
    DirectoryUnavailable,
)
from admissions.admissions.models import (
    FadderbarnDeclaration,
    Group,
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.scheduling_utils import get_declared_conflict_candidate_ids
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class FadderbarnDeclarationTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.interviewer = LegoUser.objects.create(username="interviewer", lego_id=4001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="member"
        )
        self.client.force_authenticate(user=self.interviewer)
        self.url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": DEFAULT_ADMISSION_SLUG,
                "group_id": self.group.pk,
            },
        )

    def _applicant(self, username, lego_id):
        user = LegoUser.objects.create(username=username, lego_id=lego_id)
        application = UserApplication.objects.create(
            user=user, admission=self.admission
        )
        GroupApplication.objects.create(
            application=application, group=self.group, text="søknad"
        )
        return user, application

    def test_declaring_fadderbarn_stores_them(self):
        res = self.client.post(
            self.url,
            {
                "fadderbarn": [
                    {
                        "lego_user_id": 5001,
                        "username": "kari",
                        "full_name": "Kari Nordmann",
                    },
                    {
                        "lego_user_id": 5002,
                        "username": "ola",
                        "full_name": "Ola Nordmann",
                    },
                ]
            },
            format="json",
        )

        self.assertEqual(status.HTTP_200_OK, res.status_code)
        self.assertEqual(
            2,
            FadderbarnDeclaration.objects.filter(
                admission=self.admission, interviewer=self.interviewer
            ).count(),
        )

    def test_declaring_replaces_the_previous_list(self):
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5001}]}, format="json"
        )
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5002}]}, format="json"
        )

        stored = FadderbarnDeclaration.objects.filter(
            interviewer=self.interviewer
        ).values_list("lego_user_id", flat=True)
        self.assertEqual([5002], list(stored))

    def test_declaring_none_still_counts_as_answered(self):
        """Otherwise "no fadderbarn" is indistinguishable from "not asked yet"."""
        res = self.client.post(self.url, {"fadderbarn": []}, format="json")

        self.assertEqual(status.HTTP_200_OK, res.status_code)
        self.assertIsNotNone(
            self.interviewer.interview_availabilities.get(
                admission=self.admission
            ).fadderbarn_confirmed_at
        )

    def test_the_declaring_interviewer_is_never_told_who_applied(self):
        """The privacy property the whole design rests on.

        One declared fadderbarn has applied and one has not. Nothing in the
        interviewer's own response may distinguish them, or the declaration
        becomes a way to probe the applicant list.
        """
        applicant, application = self._applicant("kari", 5001)
        self.client.post(
            self.url,
            {
                "fadderbarn": [
                    {"lego_user_id": 5001, "full_name": "Kari Nordmann"},
                    {"lego_user_id": 5002, "full_name": "Ola Nordmann"},
                ]
            },
            format="json",
        )

        res = self.client.get(self.url)

        body = str(res.data)
        self.assertNotIn(str(application.pk), body)
        self.assertNotIn(applicant.username, body)

    def test_declarations_come_back_for_editing(self):
        self.client.post(
            self.url,
            {"fadderbarn": [{"lego_user_id": 5001, "full_name": "Kari Nordmann"}]},
            format="json",
        )

        res = self.client.get(self.url)

        me = next(row for row in res.data if row["is_me"])
        self.assertEqual(
            [{"lego_user_id": 5001, "username": "", "full_name": "Kari Nordmann"}],
            me["fadderbarn"],
        )

    def test_nobody_sees_another_interviewers_declarations(self):
        """A declaration names people who may never have applied."""
        other = LegoUser.objects.create(username="other", lego_id=4002)
        Membership.objects.create(user=other, group=self.group, role="member")
        self.client.post(
            self.url,
            {"fadderbarn": [{"lego_user_id": 5001, "full_name": "Kari Nordmann"}]},
            format="json",
        )

        self.client.force_authenticate(user=other)
        res = self.client.get(self.url)

        self.assertNotIn("Kari Nordmann", str(res.data))
        for row in res.data:
            if not row["is_me"]:
                self.assertEqual([], row.get("fadderbarn", []))

    def test_a_declaration_becomes_a_solver_conflict(self):
        _, application = self._applicant("kari", 5001)
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5001}]}, format="json"
        )

        derived = get_declared_conflict_candidate_ids(self.admission, self.group)

        # String, not the interviewer's raw UUID: every caller looks this up
        # by the string id it already has, so a UUID-keyed dict here would
        # make every consumer's union silently a no-op.
        self.assertEqual({str(application.pk)}, derived[str(self.interviewer.id)])

    @override_settings(ADMISSIONS_CONFLICT_REVIEW_V2=False)
    def test_the_kill_switch_disables_derived_conflicts(self):
        self._applicant("kari", 5001)
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5001}]}, format="json"
        )

        self.assertEqual(
            {}, get_declared_conflict_candidate_ids(self.admission, self.group)
        )

    def test_a_fadderbarn_who_did_not_apply_yields_nothing(self):
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 9999}]}, format="json"
        )

        self.assertEqual(
            {}, get_declared_conflict_candidate_ids(self.admission, self.group)
        )

    def test_derived_conflicts_are_visible_to_admins(self):
        _, application = self._applicant("kari", 5001)
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5001}]}, format="json"
        )
        admin_group = Group.objects.create(name="Webkom-admin", lego_id=14)
        self.admission.admin_groups.add(admin_group)
        admin = LegoUser.objects.create(username="admin", lego_id=4002)
        Membership.objects.create(user=admin, group=admin_group, role=RECRUITING)
        self.client.force_authenticate(user=admin)

        res = self.client.get(self.url)

        row = next(
            row for row in res.data if row["user_id"] == str(self.interviewer.id)
        )
        self.assertEqual([str(application.pk)], row["derived_conflicts"])

    def test_derived_conflicts_are_never_shown_to_non_admins(self):
        """Even to the declaring interviewer themselves - see the privacy test above."""
        self._applicant("kari", 5001)
        self.client.post(
            self.url, {"fadderbarn": [{"lego_user_id": 5001}]}, format="json"
        )

        res = self.client.get(self.url)

        for row in res.data:
            self.assertEqual([], row["derived_conflicts"])


class MemberSearchTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.group)
        self.interviewer = LegoUser.objects.create(username="interviewer", lego_id=4001)
        Membership.objects.create(
            user=self.interviewer, group=self.group, role="member"
        )
        self.outsider = LegoUser.objects.create(username="outsider", lego_id=4002)
        self.url = reverse(
            "member-search", kwargs={"admission_slug": DEFAULT_ADMISSION_SLUG}
        )

    def test_outsiders_cannot_search(self):
        self.client.force_authenticate(user=self.outsider)

        res = self.client.get(self.url, {"q": "kari"})

        self.assertEqual(status.HTTP_403_FORBIDDEN, res.status_code)

    def test_short_queries_are_quiet(self):
        """The field is debounced; a 400 mid-keystroke is noise."""
        self.client.force_authenticate(user=self.interviewer)

        res = self.client.get(self.url, {"q": "k"})

        self.assertEqual(status.HTTP_200_OK, res.status_code)
        self.assertEqual([], res.data)

    def test_results_are_passed_through(self):
        self.client.force_authenticate(user=self.interviewer)
        hits = [
            {
                "lego_user_id": 5001,
                "username": "kari",
                "full_name": "Kari Nordmann",
                "profile_picture": "",
            }
        ]

        with patch(
            "admissions.admissions.directory_views.search_members", return_value=hits
        ):
            res = self.client.get(self.url, {"q": "kari"})

        self.assertEqual(status.HTTP_200_OK, res.status_code)
        self.assertEqual(hits, res.data)

    def test_expired_lego_token_is_reported_not_silently_empty(self):
        """An empty list would read as "not in Abakus" and they would give up."""
        self.client.force_authenticate(user=self.interviewer)

        with patch(
            "admissions.admissions.directory_views.search_members",
            side_effect=DirectoryAuthenticationRequired,
        ):
            res = self.client.get(self.url, {"q": "kari"})

        self.assertEqual(status.HTTP_409_CONFLICT, res.status_code)
        self.assertEqual("lego_reauth_required", res.data["code"])

    def test_lego_being_down_does_not_look_like_no_results(self):
        self.client.force_authenticate(user=self.interviewer)

        with patch(
            "admissions.admissions.directory_views.search_members",
            side_effect=DirectoryUnavailable("boom"),
        ):
            res = self.client.get(self.url, {"q": "kari"})

        self.assertEqual(status.HTTP_503_SERVICE_UNAVAILABLE, res.status_code)
