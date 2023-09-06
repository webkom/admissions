from django.db.models import Q
from rest_framework import permissions

from admissions.admissions import constants

from .models import Admission, GroupApplication, LegoUser, Membership, UserApplication


def cast_as_lego_user(user_obj) -> LegoUser:
    user_obj.__class__ = LegoUser
    return user_obj


def user_is_privileged(admission_slug, user):
    # Return true if the user has some sort of privileges in the admission
    admission = Admission.objects.get(slug=admission_slug)
    for group in admission.admin_groups.all():
        if Membership.objects.filter(user=user.pk, group=group.pk).exists():
            return True
    for group in admission.groups.all():
        if (
            Membership.objects.filter(user=user.pk, group=group.pk)
            .filter(Q(role=constants.LEADER) | Q(role=constants.RECRUITING))
            .exists()
        ):
            return True
    return False


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

        # Allow a user to edit a group if it is a leader or recruiter in that group
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

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True

        # If the user is staff (can edit admissions)
        return request.user.is_staff


class ApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return False

    def has_permission(self, request, view):
        return user_is_privileged(view.kwargs.get("admission_slug"), request.user)


class GroupApplicationPermissions(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if isinstance(obj, GroupApplication):
            request.user.__class__ = LegoUser
            return obj.group == request.user.representative_of_group
        if isinstance(obj, UserApplication):
            return GroupApplication.objects.filter(application=obj).count() == 0

    def has_permission(self, request, view):
        return user_is_privileged(view.kwargs.get("admission_slug"), request.user)
