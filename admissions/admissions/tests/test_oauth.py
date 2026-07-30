from concurrent.futures import ThreadPoolExecutor
from threading import Event, local
from unittest import mock

from django.db import close_old_connections, transaction
from django.db.models.query import QuerySet
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from social_core.exceptions import AuthFailed

from admissions.admissions.admission_access import lock_user_admission_memberships
from admissions.admissions.constants import RECRUITING
from admissions.admissions.interview_workflow import update_interview_status
from admissions.admissions.models import (
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.schedule_invalidation import invalidate_schedule_scope
from admissions.admissions.schedule_validation import canonicalize_solver_payload
from admissions.admissions.solve_jobs import planning_input_fingerprint
from admissions.admissions.tests.utils import create_admission
from admissions.oauth import update_custom_user_details, use_existing_lego_user
from admissions.utils.management.commands import run_solver_worker


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

    def test_missing_membership_payload_preserves_existing_authority(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        with self.assertRaises(AuthFailed):
            self.sync({})

        self.assertTrue(Membership.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

    def test_explicit_valid_empty_memberships_revoke_existing_authority(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        self.sync({"memberships": [], "abakusGroups": []})

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

    def test_unknown_role_aborts_without_mutating_existing_authority(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )
        response = {
            "memberships": [
                {"abakusGroup": self.group.lego_id, "role": "administrator"},
            ],
            "abakusGroups": [
                {"id": self.group.lego_id, "name": self.group.name},
            ],
        }

        with self.assertRaises(AuthFailed):
            self.sync(response)

        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
            ["leader"],
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

    def test_missing_group_details_abort_without_mutating_existing_authority(self):
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

        with self.assertRaises(AuthFailed):
            self.sync(response)

        self.assertTrue(Membership.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

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

    def test_malformed_response_aborts_without_mutating_user_state(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )

        with self.assertRaises(AuthFailed):
            self.sync(
                {
                    "memberships": None,
                    "abakusGroups": None,
                    "profilePicture": {"url": "invalid"},
                    "gender": ["invalid"],
                }
            )

        self.assertTrue(Membership.objects.filter(user=self.user).exists())
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)
        self.assertEqual(self.user.profile_picture, "https://example.com/old.png")
        self.assertEqual(self.user.gender, "male")

    def test_partially_malformed_response_preserves_existing_authority(self):
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

        with self.assertRaises(AuthFailed):
            self.sync(response)

        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list(
                    "group",
                    "role",
                )
            ),
            [(other_group.pk, "leader")],
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

    def test_conflicting_roles_abort_without_mutating_existing_authority(self):
        other_group = Group.objects.create(name="other", lego_id=92003)
        Membership.objects.create(
            user=self.user,
            group=other_group,
            role="leader",
        )
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

        with self.assertRaises(AuthFailed):
            self.sync(response)

        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
            ["leader"],
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)

    def test_no_op_membership_refresh_does_not_invalidate_a_plan(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )
        admission = create_admission(slug="oauth-no-op-scope")
        admission.groups.add(self.group)
        saved = SavedSchedule.objects.create(
            admission=admission,
            schedule=[{"candidate_id": "candidate", "time": 540, "panel": []}],
            start_date="2026-04-20",
            is_distributed=True,
        )
        previous_revision = saved.updated_at

        self.sync(
            {
                "memberships": [
                    {"abakusGroup": self.group.lego_id, "role": "leader"},
                ],
                "abakusGroups": [
                    {"id": self.group.lego_id, "name": self.group.name},
                ],
                "profilePicture": "https://example.com/old.png",
                "gender": "male",
            }
        )

        saved.refresh_from_db()
        self.assertTrue(saved.is_distributed)
        self.assertEqual(saved.updated_at, previous_revision)

    def test_eligibility_change_unpublishes_but_preserves_the_raw_draft(self):
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role="leader",
        )
        admission = create_admission(slug="oauth-changed-scope")
        admission.groups.add(self.group)
        schedule = [{"candidate_id": "candidate", "time": 540, "panel": []}]
        saved = SavedSchedule.objects.create(
            admission=admission,
            schedule=schedule,
            start_date="2026-04-20",
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        previous_revision = saved.updated_at

        self.sync(
            {
                "memberships": [
                    {"abakusGroup": self.group.lego_id, "role": "retiree"},
                ],
                "abakusGroups": [
                    {"id": self.group.lego_id, "name": self.group.name},
                ],
                "profilePicture": "https://example.com/old.png",
                "gender": "male",
            }
        )

        saved.refresh_from_db()
        self.assertEqual(saved.schedule, schedule)
        self.assertFalse(saved.is_distributed)
        self.assertEqual(
            saved.name_visibility,
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )
        self.assertGreater(saved.updated_at, previous_revision)


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

    def test_oauth_refresh_does_not_deadlock_authority_write_with_actor_fk(self):
        admission = create_admission(
            created_by=self.user,
            slug="oauth-authority-deadlock",
        )
        admission.groups.add(self.group)
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role=RECRUITING,
        )
        candidate = LegoUser.objects.create(
            username="oauth-deadlock-candidate",
            lego_id=92102,
        )
        application = UserApplication.objects.create(
            admission=admission,
            user=candidate,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.group,
        )

        authority_write_ready = Event()
        oauth_delete_starting = Event()
        release_authority_write = Event()
        thread_context = local()
        original_delete = QuerySet.delete

        def observe_delete(queryset):
            if queryset.model is Membership and getattr(
                thread_context, "oauth_refresh", False
            ):
                oauth_delete_starting.set()
            return original_delete(queryset)

        def write_interview_status():
            close_old_connections()
            try:
                actor = LegoUser.objects.get(pk=self.user.pk)
                current = UserApplication.objects.get(pk=application.pk)
                with transaction.atomic():
                    update_interview_status(
                        current,
                        UserApplication.INTERVIEW_STATUS_CONFIRMED,
                        current.interview_status_updated_at,
                        actor,
                    )
                    authority_write_ready.set()
                    self.assertTrue(release_authority_write.wait(timeout=5))
            finally:
                close_old_connections()

        def refresh_oauth_membership():
            close_old_connections()
            try:
                thread_context.oauth_refresh = True
                actor = LegoUser.objects.get(pk=self.user.pk)
                update_custom_user_details(
                    None,
                    {},
                    user=actor,
                    response=self.response_for("member"),
                )
            finally:
                close_old_connections()

        with (
            mock.patch.object(QuerySet, "delete", new=observe_delete),
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            write_future = executor.submit(write_interview_status)
            self.assertTrue(authority_write_ready.wait(timeout=5))
            oauth_future = executor.submit(refresh_oauth_membership)
            self.assertTrue(oauth_delete_starting.wait(timeout=5))

            try:
                release_authority_write.set()
                write_future.result(timeout=8)
                oauth_future.result(timeout=8)
            finally:
                release_authority_write.set()

        application.refresh_from_db()
        self.assertEqual(
            application.interview_status,
            UserApplication.INTERVIEW_STATUS_CONFIRMED,
        )
        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
            ["member"],
        )

    def test_oauth_revocation_and_solver_auto_apply_use_one_lock_order(self):
        admission = create_admission(
            created_by=self.user,
            slug="oauth-solver-auto-apply",
        )
        admission.admin_groups.add(self.group)
        Membership.objects.create(
            user=self.user,
            group=self.group,
            role=RECRUITING,
        )
        candidate = LegoUser.objects.create(
            username="oauth-solver-candidate",
            lego_id=92103,
        )
        application = UserApplication.objects.create(
            admission=admission,
            user=candidate,
        )
        saved = SavedSchedule.objects.create(
            admission=admission,
            schedule=[],
            start_date="2026-04-20",
            end_date="2026-04-20",
            session_duration=60,
            enabled_slots=["2026-04-20|540"],
            resolved_blocks=[{"slots": ["2026-04-20|540"]}],
            panel_size=1,
        )
        InterviewAvailability.objects.create(
            admission=admission,
            user=self.user,
            slots=["2026-04-20|540"],
            submitted_grid_generation=saved.availability_generation,
            participation=InterviewAvailability.PARTICIPATION_PARTICIPATING,
        )
        saved.refresh_from_db()
        request_data = {
            "auto_apply_if_empty": True,
            "baseline_updated_at": saved.updated_at.isoformat(),
            "candidates": [{"id": str(application.pk)}],
            "interviewers": [{"id": str(self.user.pk)}],
            "panel_size": 1,
            "options": {
                "policy_version": 2,
                "panel_stability": "preferred",
                "availability_fallback": "stop",
                "same_panel_per_block": False,
                "allow_overtime": False,
            },
            "availability_generation": saved.availability_generation,
            "layout_version": saved.layout_version,
        }
        canonical = canonicalize_solver_payload(
            admission,
            saved,
            request_data,
            self.user,
        )
        request_data["planning_input_fingerprint"] = planning_input_fingerprint(
            {**request_data, **canonical},
            saved.schedule,
        )
        job = SolveJob.objects.create(
            admission=admission,
            requested_by=self.user,
            status=SolveJob.STATUS_DONE,
            finished_at=timezone.now(),
            request_data=request_data,
            result={
                "status": "SUCCESS",
                "schedule": [
                    {
                        "candidate_id": str(application.pk),
                        "candidate": "ignored",
                        "time": 540,
                        "panel": [
                            {
                                "id": str(self.user.pk),
                                "name": "ignored",
                                "is_overtime": False,
                            }
                        ],
                    }
                ],
                "unplaceable": [],
            },
        )

        oauth_invalidation_ready = Event()
        release_oauth = Event()
        worker_membership_lock_starting = Event()
        thread_context = local()
        original_invalidate = invalidate_schedule_scope
        original_membership_lock = lock_user_admission_memberships

        def pause_oauth_invalidation(current_admission, **kwargs):
            oauth_invalidation_ready.set()
            self.assertTrue(release_oauth.wait(timeout=5))
            return original_invalidate(current_admission, **kwargs)

        def observe_membership_lock(current_admission, actor):
            if getattr(thread_context, "solver_worker", False):
                worker_membership_lock_starting.set()
            return original_membership_lock(current_admission, actor)

        def revoke_authority():
            close_old_connections()
            try:
                actor = LegoUser.objects.get(pk=self.user.pk)
                update_custom_user_details(
                    None,
                    {},
                    user=actor,
                    response=self.response_for("member"),
                )
            finally:
                close_old_connections()

        def auto_apply():
            close_old_connections()
            try:
                thread_context.solver_worker = True
                return run_solver_worker.Command()._auto_apply_empty_draft(job.pk)
            finally:
                close_old_connections()

        with (
            mock.patch(
                "admissions.oauth.invalidate_schedule_scope",
                side_effect=pause_oauth_invalidation,
            ),
            mock.patch(
                "admissions.admissions.schedule_workflow."
                "lock_user_admission_memberships",
                side_effect=observe_membership_lock,
            ),
            mock.patch.object(
                run_solver_worker,
                "lock_user_admission_memberships",
                side_effect=observe_membership_lock,
                create=True,
            ),
            mock.patch.object(run_solver_worker.log, "exception") as log_exception,
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            oauth_future = executor.submit(revoke_authority)
            self.assertTrue(oauth_invalidation_ready.wait(timeout=5))
            worker_future = executor.submit(auto_apply)
            self.assertTrue(worker_membership_lock_starting.wait(timeout=5))
            release_oauth.set()
            oauth_future.result(timeout=8)
            self.assertFalse(worker_future.result(timeout=8))
            log_exception.assert_not_called()

        saved.refresh_from_db()
        job.refresh_from_db()
        self.assertEqual(saved.schedule, [])
        self.assertIsNone(job.applied_at)
        self.assertEqual(
            list(
                Membership.objects.filter(user=self.user).values_list("role", flat=True)
            ),
            ["member"],
        )
