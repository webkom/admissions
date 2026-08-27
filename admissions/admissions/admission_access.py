from django.shortcuts import get_object_or_404

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Membership,
    NameVisibilityAuditEvent,
    SavedSchedule,
    UserApplication,
)

APPLICATION_VIEW_MODE_NONE = "none"
APPLICATION_VIEW_MODE_ADMIN_FULL = "admin_full"
APPLICATION_VIEW_MODE_COMMITTEE_FULL = "committee_full"
APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL = "committee_minimal"


def user_is_org_leadership(user):
    """The organisation's own leadership, admission-wide admins.

    Membership in the GodUser table grants admission-wide org-leadership
    privileges across every admission (read all applications, including
    priority_text). The list is managed by Webkom members via
    ``/api/manage/god-user/``.
    """
    lego_id = getattr(user, "lego_id", None)
    if not lego_id:
        return False
    from admissions.admissions.models import GodUser

    return GodUser.objects.filter(lego_id=lego_id).exists()


def user_is_admission_admin(admission, user):
    """Any active member of an admin group, plus God users (constants.GOD_LEGO_IDS).

    All active members of an admin group are completely equal: they see all
    applications for the admission in admin_full mode, including priority_text.
    """
    return user_is_org_leadership(user) or (
        Membership.objects.filter(user=user.pk, group__in=admission.admin_groups.all())
        .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
        .exists()
    )


def user_is_admission_leadership(admission, user):
    """All admission admins (God users and any active member of admin_groups) read priority_text."""
    return user_is_admission_admin(admission, user)


def user_is_interview_admin(admission, group, user):
    """Whether the user may operate this committee's interview workflow.

    Each committee runs its own independent schedule. Only this committee's
    own leader/recruiter may operate its interview workflow. Admin groups and
    God users do NOT operate committee schedules.
    """
    return user_represents_group(admission, group, user)


def get_representing_groups(admission, user):
    representing = Membership.objects.filter(
        user=user.pk,
        group__in=admission.groups.all(),
        role__in=(constants.LEADER, constants.RECRUITING),
    )
    return admission.groups.filter(pk__in=representing.values_list("group", flat=True))


def user_represents_group(admission, group, user):
    return get_representing_groups(admission, user).filter(pk=group.pk).exists()


def user_is_group_member(group, user):
    return (
        Membership.objects.filter(user=user.pk, group=group)
        .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
        .exists()
    )


def get_application_view_mode(admission, user):
    """Resolve how much of an application this user may read.

    Committee representation is checked BEFORE admin standing, and that
    order is load-bearing: a group that both administers an admission and
    competes in it - Webkom running the shared tool while also recruiting -
    must not read a rival committee's answers. Being named in admin_groups
    therefore grants the full view only to a group that is not itself taking
    part, which is why the central admin group should be a non-competing one
    (Hovedstyret / Abakus-leder) rather than a committee.

    Do not "simplify" this by hoisting the admin check: that hands every
    competing admin group the other committees' private application text.
    """
    represented_groups = get_representing_groups(admission, user)
    # Org leadership is exempt from this guard: the leader of Abakus-leder
    # oversees the whole admission and must not be narrowed to a single
    # committee even if the group itself participates. The guard still
    # applies to a competing admin group (Webkom running the tool while also
    # recruiting) - only org leadership bypasses it.
    if (
        admission.groups.count() > 1
        and represented_groups.exists()
        and not user_is_org_leadership(user)
    ):
        return APPLICATION_VIEW_MODE_COMMITTEE_MINIMAL
    if user_is_admission_admin(admission, user):
        return APPLICATION_VIEW_MODE_ADMIN_FULL
    if represented_groups.exists():
        return APPLICATION_VIEW_MODE_COMMITTEE_FULL
    return APPLICATION_VIEW_MODE_NONE


def user_is_committee_member(admission, user):
    return (
        Membership.objects.filter(user=user.pk, group__in=admission.groups.all())
        .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
        .exists()
    )


def schedule_response_context(admission, saved_schedule, is_interview_admin):
    """Visibility rules for one committee's own, independent schedule.

    An interview admin (the admission's own admin group, or this specific
    committee's leader/recruiter) always sees the full draft and every
    candidate. Everyone else - an ordinary committee member - sees identity
    only once the plan is both published and set to reveal names to the
    committee; there is no other committee to reveal it to any more, so
    name_visibility answers this directly.
    """
    hide_schedule = (
        saved_schedule.distributed_through is None and not is_interview_admin
    )
    # Interview admins always work against the full draft; everyone else only
    # ever sees interviews on or before the published boundary, even once
    # part of the plan is published (see distributed_through's docstring).
    publication_boundary = (
        None if is_interview_admin else saved_schedule.distributed_through
    )

    if is_interview_admin:
        hide_identity = False
        visible_candidate_ids = None
        contact_candidate_ids = None
        effective_name_visibility = saved_schedule.name_visibility
    else:
        hide_identity = not (
            saved_schedule.is_distributed
            and saved_schedule.name_visibility
            == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        )
        contact_candidate_ids = set()
        visible_candidate_ids = set(
            str(candidate_id)
            for candidate_id in UserApplication.objects.filter(
                admission=admission,
                group_applications__group_id=saved_schedule.group_id,
            )
            .values_list("pk", flat=True)
            .distinct()
        )
        effective_name_visibility = (
            SavedSchedule.NAME_VISIBILITY_COMMITTEE
            if not hide_identity
            else SavedSchedule.NAME_VISIBILITY_HIDDEN
        )

    return {
        "hide_candidate_identity": hide_identity,
        "hide_schedule": hide_schedule,
        "visible_candidate_ids": visible_candidate_ids,
        "contact_candidate_ids": contact_candidate_ids,
        "effective_name_visibility": effective_name_visibility,
        "include_deviation_review": is_interview_admin,
        "publication_boundary": publication_boundary,
        # Members see the interview status (the value) but not the recruiter
        # metadata (who last changed it, when) - those are workflow fields,
        # not part of the committee's read view. Interview admins see both.
        "include_interview_status_metadata": is_interview_admin,
    }


def revoke_removed_group_disclosures(admission, next_groups, actor):
    """Unpublish and hide the schedule of any group leaving the admission.

    SavedSchedule points at Group, not the AdmissionGroup through-row, so
    without this a re-added committee gets its old revealed plan straight
    back with no re-approval.
    """

    next_group_ids = {group.pk for group in next_groups}
    removed_schedules = (
        SavedSchedule.objects.select_for_update()
        .filter(admission=admission)
        .exclude(group_id__in=next_group_ids)
    )
    for saved in removed_schedules:
        was_visible = saved.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
        if saved.distributed_through is None and not was_visible:
            continue
        saved.distributed_through = None
        saved.name_visibility = SavedSchedule.NAME_VISIBILITY_HIDDEN
        saved.save(
            update_fields=["distributed_through", "name_visibility", "updated_at"]
        )
        if was_visible:
            NameVisibilityAuditEvent.objects.create(
                admission=admission,
                saved_schedule=saved,
                group=saved.group,
                group_name=saved.group.name,
                actor=actor,
                actor_username=actor.username if actor is not None else "system",
                action=NameVisibilityAuditEvent.ACTION_HIDDEN,
            )


def user_is_privileged(admission_slug, user):
    admission = get_object_or_404(Admission, slug=admission_slug)
    return (
        user_is_admission_admin(admission, user)
        or get_representing_groups(admission, user).exists()
    )


def user_is_recruiter(admission_slug, user):
    admission = get_object_or_404(Admission, slug=admission_slug)
    return get_representing_groups(admission, user).exists()
