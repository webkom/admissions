from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    user_is_admission_admin,
    user_is_org_leadership,
    user_is_privileged,
)

from .models import Admission, LegoUser, Membership


def as_lego_user(user_obj) -> LegoUser:
    """Return the request user.

    AUTH_USER_MODEL is LegoUser, so request.user is always a LegoUser
    already; this keeps that assumption in one place instead of mutating
    ``user.__class__``.
    """
    return user_obj


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.user == request.user


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, *_):
        return as_lego_user(request.user).is_staff

    def has_object_permission(self, request, *_):
        return as_lego_user(request.user).is_staff


class IsWebkom(permissions.BasePermission):
    def has_permission(self, request, *_):
        return as_lego_user(request.user).is_member_of_webkom

    def has_object_permission(self, request, *_):
        return as_lego_user(request.user).is_member_of_webkom


class IsActiveAdminGroupMember(permissions.BasePermission):
    """User represents a committee or is an active admission admin.

    Excludes Webkom and God users — they have their own entry points. Used
    only by the read-only administered-admissions endpoint, never by any
    write surface. Committee access is limited to leader/recruiter roles.
    """

    def has_permission(self, request, *_):
        user = as_lego_user(request.user)
        if not user.is_authenticated:
            return False
        if user.is_member_of_webkom or user_is_org_leadership(user):
            return False
        return (
            Admission.objects.filter(
                Q(
                    admin_groups__membership__user=user,
                )
                | Q(
                    groups__membership__user=user,
                    groups__membership__role__in=constants.ADMISSION_ADMIN_ROLES,
                )
            )
            .exclude(
                admin_groups__membership__role__in=constants.INACTIVE_MEMBERSHIP_ROLES
            )
            .exists()
        )


class IsOrgLeadership(permissions.BasePermission):
    """God-listed LEGO ids (the GodUser table): admission-wide admins
    everywhere.

    Kept as its own class rather than folded into IsWebkom so a committee
    that also administers the tool (Webkom) stays distinguishable from the
    organisation's own leadership - they are the same privilege for
    manage-admissions today, but the two can drift apart later.
    """

    def has_permission(self, request, *_):
        return user_is_org_leadership(as_lego_user(request.user))

    def has_object_permission(self, request, *_):
        return user_is_org_leadership(as_lego_user(request.user))


class IsCreatorOfObject(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.created_by == as_lego_user(request.user)


class GroupPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        admissions = Admission.objects.filter(
            groups=obj, closed_from__gte=timezone.now()
        )
        for admission in admissions:
            if user_is_admission_admin(admission, request.user):
                return True

        return (
            Membership.objects.filter(user=request.user.pk, group=obj.pk)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .exists()
        )


class AdmissionPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        # If the user is staff (can edit admissions)
        return request.user.is_staff


class AdminAdmissionPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return user_is_privileged(obj.slug, request.user)

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        # If the user is staff (can edit admissions)
        return request.user.is_staff


class ApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return user_is_privileged(view.kwargs.get("admission_slug"), request.user)

    def has_permission(self, request, view):
        return user_is_privileged(view.kwargs.get("admission_slug"), request.user)
