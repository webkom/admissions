from concurrent.futures import ThreadPoolExecutor
from threading import Event, local
from unittest import mock

from django.db import close_old_connections, transaction
from django.db.models.query import QuerySet
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse

from admissions.admissions.models import Group, LegoUser, Membership
from admissions.oauth import update_custom_user_details, use_existing_lego_user


class OAuthMembershipSyncTestCase(TestCase):
    def setUp(self):
        self.user = LegoUser.objects.create(
            username="oauth-user",
            lego_id=92000,
            is_staff=True,
            profile_picture="https://example.com/old.png",
            gender="male",
        )
        self.group = Group.objects.create(
            name="backup",
            lego_id=92001,
        )

    def sync(self, response):
        update_custom_user_details(None, {}, user=self.user, response=response)
        self.user.refresh_from_db()

    def test_existing_user_is_reused_by_lego_id(self):
        result = use_existing_lego_user(
            {"lego_id": self.user.lego_id},
            {"id": self.user.lego_id},
            uid=str(self.user.lego_id),
        )

        self.assertEqual(result["user"], self.user)

    @override_settings(
        SOCIAL_AUTH_LEGO_API_URL="http://127.0.0.1:8000",
        ALLOWED_HOSTS=["127.0.0.1"],
        SESSION_COOKIE_NAME="admissions_sessionid",
    )
    def test_login_stores_lego_state_in_the_admissions_session(self):
        response = self.client.get(
            reverse("social:begin", args=["lego"]),
            HTTP_HOST="127.0.0.1:5002",
        )

        self.assertEqual(response.status_code, 302)
        self.assertIn("lego_state", self.client.session)
        self.assertIn("admissions_sessionid", response.cookies)
        self.assertIn("redirect_uri=http%3A%2F%2F127.0.0.1%3A5002", response.url)

    def test_empty_response_revokes_stale_memberships_and_staff_access(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        self.sync({})

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_valid_memberships_replace_stale_state(self):
        response = {
            "memberships": [
                {"abakusGroup": str(self.group.lego_id), "role": "leader"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
            "profilePicture": "https://example.com/new.png",
            "gender": "female",
        }

        self.sync(response)

        membership = Membership.objects.get(user=self.user)
        self.assertEqual(membership.group, self.group)
        self.assertEqual(membership.role, "leader")
        self.assertTrue(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, response["profilePicture"])
        self.assertEqual(self.user.gender, "female")

    def test_unknown_role_cannot_create_an_authorizing_membership(self):
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "administrator"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_missing_group_details_cannot_preserve_stale_access(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "leader"},
            ],
            "abakusGroups": [],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_duplicate_upstream_memberships_are_collapsed(self):
        membership = {"abakusGroup": self.group.lego_id, "role": "member"}
        response = {
            "memberships": [membership, membership.copy()],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        self.sync(response)

        self.assertEqual(Membership.objects.filter(user=self.user).count(), 1)

    def test_malformed_response_revokes_access_without_raising(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        self.sync(
            {
                "memberships": None,
                "abakusGroups": None,
                "profilePicture": {"url": "invalid"},
                "gender": ["invalid"],
            }
        )

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, "")
        self.assertEqual(self.user.gender, "")

    def test_partially_malformed_response_grants_no_membership_access(self):
        other_group = Group.objects.create(name="other", lego_id=92002)
        Membership.objects.create(
            user=self.user,
            group=other_group,
            role="leader",
        )
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "leader"},
                {"abakusGroup": other_group.lego_id},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
                {"id": other_group.lego_id, "name": other_group.name},
            ],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)

    def test_conflicting_roles_for_one_group_fail_closed(self):
        other_group = Group.objects.create(name="other", lego_id=92003)
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "member"},
                {"abakusGroup": self.group.lego_id, "role": "leader"},
                {"abakusGroup": other_group.lego_id, "role": "member"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
                {"id": other_group.lego_id, "name": other_group.name},
            ],
        }

        self.sync(response)

        self.assertFalse(Membership.objects.filter(user=self.user).exists())
        self.assertFalse(self.user.is_staff)


class ConcurrentOAuthMembershipSyncTestCase(TransactionTestCase):
    def setUp(self):
        self.user = LegoUser.objects.create(
            username="concurrent-oauth-user",
            lego_id=92100,
        )
        self.group = Group.objects.create(
            name="Concurrent OAuth group",
            lego_id=92101,
        )

    def response_for(self, role):
        return {
            "memberships": [
                {"abakusGroup": str(self.group.lego_id), "role": role},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

    def test_latest_serialized_refresh_replaces_the_complete_authority_set(self):
        first_refresh_complete = Event()
        second_refresh_started = Event()
        second_delete_complete = Event()
        release_first_refresh = Event()
        refresh_context = local()
        original_delete = QuerySet.delete

        def observe_delete(queryset):
            result = original_delete(queryset)
            if queryset.model is Membership and getattr(
                refresh_context, "is_second_refresh", False
            ):
                second_delete_complete.set()
            return result

        def refresh_as_leader():
            close_old_connections()
            user = LegoUser.objects.get(pk=self.user.pk)
            with transaction.atomic():
                update_custom_user_details(
                    None,
                    {},
                    user=user,
                    response=self.response_for("leader"),
                )
                first_refresh_complete.set()
                self.assertTrue(release_first_refresh.wait(timeout=5))
            close_old_connections()

        def refresh_as_member():
            close_old_connections()
            user = LegoUser.objects.get(pk=self.user.pk)
            refresh_context.is_second_refresh = True
            second_refresh_started.set()
            update_custom_user_details(
                None,
                {},
                user=user,
                response=self.response_for("member"),
            )
            close_old_connections()

        with (
            mock.patch.object(QuerySet, "delete", new=observe_delete),
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            leader_future = executor.submit(refresh_as_leader)
            self.assertTrue(first_refresh_complete.wait(timeout=5))
            member_future = executor.submit(refresh_as_member)
            self.assertTrue(second_refresh_started.wait(timeout=5))
            second_deleted_before_release = second_delete_complete.wait(timeout=2)
            release_first_refresh.set()
            leader_future.result(timeout=5)
            member_future.result(timeout=5)

        self.assertFalse(second_deleted_before_release)
        self.user.refresh_from_db()
        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
            ["member"],
        )
        self.assertFalse(self.user.is_staff)
