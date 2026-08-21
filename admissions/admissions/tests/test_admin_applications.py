import uuid
from datetime import date, timedelta
from unittest import mock

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

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
        self.assertEqual(
            response.data["userdata"]["application_view_mode"],
            "committee_full",
        )

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
        self.assertEqual(
            response.data["userdata"]["application_view_mode"],
            "committee_minimal",
        )


class ListApplicationsTestCase(APITestCase):
    def setUp(self):
        self.admission_slug = DEFAULT_ADMISSION_SLUG

        self.pleb = LegoUser.objects.create(lego_id=2)
        self.admin_group = Group.objects.create(name="Abakus-Leder", lego_id=1)

        self.admission = create_admission()
        self.admission.admin_groups.add(self.admin_group)

        # Abakus leader
        self.admission_admin = LegoUser.objects.create(
            username="admission_admin", lego_id=3
        )

        Membership.objects.create(
            user=self.admission_admin,
            role=LEADER,
            group=self.admin_group,
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
        self.assertEqual(
            json[0]["application_view_mode"],
            "committee_minimal",
        )
        self.assertEqual(json[0]["phone_number"], "00000000")
        self.assertEqual(
            set(json[0]),
            {
                "pk",
                "application_view_mode",
                "user",
                "created_at",
                "applied_within_deadline",
                "phone_number",
                "group_applications",
                "interview_status",
                "interview_status_updated_at",
            },
        )
        self.assertEqual(
            set(json[0]["group_applications"][0]),
            {"group", "text", "header_fields_response"},
        )
        self.assertEqual(
            set(json[0]["group_applications"][0]["group"]),
            {"pk", "name", "logo", "response_label"},
        )
        self.assertEqual(json[0]["group_applications"][0]["text"], "Webkom application")
        self.assertEqual(json[0]["group_applications"][0]["header_fields_response"], {})
        self.assertNotIn("priority_text", json[0])
        self.assertNotIn("Bedkom application", str(json[0]))

    def test_dual_role_admin_and_recruiter_gets_committee_minimal_view(self):
        application = UserApplication.objects.create(
            admission=self.admission,
            user=self.pleb,
            phone_number="00000000",
            text="1. Bedkom\n2. Webkom\nprivate central comment",
        )
        GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="private Webkom application",
            header_fields_response={"private": "webkom answer"},
        )
        GroupApplication.objects.create(
            application=application,
            group=self.bedkom,
            text="private Bedkom application",
            header_fields_response={"private": "bedkom answer"},
        )
        Membership.objects.create(
            user=self.webkom_rec,
            role=RECRUITING,
            group=self.admin_group,
        )
        self.client.force_authenticate(user=self.webkom_rec)

        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        admission_response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission_slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(admission_response.status_code, status.HTTP_200_OK)
        self.assertTrue(admission_response.data["userdata"]["is_admin"])
        self.assertEqual(
            admission_response.data["userdata"]["application_view_mode"],
            "committee_minimal",
        )
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["application_view_mode"],
            "committee_minimal",
        )
        self.assertEqual(response.data[0]["phone_number"], "00000000")
        self.assertEqual(
            response.data[0]["group_applications"],
            [
                {
                    "group": {
                        "pk": str(self.webkom.pk),
                        "name": self.webkom.name,
                        "logo": self.webkom.logo,
                        "response_label": self.webkom.response_label,
                    },
                    "text": "private Webkom application",
                    "header_fields_response": {"private": "webkom answer"},
                }
            ],
        )
        self.assertNotIn("priority_text", response.data[0])
        self.assertNotIn("email", response.data[0]["user"])
        self.assertNotIn("username", response.data[0]["user"])
        self.assertNotIn("private Bedkom application", str(response.data))
        self.assertNotIn("bedkom answer", str(response.data))
        self.assertNotIn("private central comment", str(response.data))

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
        self.assertEqual(
            response.data[0]["application_view_mode"],
            "admin_full",
        )
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
        self.assertNotIn("interview_status_updated_by", response.data)
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
        self.admission_slug = DEFAULT_ADMISSION_SLUG
        self.admission = create_admission()

        self.webkom_leader = LegoUser.objects.create(username="webkomleader", lego_id=6)
        self.pleb = LegoUser.objects.create(lego_id=7)

        self.webkom = Group.objects.create(name="Webkom", lego_id=1)
        self.arrkom = Group.objects.create(name="Arrkom", lego_id=2)
        self.admin_group = Group.objects.create(name="Admission admins", lego_id=3)
        self.admission.groups.add(self.webkom, self.arrkom)
        self.admission.admin_groups.add(self.admin_group)

        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.webkom
        )
        Membership.objects.create(
            user=self.webkom_leader, role=LEADER, group=self.admin_group
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

    def test_dual_role_user_cannot_delete_hidden_or_whole_application(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="12345678",
        )
        webkom_application = GroupApplication.objects.create(
            application=application,
            group=self.webkom,
            text="private Webkom application",
        )
        arrkom_application = GroupApplication.objects.create(
            application=application,
            group=self.arrkom,
            text="private Arrkom application",
        )
        url = reverse(
            "admin-userapplication-detail",
            kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
        )
        self.client.force_authenticate(user=self.webkom_leader)

        whole_response = self.client.delete(url)
        hidden_group_response = self.client.delete(f"{url}?groupId={self.arrkom.pk}")

        self.assertEqual(whole_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            hidden_group_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())
        self.assertTrue(
            GroupApplication.objects.filter(pk=webkom_application.pk).exists()
        )
        self.assertTrue(
            GroupApplication.objects.filter(pk=arrkom_application.pk).exists()
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

    def test_rejects_non_admins_and_invalid_confirmation_without_mutating(self):
        response = self.client.post(
            self.url, {"confirmation_name": self.committee.name}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(user=self.recruiter)
        response = self.client.post(
            self.url, {"confirmation_name": self.committee.name}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.ordinary_admin_group_member)
        response = self.client.post(
            self.url, {"confirmation_name": self.committee.name}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.staff_without_admission_role)
        response = self.client.post(
            self.url, {"confirmation_name": self.committee.name}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.url, {"confirmation_name": "ikke-webkom"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(
            GroupApplication.objects.filter(
                application=self.only_committee_application, group=self.committee
            ).exists()
        )

    def test_dual_role_admin_cannot_terminate_hidden_committee(self):
        Membership.objects.create(
            user=self.recruiter,
            group=self.admin_group,
            role=RECRUITING,
        )
        hidden_url = reverse(
            "terminate-committee-applications",
            kwargs={
                "admission_slug": self.admission.slug,
                "group_id": self.other_committee.pk,
            },
        )
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.post(
            hidden_url,
            {"confirmation_name": self.other_committee.name},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            GroupApplication.objects.filter(
                application=self.shared_application,
                group=self.other_committee,
            ).exists()
        )
        self.assertTrue(
            GroupApplication.objects.filter(
                application=self.other_application,
                group=self.other_committee,
            ).exists()
        )

    def test_terminates_only_the_selected_committee_data(self):
        self.client.force_authenticate(user=self.admin)
        saved_schedule = SavedSchedule.objects.create(
            admission=self.admission,
            schedule=[{"candidate_id": str(self.only_committee_application.pk)}],
            start_date=date.today(),
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        saved_schedule.revealed_groups.add(self.committee, self.other_committee)
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            user=self.admin,
            conflicts=[str(self.only_committee_application.pk)],
        )
        SolveJob.objects.create(
            admission=self.admission,
            requested_by=self.admin,
            request_data={},
        )

        response = self.client.post(
            self.url,
            {"confirmation_name": self.committee.name.lower()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            UserApplication.objects.filter(
                pk=self.only_committee_application.pk
            ).exists()
        )
        self.assertTrue(
            UserApplication.objects.filter(pk=self.shared_application.pk).exists()
        )
        self.assertTrue(
            UserApplication.objects.filter(pk=self.other_application.pk).exists()
        )
        self.assertFalse(GroupApplication.objects.filter(group=self.committee).exists())
        self.assertTrue(
            GroupApplication.objects.filter(
                application=self.shared_application, group=self.other_committee
            ).exists()
        )
        self.assertTrue(
            GroupApplication.objects.filter(
                application=self.other_application, group=self.other_committee
            ).exists()
        )
        self.assertTrue(Group.objects.filter(pk=self.committee.pk).exists())
        self.assertTrue(
            Membership.objects.filter(
                user=self.recruiter, group=self.committee
            ).exists()
        )
        saved_schedule.refresh_from_db()
        availability.refresh_from_db()
        self.assertEqual(saved_schedule.schedule, [])
        self.assertFalse(saved_schedule.is_distributed)
        self.assertEqual(
            saved_schedule.name_visibility, SavedSchedule.NAME_VISIBILITY_HIDDEN
        )
        self.assertEqual(saved_schedule.revealed_groups.count(), 0)
        self.assertEqual(availability.conflicts, [])
        self.assertFalse(SolveJob.objects.filter(admission=self.admission).exists())
