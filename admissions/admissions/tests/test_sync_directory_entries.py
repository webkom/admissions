from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import TestCase, override_settings

from admissions.admissions.models import DirectoryEntry

COMMAND = "sync_directory_entries"

# The HTTP layer now lives in the module both syncs share, so that is where
# `requests` has to be patched.
REQUESTS = "admissions.utils.lego_service.requests"

CREDENTIALLED = override_settings(
    ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
    ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
    SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
    ADMISSIONS_DECOY_POOL_GROUPS=["1. klasse Datateknologi"],
)


def _member(lego_user_id, username, full_name):
    return {"user": {"id": lego_user_id, "username": username, "fullName": full_name}}


def _fake_lego(groups, members_by_group_id):
    """Answer with LEGO's real wire shapes.

    /api/v1/groups/ is unpaginated and returns a bare JSON array; membership
    pages are wrapped in {"results": [...], "next": ...}; and LEGO's renderer
    camelCases user fields to fullName. Mocking snake_case dict envelopes for
    both is exactly how three sync bugs once stayed green in CI.
    """

    def fake_get(url, **kwargs):
        if url.endswith("/api/v1/groups/"):
            return MagicMock(status_code=200, json=lambda: groups)
        group_id = int(url.rstrip("/").split("/")[-2])
        return MagicMock(
            status_code=200,
            json=lambda: {
                "next": None,
                "results": members_by_group_id.get(group_id, []),
            },
        )

    return fake_get


def _authorised(mock_requests):
    mock_requests.post.return_value = MagicMock(
        status_code=200, json=lambda: {"access_token": "a-token"}
    )
    mock_requests.RequestException = Exception


class SyncDirectoryEntriesTestCase(TestCase):
    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="",
    )
    @patch(REQUESTS)
    def test_no_op_without_a_credential(self, mock_requests):
        call_command(COMMAND)

        mock_requests.post.assert_not_called()
        mock_requests.get.assert_not_called()
        self.assertEqual(0, DirectoryEntry.objects.count())

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="",
        SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
    )
    @patch(REQUESTS)
    def test_no_op_with_api_url_but_no_credential(self, mock_requests):
        call_command(COMMAND)

        mock_requests.post.assert_not_called()

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_a_successful_sync_upserts_entries(self, mock_requests):
        _authorised(mock_requests)
        mock_requests.get.side_effect = _fake_lego(
            [{"id": 1, "name": "1. klasse Datateknologi"}],
            {1: [_member(9001, "kari", "Kari Nordmann")]},
        )

        call_command(COMMAND)

        entry = DirectoryEntry.objects.get(lego_user_id=9001)
        self.assertEqual(entry.username, "kari")
        self.assertEqual(entry.full_name, "Kari Nordmann")

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_students_who_left_the_roster_are_removed(self, mock_requests):
        DirectoryEntry.objects.create(
            lego_user_id=8000, username="stale", full_name="No Longer A Student"
        )
        _authorised(mock_requests)
        mock_requests.get.side_effect = _fake_lego(
            [{"id": 1, "name": "1. klasse Datateknologi"}],
            {1: [_member(9001, "kari", "Kari Nordmann")]},
        )

        call_command(COMMAND)

        self.assertFalse(DirectoryEntry.objects.filter(lego_user_id=8000).exists())
        self.assertTrue(DirectoryEntry.objects.filter(lego_user_id=9001).exists())

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_a_zero_member_sync_never_wipes_the_roster(self, mock_requests):
        DirectoryEntry.objects.create(
            lego_user_id=8000, username="kept", full_name="Kept Entry"
        )
        _authorised(mock_requests)
        mock_requests.get.return_value = MagicMock(status_code=200, json=lambda: [])

        call_command(COMMAND)

        self.assertTrue(DirectoryEntry.objects.filter(lego_user_id=8000).exists())

    @CREDENTIALLED
    @patch(REQUESTS)
    def test_a_lego_error_fails_cleanly_without_touching_existing_data(
        self, mock_requests
    ):
        DirectoryEntry.objects.create(
            lego_user_id=8000, username="existing", full_name="Existing Entry"
        )
        mock_requests.post.return_value = MagicMock(status_code=401, json=lambda: {})
        mock_requests.RequestException = Exception

        call_command(COMMAND)

        self.assertEqual(1, DirectoryEntry.objects.count())
        self.assertTrue(DirectoryEntry.objects.filter(lego_user_id=8000).exists())

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
        SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
        ADMISSIONS_DECOY_POOL_GROUPS=[
            "1. klasse Datateknologi",
            "3. klasse Datateknologi",
        ],
    )
    @patch(REQUESTS)
    def test_the_pool_spans_every_configured_year(self, mock_requests):
        """A pool narrower than the applicant population is not cover.

        While it was first-years only, an older student's name in a review list
        could not have been a filler - so it identified a real applicant.
        """

        _authorised(mock_requests)
        mock_requests.get.side_effect = _fake_lego(
            [
                {"id": 1, "name": "1. klasse Datateknologi"},
                {"id": 3, "name": "3. klasse Datateknologi"},
                {"id": 9, "name": "Webkom"},
            ],
            {
                1: [_member(9001, "kari", "Kari Nordmann")],
                3: [_member(9003, "ola", "Ola Nordmann")],
                9: [_member(9009, "webkommer", "Web Kommer")],
            },
        )

        call_command(COMMAND)

        self.assertEqual(
            {9001, 9003},
            set(DirectoryEntry.objects.values_list("lego_user_id", flat=True)),
        )
