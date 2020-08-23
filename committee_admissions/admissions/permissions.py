from rest_framework import permissions

from .models import CommitteeApplication, LegoUser, UserApplication


def can_edit_committee(user, committee):
    if user.is_anonymous:
        return False
    if user.is_superuser:
        return True
    user.__class__ = LegoUser
    return committee == user.leader_of_committee


def is_admin(user):
    if user.is_anonymous:
        return False
    user.__class__ = LegoUser
    return user.is_board_member


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

        return request.user.is_superuser

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        return request.user.is_superuser


class ApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return False

    def has_permission(self, request, view):
        return is_admin(request.user)


class CommitteeApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if isinstance(obj, CommitteeApplication):
            request.user.__class__ = LegoUser
            return obj.committee == request.user.leader_of_committee
        if isinstance(obj, UserApplication):
            return CommitteeApplication.objects.filter(application=obj).count() == 0

    def has_permission(self, request, view):
        request.user.__class__ = LegoUser
        # return request.user.is_privileged
        return is_admin(request.user)
