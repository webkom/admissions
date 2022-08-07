from rest_framework import permissions

from .models import GroupApplication, LegoUser, UserApplication


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit it.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.user == request.user


class GroupPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        user = request.user
        user.__class__ = LegoUser

        # Here obj will be the name of the group
        if obj == user.representative_of_group or user.is_superuser:
            return True

        return False


class AdmissionPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        # If the user is AbakusLeader -> give access
        return request.user.is_superuser

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        # If the user is AbakusLeader -> give access
        return request.user.is_superuser


class ApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return False

    def has_permission(self, request, view):
        user = request.user
        user.__class__ = LegoUser
        return user.is_privileged


class GroupApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if isinstance(obj, GroupApplication):
            request.user.__class__ = LegoUser
            return obj.group == request.user.representative_of_group
        if isinstance(obj, UserApplication):
            return GroupApplication.objects.filter(application=obj).count() == 0

    def has_permission(self, request, view):
        request.user.__class__ = LegoUser
        return request.user.is_privileged
