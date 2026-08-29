import uuid
from datetime import date, timedelta
from unittest import mock

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from admissions.admissions.constants import (
    CO_LEADER,
    LEADER,
    MEMBER,
    RECRUITING,
    RETIREE,
)
from admissions.admissions.interview_workflow import update_interview_status
from admissions.admissions.models import (
    GodUser,
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
        self.co_leader_admin = LegoUser.objects.create(
            username="co-leader-admin", lego_id=30
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
        Membership.objects.create(
            user=self.co_leader_admin,
            group=self.admin_group,
            role=CO_LEADER,
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

    def test_recruiter_keeps_access_when_committee_leaves_admin_groups(self):
        self.admission.admin_groups.add(self.committee)
        GroupApplication.objects.create(
            application=UserApplication.objects.get(
                admission=self.admission,
                user=self.candidate,
            ),
            group=self.committee,
            text="committee answer",
        )
        self.admission.admin_groups.remove(self.committee)
        self.client.force_authenticate(user=self.recruiter)

        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["group_applications"][0]["group"]["name"],
            self.committee.name,
        )

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

    def test_priority_text_is_visible_to_all_admin_group_members(self):
        """All admin_full viewers (any active member of an admin group, plus God users)
        see the applicant's note to "central admission officers" (priority_text)."""
        UserApplication.objects.filter(
            admission=self.admission, user=self.candidate
        ).update(text="private central comment")
        url = reverse(
            "admin-userapplication-list",
            kwargs={"admission_slug": self.admission.slug},
        )

        for admin in (
            self.leader_admin,
            self.recruiting_admin,
        ):
            with self.subTest(role=admin.username):
                self.client.force_authenticate(user=admin)
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    response.data[0]["priority_text"], "private central comment"
                )

    def test_admission_admin_roles_have_full_application_access(self):
        """All active members in an admin group have full access."""
        for admin in (
            self.leader_admin,
            self.recruiting_admin,
            self.co_leader_admin,
            self.admin,
        ):
            with self.subTest(role=admin.username):
                self.client.force_authenticate(user=admin)

                response = self.client.get(self.url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

                public_response = self.client.get(
                    reverse("admission-detail", kwargs={"slug": self.admission.slug})
                )
                self.assertTrue(public_response.data["userdata"]["is_admin"])
                self.assertTrue(public_response.data["userdata"]["is_privileged"])

    def test_admin_group_member_cannot_open_committee_schedule(self):
        """Admin group members manage admissions and see all applications, but
        do NOT operate committee interview schedules (schedules belong only
        to each committee's own recruiters/leaders)."""
        SavedSchedule.objects.create(
            admission=self.admission,
            group=self.committee,
            schedule=[],
            start_date="2026-04-20",
            end_date="2026-04-24",
            session_duration=60,
            enabled_slots=["2026-04-20|540"],
            panel_size=1,
        )
        self.client.force_authenticate(user=self.admin)

        schedule_response = self.client.get(
            reverse(
                "saved-schedule",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee.pk,
                },
            )
        )
        self.assertEqual(schedule_response.status_code, status.HTTP_403_FORBIDDEN)

        candidates_response = self.client.get(
            reverse(
                "interview-candidates",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee.pk,
                },
            )
        )
        self.assertEqual(candidates_response.status_code, status.HTTP_403_FORBIDDEN)

        availability_response = self.client.get(
            reverse(
                "interview-availability",
                kwargs={
                    "admission_slug": self.admission.slug,
                    "group_id": self.committee.pk,
                },
            )
        )
        self.assertEqual(availability_response.status_code, status.HTTP_403_FORBIDDEN)
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

    def test_co_leader_has_admission_admin_access(self):
        self.client.force_authenticate(user=self.co_leader_admin)

        response = self.client.get(self.url)
        public_response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
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


class GroupLeadershipGrantsNothingTestCase(APITestCase):
    """No group membership confers org-wide admin.

    Not Hovedstyret, not Abakus-leder - not even their leader or co-leader.
    The only way in is a god-listed LEGO id (constants.GOD_LEGO_IDS); see
    GodUserAccessTestCase. A user who holds a leadership role in a group
    that is not part of the opptak must get no admission-wide privilege from
    it, and must not reach the applicants.
    """

    def setUp(self):
        self.admission = create_admission()
        self.abakus_leder_group = Group.objects.create(name="Abakus-leder", lego_id=10)
        self.hovedstyret = Group.objects.create(name="Hovedstyret", lego_id=9)
        # Deliberately NOT in admin_groups: the point is that no group
        # membership may stand in for org leadership.
        self.first = Group.objects.create(name="Bedkom", lego_id=12)
        self.second = Group.objects.create(name="Webkom", lego_id=13)
        self.admission.groups.add(self.first, self.second)

        # Leaders of groups that are not part of this opptak at all.
        self.hovedstyret_leader = LegoUser.objects.create(
            username="hovedstyret-leader", lego_id=15
        )
        Membership.objects.create(
            user=self.hovedstyret_leader, group=self.hovedstyret, role=LEADER
        )
        self.hovedstyret_co_leader = LegoUser.objects.create(
            username="hovedstyret-co-leader", lego_id=16
        )
        Membership.objects.create(
            user=self.hovedstyret_co_leader,
            group=self.hovedstyret,
            role=CO_LEADER,
        )
        self.abakus_leader = LegoUser.objects.create(
            username="abakus-leader", lego_id=14
        )
        Membership.objects.create(
            user=self.abakus_leader, group=self.abakus_leder_group, role=LEADER
        )

        # Someone with no membership at all - the check must be intentional,
        # not just "everyone gets admin".
        self.plain = LegoUser.objects.create(username="plain", lego_id=17)

        candidate = LegoUser.objects.create(username="candidate", lego_id=18)
        self.application = UserApplication.objects.create(
            admission=self.admission, user=candidate, phone_number="12345678"
        )

    def _userdata(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data["userdata"]

    def _list_applications(self, user):
        self.client.force_authenticate(user=user)
        return self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission.slug},
            )
        )

    def test_no_group_leadership_gets_any_work_privilege(self):
        """Leader or co-leader of Hovedstyret or Abakus-leder: no admin, no
        privileged flag, no access to the applicants, no manage page."""
        for user in (
            self.hovedstyret_leader,
            self.hovedstyret_co_leader,
            self.abakus_leader,
        ):
            with self.subTest(role=user.username):
                userdata = self._userdata(user)
                self.assertFalse(userdata["is_admin"])
                self.assertFalse(userdata["is_privileged"])
                self.assertEqual(userdata["application_view_mode"], "none")

                response = self._list_applications(user)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_other_abakus_leder_roles_grant_nothing_here(self):
        """A plain member, treasurer, or any other role in Abakus-leder
        gains no admission-wide privilege either - only god-listed ids do.
        They only ever gain committee-scoped access if they separately hold
        a role in a participating committee."""
        for role in (MEMBER, "treasurer", RECRUITING):
            with self.subTest(role=role):
                user = LegoUser.objects.create(
                    username=f"leder-{role}", lego_id=30 + len(role)
                )
                Membership.objects.create(
                    user=user, group=self.abakus_leder_group, role=role
                )

                userdata = self._userdata(user)
                self.assertFalse(userdata["is_admin"])
                self.assertFalse(userdata["is_privileged"])
                self.assertEqual(userdata["application_view_mode"], "none")

                response = self._list_applications(user)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_priority_text_is_unreachable_for_group_leadership(self):
        """The applicant's note to central officers is reserved for god
        users - no group leadership may read it."""
        UserApplication.objects.filter(pk=self.application.pk).update(
            text="note to central officers"
        )

        for user in (self.hovedstyret_leader, self.hovedstyret_co_leader):
            with self.subTest(role=user.username):
                response = self._list_applications(user)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_outsider_is_not_an_admission_admin(self):
        userdata = self._userdata(self.plain)
        self.assertFalse(userdata["is_admin"])
        self.assertFalse(userdata["is_privileged"])
        self.assertEqual(userdata["application_view_mode"], "none")

    def test_group_leadership_does_not_manage_every_admission(self):
        """The manage-admissions page is Webkom + god ids only: an
        Abakus-leder leader is staff (like backup/revy leaders) but still
        only sees the admissions they created themselves, and a Hovedstyret
        leader is not even staff."""
        someone_elses = create_admission(
            slug="someone-elses", created_by=self.abakus_leader, title="Mitt opptak"
        )

        # The login pipeline grants the Abakus-leder leader is_staff; a
        # Hovedstyret leader gets nothing.
        self.abakus_leader.is_staff = True
        self.abakus_leader.save(update_fields=["is_staff"])

        self.client.force_authenticate(user=self.abakus_leader)
        response = self.client.get(reverse("manage-admission-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = {row["slug"] for row in response.data}
        self.assertIn(someone_elses.slug, slugs)
        self.assertNotIn(self.admission.slug, slugs)

        self.client.force_authenticate(user=self.hovedstyret_leader)
        response = self.client.get(reverse("manage-admission-list"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_outside_webkom_and_god_ids_only_manages_own(self):
        """The Webkom-wide manage grant widens to god ids and no further:
        an ordinary staff member who is neither still only sees the
        admissions they created."""
        self.plain.is_staff = True
        self.plain.save(update_fields=["is_staff"])
        someone_elses = create_admission(
            slug="someone-elses-2", created_by=self.plain, title="Mitt opptak"
        )

        self.client.force_authenticate(user=self.plain)
        response = self.client.get(reverse("manage-admission-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = {row["slug"] for row in response.data}
        self.assertIn(someone_elses.slug, slugs)
        self.assertNotIn(self.admission.slug, slugs)


class GodUserAccessTestCase(APITestCase):
    """DB-backed god-listed LEGO ids get the same admission-wide admin as the
    organisation's leadership, without holding any leadership role."""

    def setUp(self):
        self.admission = create_admission()
        # Deliberately no admin_groups and no group membership: the god-list
        # row alone must carry the access.
        self.god = LegoUser.objects.create(username="deputy", lego_id=91001)
        GodUser.objects.create(lego_id=self.god.lego_id)
        self.plain = LegoUser.objects.create(username="plain", lego_id=91002)
        self.bedkom = Group.objects.create(name="Bedkom", lego_id=91003)
        self.admission.groups.add(self.bedkom)
        self.member = LegoUser.objects.create(username="member", lego_id=91004)
        Membership.objects.create(user=self.member, group=self.bedkom, role=MEMBER)

    def test_a_god_listed_user_is_admission_admin_everywhere(self):
        self.client.force_authenticate(user=self.god)
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        userdata = response.data["userdata"]
        self.assertTrue(userdata["is_admin"])
        self.assertTrue(userdata["is_privileged"])
        self.assertEqual(userdata["application_view_mode"], "admin_full")

    def test_a_god_listed_user_sees_every_admission_in_manage(self):
        someone_elses = create_admission(
            slug="someone-elses-god",
            created_by=self.plain,
            title="Someone elses opptak",
        )
        self.client.force_authenticate(user=self.god)
        response = self.client.get(reverse("manage-admission-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = {row["slug"] for row in response.data}
        self.assertIn(self.admission.slug, slugs)
        self.assertIn(someone_elses.slug, slugs)

    def test_a_non_listed_user_gains_nothing(self):
        """Not on the hard-coded list: no admin, no manage access."""
        self.client.force_authenticate(user=self.plain)
        response = self.client.get(
            reverse("admission-detail", kwargs={"slug": self.admission.slug})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        userdata = response.data["userdata"]
        self.assertFalse(userdata["is_admin"])
        self.assertFalse(userdata["is_privileged"])
        self.assertEqual(userdata["application_view_mode"], "none")

    def test_a_god_listed_user_does_not_operate_other_committees_schedule(self):
        """God ids are applicant admins, not schedule admins: opening a
        committee's schedule, candidates, or availability they are not part
        of is 403, even though they see every applicant."""
        for url_name in (
            "saved-schedule",
            "interview-candidates",
            "interview-availability",
        ):
            with self.subTest(url=url_name):
                self.client.force_authenticate(user=self.god)
                response = self.client.get(
                    reverse(
                        url_name,
                        kwargs={
                            "admission_slug": self.admission.slug,
                            "group_id": self.bedkom.pk,
                        },
                    )
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_a_god_listed_user_reads_priority_text(self):
        """The applicant's note to central officers is visible to god ids
        across every committee."""
        application = UserApplication.objects.create(
            admission=self.admission,
            user=self.plain,
            phone_number="12345678",
            text="note to central officers",
        )
        self.client.force_authenticate(user=self.god)
        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission.slug},
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["priority_text"], "note to central officers")
        self.assertEqual(response.data[0]["pk"], str(application.pk))


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
        # Being in admin_groups grants ADMIN_FULL across all committees.
        self.assertTrue(admission_response.data["userdata"]["is_admin"])
        self.assertEqual(
            admission_response.data["userdata"]["application_view_mode"],
            "admin_full",
        )
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["application_view_mode"],
            "admin_full",
        )
        self.assertEqual(response.data[0]["phone_number"], "00000000")
        # Sees group applications for all committees (Webkom and Bedkom)
        self.assertEqual(len(response.data[0]["group_applications"]), 2)

        # But a recruiter of Bedkom (NOT in admin_groups) is narrowed to committee_minimal
        self.client.force_authenticate(user=self.bedkom_rec)
        bk_response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )
        self.assertEqual(bk_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            bk_response.data[0]["application_view_mode"],
            "committee_minimal",
        )
        self.assertEqual(len(bk_response.data[0]["group_applications"]), 1)
        self.assertEqual(
            bk_response.data[0]["group_applications"][0]["group"]["name"],
            "Bedkom",
        )
        self.assertNotIn("private central comment", str(bk_response.data))
        self.assertIn("private central comment", str(response.data))

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

    def test_committee_member_cannot_delete_whole_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        GroupApplication.objects.create(application=application, group=self.webkom)

        self.client.force_authenticate(user=self.pleb)
        res = self.client.delete(
            reverse(
                "admin-userapplication-detail",
                kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
            )
        )

        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(UserApplication.objects.filter(pk=application.pk).exists())

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

    def test_deleting_final_group_application_deletes_whole_application(self):
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission
        )
        GroupApplication.objects.create(application=application, group=self.webkom)

        self.client.force_authenticate(user=self.webkom_leader)
        res = self.client.delete(
            f"{reverse('admin-userapplication-detail', kwargs={'admission_slug': self.admission_slug, 'pk': application.pk})}?groupId={self.webkom.pk}",
        )

        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserApplication.objects.filter(pk=application.pk).exists())

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

    def test_admin_user_can_delete_whole_and_group_applications(self):
        application = UserApplication.objects.create(
            user=self.pleb,
            admission=self.admission,
            phone_number="12345678",
        )
        GroupApplication.objects.create(
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

        # webkom_leader is in admin_group, so they can delete group applications and whole application
        group_response = self.client.delete(f"{url}?groupId={self.arrkom.pk}")
        self.assertEqual(group_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            GroupApplication.objects.filter(pk=arrkom_application.pk).exists()
        )

        whole_response = self.client.delete(url)
        self.assertEqual(whole_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserApplication.objects.filter(pk=application.pk).exists())

    def test_committee_recruiter_without_admin_standing_still_cannot_delete(self):
        """A plain committee recruiter must still be confined to its own committee."""
        plain_recruiter = LegoUser.objects.create(
            username="plain-recruiter", lego_id=11
        )
        Membership.objects.create(
            user=plain_recruiter, role=RECRUITING, group=self.webkom
        )
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
        self.client.force_authenticate(user=plain_recruiter)

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

    def test_committee_recruiter_interview_status_gate_matches_view_mode(self):
        """A non-admin recruiter only gets committee_minimal, so they must
        NOT be able to mutate an application that has ONLY a rival committee's
        group_application — the queryset filter excludes it and get_object 404s."""
        plain_recruiter = LegoUser.objects.create(
            username="plain-recruiter-2", lego_id=12
        )
        Membership.objects.create(
            user=plain_recruiter, role=RECRUITING, group=self.webkom
        )
        rival_only = UserApplication.objects.create(
            user=self.pleb, admission=self.admission, phone_number="00000000"
        )
        GroupApplication.objects.create(
            application=rival_only, group=self.arrkom, text="Arrkom only"
        )
        url = reverse(
            "admin-userapplication-interview-status",
            kwargs={"admission_slug": self.admission_slug, "pk": rival_only.pk},
        )
        self.client.force_authenticate(user=plain_recruiter)

        response = self.client.patch(
            url,
            {
                "interview_status": "confirmed",
                "expected_interview_status_updated_at": (
                    rival_only.interview_status_updated_at.isoformat()
                ),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        rival_only.refresh_from_db()
        self.assertEqual(rival_only.interview_status, "not_invited")
        rival_only.refresh_from_db()
        self.assertEqual(rival_only.interview_status, "not_invited")

    def test_plain_committee_member_cannot_update_interview_status(self):
        """A plain committee member (no leader/recruiter role) must not be
        able to PATCH interview_status. Status is read-only for members -
        the policy is "members see status, cannot edit it"."""
        member = LegoUser.objects.create(username="plain-member", lego_id=13)
        Membership.objects.create(user=member, role=MEMBER, group=self.webkom)
        application = UserApplication.objects.create(
            user=self.pleb, admission=self.admission, phone_number="00000000"
        )
        GroupApplication.objects.create(
            application=application, group=self.webkom, text="Webkom only"
        )
        url = reverse(
            "admin-userapplication-interview-status",
            kwargs={"admission_slug": self.admission_slug, "pk": application.pk},
        )
        self.client.force_authenticate(user=member)

        response = self.client.patch(
            url,
            {
                "interview_status": "confirmed",
                "expected_interview_status_updated_at": (
                    application.interview_status_updated_at.isoformat()
                ),
            },
            format="json",
        )

        # Same gate as the dual-role case: the queryset filter hides the
        # application from a plain member (no leader/recruiter role), so
        # 403 or 404 are both acceptable "not editable" answers.
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )
        application.refresh_from_db()
        self.assertEqual(application.interview_status, "not_invited")

    def test_outsider_is_forbidden_not_silently_empty(self):
        """H2 regression: a logged-in user with no role in this admission
        must get 403 from the application listing, not 200 with an empty
        list. The gate is at ApplicationPermissions.has_permission via
        user_is_privileged(admission_slug). A future refactor that drops
        the permission check and falls back to the queryset's
        UserApplication.objects.none() would silently return [] and hide
        the missing access decision from the audit trail."""
        outsider = LegoUser.objects.create(username="outsider", lego_id=14)
        self.client.force_authenticate(user=outsider)

        response = self.client.get(
            reverse(
                "admin-userapplication-list",
                kwargs={"admission_slug": self.admission_slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


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

    def test_non_admin_recruiter_cannot_terminate_other_committee(self):
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
            group=self.committee,
            schedule=[{"candidate_id": str(self.only_committee_application.pk)}],
            start_date=date.today(),
            is_distributed=True,
            name_visibility=SavedSchedule.NAME_VISIBILITY_COMMITTEE,
        )
        availability = InterviewAvailability.objects.create(
            admission=self.admission,
            group=self.committee,
            user=self.admin,
            conflicts=[str(self.only_committee_application.pk)],
        )
        SolveJob.objects.create(
            admission=self.admission,
            group=self.committee,
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
        self.assertEqual(availability.conflicts, [])
        self.assertFalse(SolveJob.objects.filter(admission=self.admission).exists())
