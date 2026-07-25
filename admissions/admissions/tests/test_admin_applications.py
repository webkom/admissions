import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Barrier, Event
from unittest import mock

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from admissions.admissions.constants import LEADER, MEMBER, RECRUITING, RETIREE
from admissions.admissions.interview_workflow import update_interview_status
from admissions.admissions.models import (
    Group,
    GroupApplication,
    InterviewAvailability,
    InterviewStatusAuditEvent,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)
from admissions.admissions.serializers import UserApplicationSerializer
from admissions.admissions.tests.utils import DEFAULT_ADMISSION_SLUG, create_admission


class AdminAdmissionPrivacyTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.committee = Group.objects.create(name="Committee", lego_id=20)
        self.admin_group = Group.objects.create(name="Admission admins", lego_id=21)
        self.admission.groups.add(self.committee)
        self.admission.admin_groups.add(self.admin_group)
        self.candidate = LegoUser.objects.create(username="candidate", lego_id=22)
        self.recruiter = LegoUser.objects.create(username="recruiter", lego_id=23)
        self.admin = LegoUser.objects.create(username="admin", lego_id=24)
        self.leader_admin = LegoUser.objects.create(username="leader-admin", lego_id=25)
        self.recruiting_admin = LegoUser.objects.create(
            username="recruiting-admin", lego_id=26
        )
        self.staff_without_admission_role = LegoUser.objects.create(
            username="staff-without-admission-role",
            lego_id=29,
            is_staff=True,
        )
        Membership.objects.create(
            user=self.recruiter, group=self.committee, role=RECRUITING
        )
        Membership.objects.create(user=self.admin, group=self.admin_group, role=MEMBER)
        Membership.objects.create(
            user=self.leader_admin, group=self.admin_group, role=LEADER
        )
        Membership.objects.create(
            user=self.recruiting_admin,
            group=self.admin_group,
            role=RECRUITING,
        )
        UserApplication.objects.create(
            admission=self.admission,
            user=self.candidate,
            phone_number="12345678",
        )
        self.url = reverse(
            "admin-admission-detail", kwargs={"slug": self.admission.slug}
        )

    def test_anonymous_user_cannot_retrieve_admin_admission(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_candidate_cannot_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.candidate)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_recruiter_can_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["userdata"]["actor_id"], str(self.recruiter.pk))
        self.assertNotIn("applications", response.data)
        self.assertNotIn(str(self.candidate.pk), str(response.data))

    def test_empty_filtered_prefetch_does_not_expose_general_answers(self):
        application = UserApplication.objects.get(
            admission=self.admission, user=self.candidate
        )
        application.text = "private global answer"
        application.header_fields_response = {"private": "value"}
        application.group_applications_filtered = []

        data = UserApplicationSerializer(application).data

        self.assertNotIn("text", data)
        self.assertNotIn("header_fields_response", data)
        self.assertNotIn("priority_text", data)

    def test_ordinary_admin_group_member_cannot_retrieve_admin_admission(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        public_response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertFalse(public_response.data["userdata"]["is_admin"])
        self.assertFalse(public_response.data["userdata"]["is_privileged"])
        self.assertEqual(
            public_response.data["userdata"]["actor_id"], str(self.admin.pk)
        )

    def test_active_admin_group_roles_are_reported_as_administrators(self):
        for admin in (self.leader_admin, self.recruiting_admin):
            with self.subTest(role=admin.username):
                self.client.force_authenticate(user=admin)

                response = self.client.get(self.url)
                public_response = self.client.get(
                    reverse(
                        "admission-detail",
                        kwargs={"slug": self.admission.slug},
                    )
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["userdata"]["actor_id"], str(admin.pk))
                self.assertEqual(
                    public_response.data["userdata"]["actor_id"], str(admin.pk)
                )
                self.assertTrue(response.data["userdata"]["is_admin"])
                self.assertTrue(response.data["userdata"]["is_privileged"])
                self.assertTrue(public_response.data["userdata"]["is_admin"])
                self.assertTrue(public_response.data["userdata"]["is_privileged"])

    def test_staff_without_admin_group_role_is_not_an_admission_admin(self):
        self.client.force_authenticate(user=self.staff_without_admission_role)

        response = self.client.get(self.url)
        public_response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(public_response.data["userdata"]["is_admin"])
        self.assertFalse(public_response.data["userdata"]["is_privileged"])
        self.assertEqual(
            public_response.data["userdata"]["actor_id"],
            str(self.staff_without_admission_role.pk),
        )

    def test_anonymous_public_userdata_has_no_actor_identity(self):
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["userdata"]["actor_id"])

    def test_retired_membership_does_not_grant_candidate_access(self):
        retired = LegoUser.objects.create(username="retired", lego_id=27)
        Membership.objects.create(user=retired, group=self.admin_group, role=RETIREE)
        Membership.objects.create(user=retired, group=self.committee, role=RETIREE)
        self.client.force_authenticate(user=retired)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_retired_admin_membership_is_not_reported_for_active_recruiter(self):
        recruiter = LegoUser.objects.create(username="former-admin", lego_id=28)
        Membership.objects.create(user=recruiter, group=self.admin_group, role=RETIREE)
        Membership.objects.create(user=recruiter, group=self.committee, role=RECRUITING)
        self.client.force_authenticate(user=recruiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["userdata"]["is_admin"])

    def test_public_userdata_separates_membership_from_represented_groups(self):
        member_group = Group.objects.create(name="Member committee", lego_id=27)
        self.admission.groups.add(member_group)
        Membership.objects.create(user=self.recruiter, group=member_group, role=MEMBER)
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(
            response.data["userdata"]["committee_groups"],
            [self.committee.name, member_group.name],
        )
        self.assertEqual(
            response.data["userdata"]["represented_groups"],
            [self.committee.name],
        )

    def test_public_userdata_preserves_each_group_context_and_scope(self):
        member_group = Group.objects.create(name="Committee one", lego_id=30)
        authority_group = Group.objects.create(name="Committee two", lego_id=31)
        self.admission.groups.add(member_group, authority_group)
        self.admission.admin_groups.add(authority_group)
        dual_role_user = LegoUser.objects.create(
            username="dual-role-context",
            lego_id=32,
        )
        Membership.objects.create(
            user=dual_role_user,
            group=member_group,
            role=MEMBER,
        )
        Membership.objects.create(
            user=dual_role_user,
            group=authority_group,
            role=RECRUITING,
        )
        self.client.force_authenticate(user=dual_role_user)

        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        userdata = response.data["userdata"]
        contexts = {
            context["group"]["name"]: context for context in userdata["group_contexts"]
        }
        self.assertEqual(
            contexts[member_group.name],
            {
                "group": {
                    "id": str(member_group.pk),
                    "name": member_group.name,
                },
                "membership_role": MEMBER,
                "membership_roles": [MEMBER],
                "sources": {
                    "admission_group": True,
                    "admin_group": False,
                },
                "actions": {
                    "open_member_workspace": True,
                    "administer_group_applications": False,
                },
            },
        )
        self.assertEqual(
            contexts[authority_group.name],
            {
                "group": {
                    "id": str(authority_group.pk),
                    "name": authority_group.name,
                },
                "membership_role": RECRUITING,
                "membership_roles": [RECRUITING],
                "sources": {
                    "admission_group": True,
                    "admin_group": True,
                },
                "actions": {
                    "open_member_workspace": True,
                    "administer_group_applications": True,
                },
            },
        )
        self.assertEqual(
            userdata["admission_actions"],
            {
                "administer_all_applications": True,
                "administer_schedule": True,
                "authority_group_ids": [str(authority_group.pk)],
            },
        )
        self.assertEqual(
            userdata["resource_scopes"],
            {
                "schedule": "admission",
                "availability": "admission_user",
            },
        )
        self.assertCountEqual(
            userdata["committee_groups"],
            [member_group.name, authority_group.name],
        )
        self.assertEqual(userdata["represented_groups"], [authority_group.name])
        self.assertEqual(userdata["committee_role"], RECRUITING)
        self.assertTrue(userdata["is_admin"])

    def test_dual_role_context_uses_one_schedule_and_own_availability(self):
        member_group = Group.objects.create(name="Committee one", lego_id=35)
        authority_group = Group.objects.create(name="Committee two", lego_id=36)
        self.admission.groups.add(member_group, authority_group)
        self.admission.admin_groups.add(authority_group)
        dual_role_user = LegoUser.objects.create(
            username="dual-role-workspaces",
            lego_id=37,
        )
        Membership.objects.create(
            user=dual_role_user,
            group=member_group,
            role=MEMBER,
        )
        Membership.objects.create(
            user=dual_role_user,
            group=authority_group,
            role=RECRUITING,
        )
        self.client.force_authenticate(user=dual_role_user)

        schedule_url = reverse(
            "saved-schedule",
            kwargs={"admission_slug": self.admission.slug},
        )
        schedule_payload = {
            "start_date": "2026-08-03",
            "end_date": "2026-08-03",
            "session_duration": 60,
            "enabled_slots": ["2026-08-03|540"],
            "day_start_minute": 540,
            "day_end_minute": 600,
            "expected_updated_at": None,
        }

        created_schedule = self.client.post(
            schedule_url,
            schedule_payload,
            format="json",
        )
        fetched_schedule = self.client.get(schedule_url)

        self.assertEqual(created_schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(fetched_schedule.status_code, status.HTTP_200_OK)
        self.assertEqual(
            fetched_schedule.data["updated_at"],
            created_schedule.data["updated_at"],
        )
        self.assertEqual(
            SavedSchedule.objects.filter(admission=self.admission).count(),
            1,
        )

        availability_url = reverse(
            "interview-availability",
            kwargs={"admission_slug": self.admission.slug},
        )
        availability = self.client.post(
            availability_url,
            {
                "slots": ["2026-08-03|540"],
                "expected_availability_generation": 1,
            },
            format="json",
        )

        self.assertEqual(availability.status_code, status.HTTP_200_OK)
        self.assertEqual(availability.data["user_id"], dual_role_user.pk)
        self.assertEqual(availability.data["slots"], ["2026-08-03|540"])
        self.assertTrue(
            InterviewAvailability.objects.filter(
                admission=self.admission,
                user=dual_role_user,
            ).exists()
        )

        applications_url = reverse(
            "admin-userapplication-list",
            kwargs={"admission_slug": self.admission.slug},
        )
        applications = self.client.get(applications_url)

        self.assertEqual(applications.status_code, status.HTTP_200_OK)
        self.assertEqual(len(applications.data), 1)

        member_only = LegoUser.objects.create(
            username="member-only-workspace",
            lego_id=38,
        )
        Membership.objects.create(
            user=member_only,
            group=member_group,
            role=MEMBER,
        )
        self.client.force_authenticate(user=member_only)

        forbidden_schedule = self.client.post(
            schedule_url,
            {
                **schedule_payload,
                "expected_updated_at": created_schedule.data["updated_at"],
            },
            format="json",
        )

        self.assertEqual(forbidden_schedule.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_group_roles_are_not_projected_as_destinations(self):
        inactive_group = Group.objects.create(name="Inactive committee", lego_id=33)
        self.admission.groups.add(inactive_group)
        inactive_user = LegoUser.objects.create(
            username="inactive-context",
            lego_id=34,
        )
        Membership.objects.create(
            user=inactive_user,
            group=inactive_group,
            role=RETIREE,
        )
        self.client.force_authenticate(user=inactive_user)

        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["userdata"]["group_contexts"], [])
        self.assertFalse(
            response.data["userdata"]["admission_actions"]["administer_schedule"]
        )


class ListApplicationsTestCase(APITestCase):
    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG

        self.pleb = LegoUser.objects.create(lego_id=2)
        leader_group = Group.objects.create(name="Abakus-Leder", lego_id=1)

        self.admission = create_admission()
        self.admission.admin_groups.add(leader_group)

        # Abakus leader
        self.admission_admin = LegoUser.objects.create(
            username="admission_admin", lego_id=3
        )

        Membership.objects.create(
            user=self.admission_admin,
            role=LEADER,
            group=leader_group,
        )

        # Webkom
        self.webkom_leader = LegoUser.objects.create(username="webkomleader", lego_id=4)
        self.webkom_rec = LegoUser.objects.create(username="webkomrec", lego_id=5)

        self.webkom = Group.objects.create(name="Webkom", lego_id=2)
        self.admission.groups.add(self.webkom)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        Membership.objects.create(
            user=self.webkom_rec, role=RECRUITING, group=self.webkom
        )

        # Bedkom
        self.bedkom_leader = LegoUser.objects.create(username="bedkomleader", lego_id=6)
        self.bedkom_rec = LegoUser.objects.create(username="bedkomrec", lego_id=7)
        self.staff_without_admission_role = LegoUser.objects.create(
            username="staff-without-admission-role",
            lego_id=8,
            is_staff=True,
        )

        self.bedkom = Group.objects.create(name="Bedkom", lego_id=3)
        self.admission.groups.add(self.bedkom)

        Membership.objects.create(
            user=self.bedkom_leader, role=LEADER, group=self.bedkom
        )
        Membership.objects.create(
            user=self.bedkom_rec, role=RECRUITING, group=self.bedkom
        )

        # Sample application data
        self.application_data = {
            "phone_number": "00000000",
            "applications": {
                "webkom": "Webkom application",
                "bedkom": "Bedkom application",
            },
        }

    def interview_status_url(self, application):
        return reverse(
            "admin-userapplication-interview-status",
            kwargs={
                "admission_slug": self.admission_slug,
                "pk": application.pk,
            },
        )

    def test_unauthorized_user_cannot_see_other_applications(self):
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_normal_user_cannot_see_other_applications(self):
        """Normal users should not be able to list applications"""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_without_admin_group_role_cannot_see_all_applications(self):
        self.client.force_authenticate(user=self.staff_without_admission_role)

        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_admission_slug_returns_404(self):
        """An unknown slug should 404 (via the permission lookup), not 500."""
        self.client.force_authenticate(user=self.pleb)

        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": "does-not-exist"},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # Should test for both application-mine and application-list unless editing current view
    def test_can_see_own_application(self):
        UserApplication.objects.create(user=self.pleb, admission=self.admission)

        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse(
                "userapplication-mine", kwargs={"admission_slug": self.admission_slug}
            )
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_cannot_get_application_by_pk(self):
        self.client.force_authenticate(user=self.pleb)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_group_leader_can_see_applications_for_own_group(self):
        self.client.force_authenticate(user=self.pleb)
        application_data = {
            "phone_number": "00000000",
            "applications": {"webkom": "Webkom application"},
        }
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one GroupApplication
        self.assertEqual(len(json[0]["group_applications"]), 1)
        # This GroupApplication should be to webkom
        self.assertEqual(json[0]["group_applications"][0]["group"]["name"], "Webkom")

    def test_group_recruiter_can_see_applications_for_own_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # Should return with 200
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Should only return one UserApplication
        self.assertEqual(len(json), 1)
        # The UserApplication should only have one GroupApplication
        self.assertEqual(len(json[0]["group_applications"]), 1)
        # This GroupApplication should be to webkom
        self.assertEqual(json[0]["group_applications"][0]["group"]["name"], "Webkom")
        self.assertNotIn("priority_text", json[0])

    def test_admission_admin_can_see_private_priority_comment(self):
        application = UserApplication.objects.create(
            admission=self.admission,
            user=self.pleb,
            phone_number="00000000",
            text="1. Webkom\n2. Koskom",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Webkom application",
        )
        self.client.force_authenticate(user=self.admission_admin)

        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["priority_text"], application.text)

    def test_group_recruiter_can_update_interview_status(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        application_updated_at = application.updated_at
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "confirmed",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["interview_status"], "confirmed")
        self.assertEqual(
            response.data["interview_status_updated_by"], self.webkom_rec.username
        )
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "confirmed")
        self.assertEqual(application.interview_status_updated_by, self.webkom_rec)
        self.assertEqual(application.updated_at, application_updated_at)
        self.assertEqual(
            response.data["interview_status_updated_at"],
            application.interview_status_updated_at.isoformat().replace("+00:00", "Z"),
        )
        event = InterviewStatusAuditEvent.objects.get(application=application)
        self.assertEqual(event.actor, self.webkom_rec)
        self.assertEqual(event.actor_username, self.webkom_rec.username)
        self.assertEqual(event.previous_status, "not_invited")
        self.assertEqual(event.new_status, "confirmed")

    def test_interview_status_supports_declined_and_cancelled(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.webkom_rec)

        declined = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "declined",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )
        cancelled = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "cancelled",
                "expected_interview_status_updated_at": declined.data[
                    "interview_status_updated_at"
                ],
            },
            format="json",
        )

        self.assertEqual(declined.status_code, status.HTTP_200_OK)
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        self.assertEqual(cancelled.data["interview_status"], "cancelled")
        self.assertEqual(
            list(
                InterviewStatusAuditEvent.objects.filter(
                    application=application
                ).values_list("previous_status", "new_status")
            ),
            [("declined", "cancelled"), ("not_invited", "declined")],
        )

    def test_repeating_interview_status_does_not_create_audit_noise(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "not_invited",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            InterviewStatusAuditEvent.objects.filter(application=application).exists()
        )

    def test_admin_can_update_interview_status(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.admission_admin)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "invited",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["interview_status"], "invited")
        self.assertIn("interview_status_updated_at", response.data)
        self.assertNotIn("updated_at", response.data)

    def test_candidate_cannot_update_interview_status(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.pleb)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "invited",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "not_invited")

    def test_recruiter_cannot_update_other_group_interview_status(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.bedkom)
        self.client.force_authenticate(user=self.webkom_rec)
        payload = {
            "interview_status": "invited",
            "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
        }

        response = self.client.patch(
            self.interview_status_url(application),
            payload,
            format="json",
        )
        missing_response = self.client.patch(
            reverse(
                "admin-userapplication-interview-status",
                kwargs={
                    "admission_slug": self.admission_slug,
                    "pk": uuid.uuid4(),
                },
            ),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data, missing_response.data)
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "not_invited")

    def test_multi_group_interview_status_is_shared(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        GroupApplication.objects.create(application=application, group=self.bedkom)
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "confirmed",
                "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(user=self.bedkom_rec)
        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["interview_status"], "confirmed")

    def test_interview_status_rejects_stale_revision(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        stale_revision = application.interview_status_updated_at
        application.interview_status = "invited"
        application.interview_status_updated_at = stale_revision + timedelta(seconds=1)
        application.save(
            update_fields=["interview_status", "interview_status_updated_at"]
        )
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "completed",
                "expected_interview_status_updated_at": stale_revision.isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "invited")

    def test_interview_status_revision_advances_when_clock_does_not(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        previous_revision = application.interview_status_updated_at
        self.client.force_authenticate(user=self.webkom_rec)

        with mock.patch(
            "admissions.admissions.interview_workflow.timezone.now",
            return_value=previous_revision,
        ):
            response = self.client.patch(
                self.interview_status_url(application),
                {
                    "interview_status": "invited",
                    "expected_interview_status_updated_at": previous_revision.isoformat(),
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertGreater(
            application.interview_status_updated_at,
            previous_revision,
        )

        stale_response = self.client.patch(
            self.interview_status_url(application),
            {
                "interview_status": "completed",
                "expected_interview_status_updated_at": previous_revision.isoformat(),
            },
            format="json",
        )
        self.assertEqual(stale_response.status_code, status.HTTP_409_CONFLICT)

    def test_interview_status_rejects_non_object_payload(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.patch(
            self.interview_status_url(application),
            [{"interview_status": "invited"}],
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "not_invited")

    def test_interview_status_returns_not_found_if_application_disappears(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.webkom_rec)
        payload = {
            "interview_status": "invited",
            "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat(),
        }
        url = self.interview_status_url(application)

        def delete_then_update(*args):
            application.delete()
            return update_interview_status(*args)

        with mock.patch(
            "admissions.admissions.views.update_interview_status",
            side_effect=delete_then_update,
        ):
            raced_response = self.client.patch(
                url,
                payload,
                format="json",
            )
        missing_response = self.client.patch(
            url,
            payload,
            format="json",
        )

        self.assertEqual(raced_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(raced_response.data, missing_response.data)

    def test_interview_status_rejects_invalid_and_unrelated_fields(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        GroupApplication.objects.create(application=application, group=self.webkom)
        self.client.force_authenticate(user=self.webkom_rec)
        payload = {
            "expected_interview_status_updated_at": application.interview_status_updated_at.isoformat()
        }

        invalid = self.client.patch(
            self.interview_status_url(application),
            {**payload, "interview_status": "unknown"},
            format="json",
        )
        unrelated = self.client.patch(
            self.interview_status_url(application),
            {
                **payload,
                "interview_status": "invited",
                "phone_number": "99999999",
            },
            format="json",
        )

        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unrelated.status_code, status.HTTP_400_BAD_REQUEST)
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "not_invited")
        self.assertEqual(application.phone_number, "00000000")

    def test_public_application_response_does_not_expose_interview_status(self):
        UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="00000000",
        )
        self.client.force_authenticate(user=self.pleb)

        response = self.client.get(
            reverse(
                "userapplication-mine",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("interview_status", response.data)
        self.assertNotIn("interview_status_updated_at", response.data)
        self.assertNotIn("interview_status_updated_by", response.data)

    def test_group_leader_cannot_see_applications_for_other_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_leader
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Bedkom")

        # Re-Auth as bedkom_leader
        self.client.force_authenticate(user=self.bedkom_leader)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_group_recruiter_cannot_see_applications_for_other_group(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        # Re-Auth as webkom_rec
        self.client.force_authenticate(user=self.webkom_rec)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Bedkom")

        # Re-Auth as bedkom_rec
        self.client.force_authenticate(user=self.bedkom_rec)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        json = res.json()
        # There should not be a group application for bedkom here
        for group_application in json[0]["group_applications"]:
            self.assertNotEqual(group_application["group"]["name"], "Webkom")

    def test_admission_admin_can_see_all_applications(self):
        self.client.force_authenticate(user=self.pleb)
        self.client.post(
            reverse(
                "userapplication-list", kwargs={"admission_slug": self.admission_slug}
            ),
            self.application_data,
            format="json",
        )

        self.client.force_authenticate(user=self.admission_admin)
        res = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        apps = res.json()[0]["group_applications"]

        # Ensure that the leader can see both the webkom and the bedkom application
        self.assertEqual(apps[0]["group"]["name"], "Webkom")
        self.assertEqual(apps[1]["group"]["name"], "Bedkom")


class DeleteGroupApplicationsTestCase(APITestCase):
    """
    Tests for api endpoint allowing leader of group / opptaksansvarlig and staff_user to delete group
    applications

    representative_of_group can only delete applications to their own group. staff_user can
    delete any group applications.

    Users can delete their own applications with the /mine endpoint
    """

    def setUp(self):
        global DEFAULT_ADMISSION_SLUG
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        self.admission = create_admission()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader", lego_id=6)
        self.pleb = LegoUser.objects.create(lego_id=7)

        self.webkom = Group.objects.create(name="Webkom", lego_id=1)
        self.arrkom = Group.objects.create(name="Arrkom", lego_id=2)
        self.admission.groups.add(self.webkom, self.arrkom)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )

        self.staff_user = LegoUser.objects.create(
            username="bigsupremeleader", lego_id=8, is_staff=True
        )

    def test_unauthorized_user_cannot_delete_application(self):
        res = self.client.delete(
            reverse(
                "admin-userapplication-detail",
                kwargs={"admission_slug": self.admission_slug, "pk": "not-a-uuid"},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_can_not_delete_own_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )

        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "admin-userapplication-detail",
                kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
            ),
            {"groupId": self.webkom.pk},
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_leader_can_delete_group_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission, phone_number="12345678"
        )
        arrkom_application = GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Some application text",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Some application text",
        )
        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.delete(
            f"{reverse('admin-userapplication-detail', kwargs={'admission_slug': self.admission_slug, 'pk': application.pk})}?groupId={self.webkom.pk}",
        )

        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())
        self.assertEqual(
            GroupApplication.objects.filter(application=application.pk).count(), 1
        )
        self.assertEqual(
            GroupApplication.objects.get(application=application.pk),
            arrkom_application,
        )

    def test_group_delete_uses_admission_application_group_lock_order(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="Arrkom application",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Webkom application",
        )
        self.client.force_authenticate(user=self.webkom_leader)

        with CaptureQueriesContext(connection) as queries:
            response = self.client.delete(
                (
                    f"{reverse('admin-userapplication-detail', kwargs={'admission_slug': self.admission_slug, 'pk': application.pk})}"
                    f"?groupId={self.webkom.pk}"
                )
            )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        locking_queries = [
            query["sql"].lower()
            for query in queries.captured_queries
            if "for update" in query["sql"].lower()
        ]
        admission_lock = next(
            index
            for index, query in enumerate(locking_queries)
            if '"admissions_admission"' in query
        )
        application_lock = next(
            index
            for index, query in enumerate(locking_queries)
            if '"admissions_userapplication"' in query
        )
        group_application_lock = next(
            index
            for index, query in enumerate(locking_queries)
            if '"admissions_groupapplication"' in query
        )

        self.assertLess(admission_lock, application_lock)
        self.assertLess(application_lock, group_application_lock)

    def test_malformed_group_id_returns_validation_error(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission, phone_number="12345678"
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="Some application text",
        )
        self.client.force_authenticate(user=self.webkom_leader)

        res = self.client.delete(
            f"{reverse('admin-userapplication-detail', kwargs={'admission_slug': self.admission_slug, 'pk': application.pk})}?groupId=not-a-uuid",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data, {"groupId": ["Ugyldig gruppe-ID."]})
        self.assertTrue(
            GroupApplication.objects.filter(application=application).exists()
        )


class ConcurrentGroupApplicationDeletionTestCase(TransactionTestCase):
    def setUp(self):
        self.admission = create_admission(slug="concurrent-group-delete")
        self.first_group = Group.objects.create(name="First group", lego_id=1111)
        self.second_group = Group.objects.create(name="Second group", lego_id=1112)
        self.admission.groups.add(self.first_group, self.second_group)
        self.first_leader = LegoUser.objects.create(
            username="first-delete-leader",
            lego_id=1113,
        )
        self.second_leader = LegoUser.objects.create(
            username="second-delete-leader",
            lego_id=1114,
        )
        Membership.objects.create(
            user=self.first_leader,
            role=LEADER,
            group=self.first_group,
        )
        Membership.objects.create(
            user=self.second_leader,
            role=LEADER,
            group=self.second_group,
        )
        candidate = LegoUser.objects.create(
            username="concurrent-delete-candidate",
            lego_id=1115,
        )
        self.application = UserApplication.objects.create(
            user=candidate,
            admission=self.admission,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.first_group,
            text="First application",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.second_group,
            text="Second application",
        )
        self.saved_schedule = SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[
                {
                    "candidate_id": str(self.application.pk),
                    "candidate": candidate.username,
                    "time": 540,
                    "panel": [],
                }
            ],
            start_date=date(2026, 4, 21),
            end_date=date(2026, 4, 21),
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        self.url = reverse(
            "admin-userapplication-detail",
            kwargs={
                "admission_slug": self.admission.slug,
                "pk": self.application.pk,
            },
        )

    def test_concurrent_final_group_deletions_remove_candidate_and_schedule_row(self):
        start = Barrier(2)

        def delete_group(user_id, group_id):
            close_old_connections()
            client = APIClient()
            user = LegoUser.objects.get(pk=user_id)
            client.force_authenticate(user=user)
            start.wait(timeout=5)
            response = client.delete(f"{self.url}?groupId={group_id}")
            close_old_connections()
            return response.status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(
                executor.map(
                    lambda args: delete_group(*args),
                    (
                        (self.first_leader.pk, self.first_group.pk),
                        (self.second_leader.pk, self.second_group.pk),
                    ),
                )
            )

        self.assertEqual(
            sorted(statuses),
            [status.HTTP_204_NO_CONTENT, status.HTTP_204_NO_CONTENT],
        )
        self.assertFalse(
            UserApplication.objects.filter(pk=self.application.pk).exists()
        )
        self.saved_schedule.refresh_from_db()
        self.assertEqual(self.saved_schedule.schedule, [])
        self.assertFalse(self.saved_schedule.is_distributed)
        self.assertEqual(
            self.saved_schedule.name_visibility,
            SavedSchedule.NAME_VISIBILITY_HIDDEN,
        )


class ConcurrentInterviewStatusAuthorityRevocationTestCase(TransactionTestCase):
    def setUp(self):
        self.admission = create_admission(slug="concurrent-interview-status")
        self.committee = Group.objects.create(
            name="Concurrent status committee",
            lego_id=1121,
        )
        self.admission.groups.add(self.committee)
        self.recruiter = LegoUser.objects.create(
            username="concurrent-status-recruiter",
            lego_id=1122,
        )
        Membership.objects.create(
            user=self.recruiter,
            role=RECRUITING,
            group=self.committee,
        )
        candidate = LegoUser.objects.create(
            username="concurrent-status-candidate",
            lego_id=1123,
        )
        self.application = UserApplication.objects.create(
            admission=self.admission,
            user=candidate,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
            application=self.application,
            group=self.committee,
        )
        self.url = reverse(
            "admin-userapplication-interview-status",
            kwargs={
                "admission_slug": self.admission.slug,
                "pk": self.application.pk,
            },
        )

    def test_demotion_while_request_waits_for_lock_blocks_status_write(self):
        admission_lock_held = Event()
        release_admission_lock = Event()
        pre_lock_authority_checked = Event()

        def hold_admission_lock():
            close_old_connections()
            with transaction.atomic():
                self.admission.__class__.objects.select_for_update().get(
                    pk=self.admission.pk
                )
                admission_lock_held.set()
                self.assertTrue(release_admission_lock.wait(timeout=5))
            close_old_connections()

        def update_status():
            close_old_connections()
            client = APIClient()
            recruiter = LegoUser.objects.get(pk=self.recruiter.pk)
            client.force_authenticate(user=recruiter)
            response = client.patch(
                self.url,
                {
                    "interview_status": "confirmed",
                    "expected_interview_status_updated_at": (
                        self.application.interview_status_updated_at.isoformat()
                    ),
                },
                format="json",
            )
            close_old_connections()
            return response.status_code

        from admissions.admissions import views

        initial_get_object = views.AdminApplicationViewSet.get_object

        def record_initial_scope_check(view):
            application = initial_get_object(view)
            pre_lock_authority_checked.set()
            return application

        with (
            mock.patch.object(
                views.AdminApplicationViewSet,
                "get_object",
                autospec=True,
                side_effect=record_initial_scope_check,
            ),
            ThreadPoolExecutor(max_workers=2) as executor,
        ):
            lock_future = executor.submit(hold_admission_lock)
            self.assertTrue(admission_lock_held.wait(timeout=5))
            update_future = executor.submit(update_status)
            self.assertTrue(pre_lock_authority_checked.wait(timeout=5))

            Membership.objects.filter(
                user=self.recruiter,
                group=self.committee,
            ).delete()
            release_admission_lock.set()

            lock_future.result(timeout=5)
            response_status = update_future.result(timeout=5)

        self.assertEqual(response_status, status.HTTP_403_FORBIDDEN)
        self.application.refresh_from_db()
        self.assertEqual(
            self.application.interview_status,
            UserApplication.INTERVIEW_STATUS_NOT_INVITED,
        )
        self.assertFalse(
            InterviewStatusAuditEvent.objects.filter(
                application=self.application
            ).exists()
        )


class TerminateCommitteeApplicationsTestCase(APITestCase):
    def setUp(self):
        self.admission = create_admission()
        self.committee = Group.objects.create(name="Webkom", lego_id=100)
        self.other_committee = Group.objects.create(name="Arrkom", lego_id=101)
        self.external_committee = Group.objects.create(name="Bedkom", lego_id=102)
        self.admin_group = Group.objects.create(name="Opptaksadmin", lego_id=103)
        self.admission.groups.add(self.committee, self.other_committee)
        self.admission.admin_groups.add(self.admin_group)

        self.admin = LegoUser.objects.create(username="admin", lego_id=104)
        self.recruiter = LegoUser.objects.create(username="recruiter", lego_id=105)
        self.ordinary_admin_group_member = LegoUser.objects.create(
            username="ordinary-admin-group-member",
            lego_id=109,
        )
        self.staff_without_admission_role = LegoUser.objects.create(
            username="staff-without-admission-role",
            lego_id=110,
            is_staff=True,
        )
        Membership.objects.create(
            user=self.admin,
            group=self.admin_group,
            role=LEADER,
        )
        Membership.objects.create(
            user=self.ordinary_admin_group_member,
            group=self.admin_group,
            role=MEMBER,
        )
        Membership.objects.create(
            user=self.recruiter, group=self.committee, role=RECRUITING
        )

        only_committee_user = LegoUser.objects.create(
            username="only-committee", lego_id=106
        )
        shared_user = LegoUser.objects.create(username="shared", lego_id=107)
        other_user = LegoUser.objects.create(username="other", lego_id=108)
        self.only_committee_application = UserApplication.objects.create(
            admission=self.admission,
            user=only_committee_user,
            phone_number="12345678",
        )
        self.shared_application = UserApplication.objects.create(
            admission=self.admission,
            user=shared_user,
            phone_number="12345679",
        )
        self.other_application = UserApplication.objects.create(
            admission=self.admission,
            user=other_user,
            phone_number="12345670",
        )
        GroupApplication.objects.create(
            application=self.only_committee_application, group=self.committee
        )
        GroupApplication.objects.create(
            application=self.shared_application, group=self.committee
        )
        GroupApplication.objects.create(
            application=self.shared_application, group=self.other_committee
        )
        GroupApplication.objects.create(
            application=self.other_application, group=self.other_committee
        )
        self.url = reverse(
            "terminate-committee-applications",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.committee.pk,
            },
        )
