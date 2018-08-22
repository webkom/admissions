from rest_framework import permissions

from committee_admissions.admissions import constants

from .models import Membership


def can_edit_committee(user, committee):
    return Membership.objects.filter(
        user=user, abakus_group__name=committee.name, role=constants.LEADER
    ).exists()


def is_admin(user):
    if user.is_anonymous:
        return False
    return Membership.objects.filter(
        user=user,
        abakus_group__name="Hovedstyret",
    ).exists()


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.user == request.user


class CommitteePermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        return can_edit_committee(request.user, obj)


class AdmissionPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        return is_admin(request.user)

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        return is_admin(request.user)


class ApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return False

    def has_permission(self, request, view):
        return is_admin(request.user)
