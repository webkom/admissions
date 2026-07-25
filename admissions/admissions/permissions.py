from django.db.models import Q
from rest_framework import permissions

from admissions.admissions import constants
from admissions.admissions.admission_access import (
    user_is_admission_admin,
    user_is_privileged,
    user_is_recruiter,
)

from .models import Admission, LegoUser, Membership


def cast_as_lego_user(user_obj) -> LegoUser:
    user_obj.__class__ = LegoUser
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
        return cast_as_lego_user(request.user).is_staff

    def has_object_permission(self, request, *_):
        return cast_as_lego_user(request.user).is_staff


class IsWebkom(permissions.BasePermission):
    def has_permission(self, request, *_):
        return cast_as_lego_user(request.user).is_member_of_webkom

    def has_object_permission(self, request, *_):
        return cast_as_lego_user(request.user).is_member_of_webkom


class IsCreatorOfObject(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.created_by == cast_as_lego_user(request.user)


class GroupPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        admissions = Admission.objects.filter(groups=obj)
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
