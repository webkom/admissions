from django.db.models import Q
from django.shortcuts import get_object_or_404

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Membership,
    NameVisibilityAuditEvent,
    SavedSchedule,
    UserApplication,
)


def user_is_admission_admin(admission, user):
    return (
        Membership.objects.filter(user=user.pk, group__in=admission.admin_groups.all())
        .filter(role__in=(constants.LEADER, constants.RECRUITING))
        .exists()
    )


def user_is_interview_admin(admission, user):
    """Whether the user may operate the admission interview workflow.

    Admission admin-group membership governs the broader application admin
    surface. Committee leaders and recruiting responsibles also own the
    interview workflow, so they get the same scheduling capabilities without
    being promoted to admission-wide application admins.
    """
    return (
        user_is_admission_admin(admission, user)
        or get_representing_groups(admission, user).exists()
    )


def get_representing_groups(admission, user):
    representing = Membership.objects.filter(
        user=user.pk,
        group__in=admission.groups.all(),
        role__in=(constants.LEADER, constants.RECRUITING),
    )
    return admission.groups.filter(pk__in=representing.values_list("group", flat=True))


def get_user_admission_groups(admission, user):
    memberships = (
        Membership.objects.filter(user=user.pk, group__in=admission.groups.all())
        .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
        .values_list("group", flat=True)
    )
    return admission.groups.filter(pk__in=memberships)


def get_name_revealed_groups(admission, saved_schedule):
    if (
        saved_schedule.is_distributed
        and saved_schedule.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE
    ):
        return admission.groups.all()
    if not saved_schedule.is_distributed:
        return admission.groups.none()
    return saved_schedule.revealed_groups.all()


def get_user_name_revealed_groups(admission, saved_schedule, user):
    return get_user_admission_groups(admission, user).filter(
        pk__in=get_name_revealed_groups(admission, saved_schedule)
    )


def get_user_candidate_visible_groups(admission, saved_schedule, user):
    represented_groups = get_representing_groups(admission, user)
    if saved_schedule is None:
        return represented_groups
    revealed_groups = get_user_name_revealed_groups(admission, saved_schedule, user)
    return admission.groups.filter(
        Q(pk__in=represented_groups) | Q(pk__in=revealed_groups)
    ).distinct()


def set_group_name_visibility(saved_schedule, groups, visible, actor):
    groups = list(groups)
    if not groups:
        return
    group_ids = {group.pk for group in groups}
    revealed_ids = set(
        saved_schedule.revealed_groups.filter(pk__in=group_ids).values_list(
            "pk", flat=True
        )
    )
    changed_groups = [
        group for group in groups if (group.pk in revealed_ids) != visible
    ]
    if not changed_groups:
        return
    if visible:
        saved_schedule.revealed_groups.add(*changed_groups)
        action = NameVisibilityAuditEvent.ACTION_REVEALED
    else:
        saved_schedule.revealed_groups.remove(*changed_groups)
        action = NameVisibilityAuditEvent.ACTION_HIDDEN
    record_name_visibility_events(saved_schedule, changed_groups, action, actor)


def record_name_visibility_events(saved_schedule, groups, action, actor):
    groups = list(groups)
    if not groups:
        return
    NameVisibilityAuditEvent.objects.bulk_create(
        [
            NameVisibilityAuditEvent(
                admission=saved_schedule.admission,
                saved_schedule=saved_schedule,
                group=group,
                group_name=group.name,
                actor=actor,
                actor_username=actor.username,
                action=action,
            )
            for group in groups
        ]
    )


def synchronize_admission_group_disclosures(admission, next_groups, actor):
    previous_groups = list(admission.groups.all())
    next_groups_by_id = {group.pk: group for group in next_groups}
    previous_groups_by_id = {group.pk: group for group in previous_groups}
    if set(previous_groups_by_id) == set(next_groups_by_id):
        return

    try:
        saved_schedule = admission.saved_schedule
    except SavedSchedule.DoesNotExist:
        return

    visible_before = set(
        get_name_revealed_groups(admission, saved_schedule).values_list("pk", flat=True)
    )
    removed_groups = [
        group
        for group_id, group in previous_groups_by_id.items()
        if group_id not in next_groups_by_id
    ]
    added_groups = [
        group
        for group_id, group in next_groups_by_id.items()
        if group_id not in previous_groups_by_id
    ]

    update_fields = ["updated_at"]
    if saved_schedule.name_visibility == SavedSchedule.NAME_VISIBILITY_COMMITTEE:
        saved_schedule.revealed_groups.set(
            [
                group
                for group_id, group in next_groups_by_id.items()
                if group_id in visible_before
            ]
        )
        saved_schedule.name_visibility = SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY
        update_fields.append("name_visibility")
    else:
        stale_groups = removed_groups + added_groups
        if stale_groups:
            saved_schedule.revealed_groups.remove(*stale_groups)

    record_name_visibility_events(
        saved_schedule,
        [group for group in removed_groups if group.pk in visible_before],
        NameVisibilityAuditEvent.ACTION_HIDDEN,
        actor,
    )
    saved_schedule.save(update_fields=update_fields)


def user_is_committee_member(admission, user):
    return (
        Membership.objects.filter(user=user.pk, group__in=admission.groups.all())
        .exclude(role__in=constants.INACTIVE_MEMBERSHIP_ROLES)
        .exists()
    )


def schedule_response_context(
    admission,
    saved_schedule,
    user,
    is_admin,
    is_recruiter,
    is_interview_admin=False,
):
    hide_schedule = not saved_schedule.is_distributed and not is_interview_admin
    hide_identity = False
    visible_candidate_ids = None
    contact_candidate_ids = None if is_admin else set()
    effective_name_visibility = saved_schedule.name_visibility
    revealed_group_summaries = None

    if is_admin:
        revealed_group_summaries = [
            {"id": str(group.pk), "name": group.name}
            for group in get_name_revealed_groups(admission, saved_schedule).order_by(
                "name"
            )
        ]

    if not is_admin:
        represented_groups = get_representing_groups(admission, user)
        visible_groups = get_user_candidate_visible_groups(
            admission, saved_schedule, user
        )
        if is_recruiter:
            contact_candidate_ids = set(
                str(candidate_id)
                for candidate_id in UserApplication.objects.filter(
                    admission=admission,
                    group_applications__group__in=represented_groups,
                )
                .values_list("pk", flat=True)
                .distinct()
            )
            revealed_groups = get_name_revealed_groups(
                admission, saved_schedule
            ).filter(pk__in=represented_groups)
            effective_name_visibility = (
                SavedSchedule.NAME_VISIBILITY_COMMITTEE
                if represented_groups.exists()
                and not represented_groups.exclude(pk__in=revealed_groups).exists()
                else SavedSchedule.NAME_VISIBILITY_ADMIN_ONLY
            )
        else:
            hide_identity = not visible_groups.exists()
            effective_name_visibility = (
                SavedSchedule.NAME_VISIBILITY_COMMITTEE
                if not hide_identity
                else SavedSchedule.NAME_VISIBILITY_HIDDEN
            )

        visible_candidate_ids = set(
            str(candidate_id)
            for candidate_id in UserApplication.objects.filter(
                admission=admission,
                group_applications__group__in=visible_groups,
            )
            .values_list("pk", flat=True)
            .distinct()
        )

    return {
        "hide_candidate_identity": hide_identity,
        "hide_schedule": hide_schedule,
        "visible_candidate_ids": visible_candidate_ids,
        "contact_candidate_ids": contact_candidate_ids,
        "effective_name_visibility": effective_name_visibility,
        "revealed_group_summaries": revealed_group_summaries,
        "include_deviation_review": is_interview_admin,
    }


def user_is_privileged(admission_slug, user):
    admission = get_object_or_404(Admission, slug=admission_slug)
    return (
        user_is_admission_admin(admission, user)
        or get_representing_groups(admission, user).exists()
    )


def user_is_recruiter(admission_slug, user):
    admission = get_object_or_404(Admission, slug=admission_slug)
    return get_representing_groups(admission, user).exists()
