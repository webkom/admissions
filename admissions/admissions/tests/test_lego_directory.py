from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from admissions.admissions.lego_directory import (
    DirectoryAuthenticationRequired,
    _access_token,
    search_members,
)
from admissions.admissions.models import LegoUser


@override_settings(SOCIAL_AUTH_LEGO_API_URL="https://lego.example.com")
class LegoDirectoryTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = LegoUser.objects.create(username="searcher", lego_id=5001)

    def _social(self, access_token="a-token", side_effect=None):
        social = MagicMock()
        if side_effect is not None:
            social.get_access_token.side_effect = side_effect
        else:
            social.get_access_token.return_value = access_token
        return social

    def _hit(self, lego_user_id=42, username="ada", full_name="Ada Lovelace"):
        # LEGO's DRF renderer camelCases every response key - this must match
        # the wire format, not the Python-side field names.
        return {
            "contentType": "users.user",
            "id": lego_user_id,
            "username": username,
            "fullName": full_name,
            "profilePicture": "",
        }

    @patch("admissions.admissions.lego_directory.UserSocialAuth")
    @patch("admissions.admissions.lego_directory.requests.post")
    def test_parses_lego_s_camel_cased_response(self, mock_post, mock_social_auth):
        mock_social_auth.objects.filter.return_value.first.return_value = self._social()
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = [
            self._hit(lego_user_id=42, username="ada", full_name="Ada Lovelace")
        ]

        results = search_members(self.user, "Ada")

        self.assertEqual(
            results,
            [
                {
                    "lego_user_id": 42,
                    "username": "ada",
                    "full_name": "Ada Lovelace",
                    "profile_picture": "",
                }
            ],
        )

    @patch("admissions.admissions.lego_directory.UserSocialAuth")
    @patch("admissions.admissions.lego_directory.requests.post")
    def test_repeated_query_hits_lego_once(self, mock_post, mock_social_auth):
        mock_social_auth.objects.filter.return_value.first.return_value = self._social()
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = [self._hit()]

        first = search_members(self.user, "Ada")
        second = search_members(self.user, "Ada")

        self.assertEqual(first, second)
        self.assertEqual(mock_post.call_count, 1)

    @patch("admissions.admissions.lego_directory.UserSocialAuth")
    @patch("admissions.admissions.lego_directory.requests.post")
    def test_cache_key_normalizes_whitespace_and_case(
        self, mock_post, mock_social_auth
    ):
        mock_social_auth.objects.filter.return_value.first.return_value = self._social()
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = [self._hit()]

        search_members(self.user, "Ada")
        search_members(self.user, "  ada  ")

        self.assertEqual(mock_post.call_count, 1)

    @patch("admissions.admissions.lego_directory.UserSocialAuth")
    def test_auth_failure_is_never_cached(self, mock_social_auth):
        mock_social_auth.objects.filter.return_value.first.return_value = None

        with self.assertRaises(DirectoryAuthenticationRequired):
            search_members(self.user, "Ada")
        with self.assertRaises(DirectoryAuthenticationRequired):
            search_members(self.user, "Ada")

        # Two failures, not a cached failure silently becoming an empty list.
        self.assertEqual(
            mock_social_auth.objects.filter.return_value.first.call_count, 2
        )

    def test_access_token_refreshes_through_social_auth(self):
        social = self._social(access_token="fresh-token")
        with patch(
            "admissions.admissions.lego_directory.UserSocialAuth"
        ) as mock_social_auth:
            mock_social_auth.objects.filter.return_value.first.return_value = social
            token = _access_token(self.user, strategy="a-strategy")

        self.assertEqual(token, "fresh-token")
        social.get_access_token.assert_called_once_with("a-strategy")

    def test_access_token_reports_reauth_when_social_refresh_fails(self):
        from social_core.exceptions import AuthTokenError

        social = self._social(side_effect=AuthTokenError("backend", "expired"))
        with patch(
            "admissions.admissions.lego_directory.UserSocialAuth"
        ) as mock_social_auth:
            mock_social_auth.objects.filter.return_value.first.return_value = social
            with self.assertRaises(DirectoryAuthenticationRequired):
                _access_token(self.user, strategy="a-strategy")
