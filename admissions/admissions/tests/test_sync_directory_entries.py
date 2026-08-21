from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import TestCase, override_settings

from admissions.admissions.models import DirectoryEntry

COMMAND = "sync_directory_entries"


class SyncDirectoryEntriesTestCase(TestCase):
    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="",
    )
    @patch("admissions.utils.management.commands.sync_directory_entries.requests")
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
    @patch("admissions.utils.management.commands.sync_directory_entries.requests")
    def test_no_op_with_api_url_but_no_credential(self, mock_requests):
        call_command(COMMAND)

        mock_requests.post.assert_not_called()

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
        SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
    )
    @patch("admissions.utils.management.commands.sync_directory_entries.requests")
    def test_a_successful_sync_upserts_entries(self, mock_requests):
        mock_requests.post.return_value = MagicMock(
            status_code=200, json=lambda: {"access_token": "a-token"}
        )

        def fake_get(url, **kwargs):
            if url.endswith("/api/v1/groups/"):
                name = kwargs["params"]["name"]
                return MagicMock(
                    status_code=200,
                    json=lambda: {"results": [{"id": 1, "name": name}]},
                )
            return MagicMock(
                status_code=200,
                json=lambda: {
                    "next": None,
                    "results": [
                        {
                            "user": {
                                "id": 9001,
                                "username": "kari",
                                "full_name": "Kari Nordmann",
                            }
                        }
                    ],
                },
            )

        mock_requests.get.side_effect = fake_get
        mock_requests.RequestException = Exception

        call_command(COMMAND)

        entry = DirectoryEntry.objects.get(lego_user_id=9001)
        self.assertEqual(entry.username, "kari")
        self.assertEqual(entry.full_name, "Kari Nordmann")

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
        SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
    )
    @patch("admissions.utils.management.commands.sync_directory_entries.requests")
    def test_students_who_left_the_roster_are_removed(self, mock_requests):
        DirectoryEntry.objects.create(
            lego_user_id=8000, username="stale", full_name="No Longer First Year"
        )
        mock_requests.post.return_value = MagicMock(
            status_code=200, json=lambda: {"access_token": "a-token"}
        )

        def fake_get(url, **kwargs):
            if url.endswith("/api/v1/groups/"):
                name = kwargs["params"]["name"]
                return MagicMock(
                    status_code=200,
                    json=lambda: {"results": [{"id": 1, "name": name}]},
                )
            return MagicMock(
                status_code=200,
                json=lambda: {
                    "next": None,
                    "results": [
                        {
                            "user": {
                                "id": 9001,
                                "username": "kari",
                                "full_name": "Kari Nordmann",
                            }
                        }
                    ],
                },
            )

        mock_requests.get.side_effect = fake_get
        mock_requests.RequestException = Exception

        call_command(COMMAND)

        self.assertFalse(DirectoryEntry.objects.filter(lego_user_id=8000).exists())
        self.assertTrue(DirectoryEntry.objects.filter(lego_user_id=9001).exists())

    @override_settings(
        ADMISSIONS_ROSTER_SYNC_CLIENT_ID="a-client-id",
        ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET="a-secret",
        SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com",
    )
    @patch("admissions.utils.management.commands.sync_directory_entries.requests")
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
