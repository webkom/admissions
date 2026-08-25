from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING, RETIREE
from admissions.admissions.models import (
    CommitteeRosterEntry,
    Group,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
)
from admissions.admissions.scheduling_utils import (
    get_eligible_interviewer_ids,
    get_responding_interviewer_ids,
)
from admissions.admissions.tests.utils import create_admission
from admissions.utils.management.commands.run_solver_worker import (
    Command as RunSolverWorker,
)

COMMAND = "sync_committee_rosters"
REQUESTS = "admissions.utils.lego_service.requests"

CREDENTIALLED = override_settings(
    ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
    ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
    SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
)


def _membership(lego_user_id, username, full_name, role=MEMBER, is_active=True):
    return {
        "role": role,
        "is_active": is_active,
        "user": {
            "id": lego_user_id,
            "username": username,
            "fullName": full_name,
            "firstName": full_name.split(" ")[0],
            "lastName": full_name.split(" ")[-1],
            "internalEmailAddress": f"{username}@abakus.no",
        },
    }


def _lego(mock_requests, memberships_by_group_id):
    mock_requests.post.return_value = MagicMock(
        status_code=200, json=lambda: {"access_token": "a-token"}
    )
    mock_requests.RequestException = Exception

    def fake_get(url, **kwargs):
        group_id = int(url.rstrip("/").split("/")[-2])
        return MagicMock(
            status_code=200,
            json=lambda: {
                "next": None,
                "results": memberships_by_group_id.get(group_id, []),
            },
        )

    mock_requests.get.side_effect = fake_get


class SyncCommitteeRostersTestCase(TestCase):
    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=15)
        self.admission.groups.add(self.group)

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="",
    )
    @patch(REQUESTS)
    def test_no_op_without_a_credential(self, mock_requests):
        call_command(COMMAND)

        mock_requests.post.assert_not_called()
        self.assertEqual(0, CommitteeRosterEntry.objects.count())

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_a_member_who_has_never_signed_in_gets_a_roster_row(self, mock_requests):
        _lego(mock_requests, {15: [_membership(9001, "kari", "Kari Nordmann")]})

        call_command(COMMAND)

        entry = CommitteeRosterEntry.objects.get(group=self.group)
        self.assertEqual("kari", entry.user.username)
        self.assertEqual("Kari Nordmann", entry.user.get_full_name())
        self.assertEqual(MEMBER, entry.role)

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_a_synced_person_gets_no_membership_and_so_no_access(self, mock_requests):
        """The whole point of the separate table: LEGO can tell admissions who
        exists without that becoming a grant of authority. Membership stays the
        snapshot of the person's own login."""

        _lego(mock_requests, {15: [_membership(9001, "kari", "Kari Nordmann")]})

        call_command(COMMAND)

        self.assertEqual(0, Membership.objects.count())
        user = LegoUser.objects.get(lego_id=9001)
        self.assertFalse(user.has_usable_password())

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_an_existing_user_is_matched_on_lego_id_not_duplicated(self, mock_requests):
        existing = LegoUser.objects.create(
            username="kari", lego_id=9001, email="kari@example.com"
        )
        _lego(mock_requests, {15: [_membership(9001, "kari-renamed", "Kari Nordmann")]})

        call_command(COMMAND)

        self.assertEqual(1, LegoUser.objects.filter(lego_id=9001).count())
        self.assertEqual(existing.pk, CommitteeRosterEntry.objects.get().user_id)
        existing.refresh_from_db()
        # Their own login payload is fresher and carries a real email address;
        # the public serializer this sync reads carries neither.
        self.assertEqual("kari@example.com", existing.email)

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_retirees_and_dormant_memberships_are_left_out(self, mock_requests):
        _lego(
            mock_requests,
            {
                15: [
                    _membership(9001, "kari", "Kari Nordmann"),
                    _membership(9002, "pensjonist", "Gammel Abakule", role=RETIREE),
                    _membership(9003, "sovende", "Dorm Ant", is_active=False),
                ]
            },
        )

        call_command(COMMAND)

        self.assertEqual(
            [9001],
            sorted(
                CommitteeRosterEntry.objects.values_list("user__lego_id", flat=True)
            ),
        )

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_someone_who_left_the_committee_loses_their_roster_row(self, mock_requests):
        _lego(
            mock_requests,
            {
                15: [
                    _membership(9001, "kari", "Kari Nordmann"),
                    _membership(9002, "ola", "Ola Nordmann"),
                ]
            },
        )
        call_command(COMMAND)
        self.assertEqual(2, CommitteeRosterEntry.objects.count())

        _lego(mock_requests, {15: [_membership(9001, "kari", "Kari Nordmann")]})
        call_command(COMMAND)

        self.assertEqual(
            [9001],
            sorted(
                CommitteeRosterEntry.objects.values_list("user__lego_id", flat=True)
            ),
        )

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_an_empty_answer_never_wipes_the_roster(self, mock_requests):
        _lego(mock_requests, {15: [_membership(9001, "kari", "Kari Nordmann")]})
        call_command(COMMAND)

        _lego(mock_requests, {15: []})
        call_command(COMMAND)

        self.assertEqual(1, CommitteeRosterEntry.objects.count())

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_one_unreachable_committee_does_not_cost_the_others_their_sync(
        self, mock_requests
    ):
        other = Group.objects.create(name="Bedkom", lego_id=16)
        self.admission.groups.add(other)
        mock_requests.post.return_value = MagicMock(
            status_code=200, json=lambda: {"access_token": "a-token"}
        )
        mock_requests.RequestException = Exception

        def fake_get(url, **kwargs):
            if "/groups/15/" in url:
                return MagicMock(status_code=503, json=lambda: {})
            return MagicMock(
                status_code=200,
                json=lambda: {
                    "next": None,
                    "results": [_membership(9002, "ola", "Ola Nordmann")],
                },
            )

        mock_requests.get.side_effect = fake_get

        call_command(COMMAND)

        self.assertEqual(
            [other.pk],
            list(CommitteeRosterEntry.objects.values_list("group_id", flat=True)),
        )


class RosterWideningTestCase(TestCase):
    """What the wider roster does and does not change."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=15)
        self.admission.groups.add(self.group)
        self.signed_in = LegoUser.objects.create(username="mine", lego_id=6001)
        Membership.objects.create(user=self.signed_in, group=self.group, role=MEMBER)
        self.never_signed_in = LegoUser.objects.create(username="kari", lego_id=9001)
        CommitteeRosterEntry.objects.create(
            group=self.group, user=self.never_signed_in, role=MEMBER
        )

    def test_the_roster_covers_both_sources(self):
        self.assertEqual(
            {self.signed_in.pk, self.never_signed_in.pk},
            get_eligible_interviewer_ids(self.admission, self.group),
        )

    def test_only_people_who_can_answer_are_expected_to(self):
        self.assertEqual(
            {self.signed_in.pk},
            get_responding_interviewer_ids(self.admission, self.group),
        )


class RosterInAvailabilityResponseTestCase(APITestCase):
    """The reason any of this exists: an admin has to be able to see who has
    not answered, and the people who never signed in are exactly the ones who
    have not."""

    def setUp(self):
        self.admission = create_admission()
        self.group = Group.objects.create(name="Webkom", lego_id=15)
        self.admission.groups.add(self.group)
        self.recruiter = LegoUser.objects.create(username="rekrutt", lego_id=6001)
        Membership.objects.create(
            user=self.recruiter, group=self.group, role=RECRUITING
        )
        self.absent = LegoUser.objects.create(
            username="kari", lego_id=9001, first_name="Kari", last_name="Nordmann"
        )
        CommitteeRosterEntry.objects.create(
            group=self.group, user=self.absent, role=MEMBER
        )
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.group,
            schedule=[],
            start_date="2026-04-21",
            session_duration=60,
        )
        self.client.force_authenticate(user=self.recruiter)
        self.url = reverse(
            "interview-availability",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.group.pk,
            },
        )

    def test_a_member_who_never_signed_in_is_listed_as_awaiting(self):
        res = self.client.get(self.url)

        row = next(item for item in res.data if item["user_id"] == str(self.absent.pk))
        self.assertEqual("Kari Nordmann", row["full_name"])
        self.assertFalse(row["has_submitted"])
        self.assertEqual(
            InterviewAvailability.PARTICIPATION_AWAITING, row["participation"]
        )

    def test_an_admin_can_record_that_they_are_not_participating(self):
        """Otherwise the roster grows a permanent list of people nobody can
        clear, and "who still owes an answer" stops meaning anything."""

        res = self.client.post(
            self.url,
            {
                "user_id": str(self.absent.pk),
                "participation": InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            },
            format="json",
        )

        self.assertEqual(200, res.status_code, res.data)
        self.assertEqual(
            InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING,
            InterviewAvailability.objects.get(user=self.absent).participation,
        )

    def test_a_leader_of_another_committee_is_still_refused(self):
        outsider = LegoUser.objects.create(username="utenfor", lego_id=7001)
        other = Group.objects.create(name="Bedkom", lego_id=16)
        self.admission.groups.add(other)
        Membership.objects.create(user=outsider, group=other, role=LEADER)
        self.client.force_authenticate(user=outsider)

        self.assertEqual(403, self.client.get(self.url).status_code)


class WorkerLegoSyncTestCase(TestCase):
    """The syncs ride the solver worker rather than a cron entry.

    The worker is already mandatory wherever the scheduler is switched on; a
    cron schedule is one more thing that can quietly not exist, and a decoy
    pool that is quietly empty means review lists made only of real applicants.
    """

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="",
    )
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_directory_entries"
    )
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_committee_rosters"
    )
    def test_a_worker_cycle_refreshes_both_tables(self, rosters, directory):
        call_command("run_solver_worker", once=True)

        rosters.assert_called_once_with()
        directory.assert_called_once_with()

    @override_settings(ADMISSIONS_LEGO_SYNC_INTERVAL_SECONDS=3600)
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_directory_entries"
    )
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_committee_rosters"
    )
    def test_the_sync_is_throttled_between_polls(self, rosters, directory):
        command = RunSolverWorker()
        command._last_lego_sync = None

        self.assertTrue(command._sync_from_lego())
        self.assertFalse(command._sync_from_lego())
        rosters.assert_called_once_with()

    @override_settings(ADMISSIONS_LEGO_SYNC_INTERVAL_SECONDS=3600)
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_directory_entries"
    )
    @patch(
        "admissions.utils.management.commands.run_solver_worker.sync_committee_rosters",
        side_effect=RuntimeError("LEGO exploded"),
    )
    def test_a_failed_sync_never_takes_the_worker_down(self, rosters, directory):
        """Solving schedules is the worker's actual job; a roster refresh that
        blows up must not cost it that."""

        command = RunSolverWorker()
        command._last_lego_sync = None

        self.assertTrue(command._sync_from_lego())
        # And it waits out the same interval as a success, so an unreachable
        # LEGO does not turn every poll into a fresh connection attempt.
        self.assertFalse(command._sync_from_lego())
