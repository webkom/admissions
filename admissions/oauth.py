from django.db import transaction
from django.db.models import Q

from six.moves.urllib.parse import urljoin
from social_core.backends.oauth import BaseOAuth2
from social_core.exceptions import AuthFailed

from admissions.admissions import constants
from admissions.admissions.models import (
    Admission,
    Group,
    LegoUser,
    Membership,
    UserApplication,
)
from admissions.admissions.schedule_invalidation import invalidate_schedule_scope

VALID_MEMBERSHIP_ROLES = frozenset(role for role, _label in constants.ROLES)


def _parse_lego_id(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.isdigit():
        parsed = int(value)
        return parsed if parsed > 0 else None
    return None


def use_existing_lego_user(details, response, uid=None, user=None, **kwargs):
    """Reuse a fixture/local user before social-auth tries to create one."""
    if user is not None:
        return {"user": user}

    lego_id = _parse_lego_id(
        details.get("lego_id") if isinstance(details, dict) else None
    )
    if lego_id is None:
        lego_id = (
            _parse_lego_id(response.get("id")) if isinstance(response, dict) else None
        )
    if lego_id is None:
        lego_id = _parse_lego_id(uid)
    if lego_id is None:
        return {}

    existing_user = LegoUser.objects.filter(lego_id=lego_id).first()
    return {"user": existing_user} if existing_user is not None else {}


class LegoOAuth2(BaseOAuth2):
    name = "lego"
    ACCESS_TOKEN_METHOD = "POST"
    SCOPE_SEPARATOR = ","
    EXTRA_DATA = [
        ("id", "id"),
        ("expires_in", "expires_in"),
        ("abakusGroups", "abakus_groups"),
        ("profilePicture", "profile_picture"),
    ]

    LEGO_GROUP_NAMES = [
        # Committee admissions
        "Abakus-leder",
        "Arrkom",
        "Bankkom",
        "Bedkom",
        "Fagkom",
        "Koskom",
        "LaBamba",
        "readme",
        "PR",
        "Webkom",
        # Revue admissions
        "RevyStyret",
        "Band",
        "Dans",
        "Kostyme",
        "Manus",
        "PR-revy",
        "Scene",
        "Skuespill",
        "Sosial",
        "Teknikk",
        "Arring",
        # backup admissions
        "backup",
    ]

    def get_scope(self):
        if not Group.objects.all().exists():
            return ["all"]
        return ["user"]

    def api_url(self):
        api_url = self.setting("API_URL")
        if not api_url:
            raise ValueError("Please set the LEGO_API_URL setting.")
        return api_url

    def authorization_url(self):
        return urljoin(self.api_url(), "/authorization/oauth2/authorize/")

    def access_token_url(self):
        return urljoin(self.api_url(), "/authorization/oauth2/token/")

    def get_user_id(self, details, response):
        """
        Required to counteract bug introduced in v5.4.1.

        Casts the id to a string so a strict compare with the string value that is stored in the database will be true.

        Issue tracked in https://github.com/python-social-auth/social-app-django/issues/578
        """
        return str(super().get_user_id(details, response))

    def get_user_details(self, response):
        """Return user details from Lego account"""
        fullname, first_name, last_name = self.get_user_names(
            response.get("fullName"),
            response.get("firstName"),
            response.get("lastName"),
        )
        return {
            "lego_id": response.get("id"),
            "username": response.get("username"),
            "email": response.get("emailAddress") or "",
            "fullname": fullname,
            "first_name": first_name,
            "last_name": last_name,
        }

    def user_data(self, access_token, *args, **kwargs):
        user_data = self._user_data(access_token)

        if not Group.objects.all().exists():
            self._create_initial_groups(access_token)

        return user_data

    def _user_data(self, access_token):
        url = urljoin(self.api_url(), "api/v1/users/oauth2_userdata/")
        return self.get_json(url, headers={"AUTHORIZATION": "Bearer %s" % access_token})

    def _create_initial_groups(self, access_token):
        url = urljoin(self.api_url(), "api/v1/groups/")
        data = self.get_json(url, headers={"AUTHORIZATION": "Bearer %s" % access_token})
        with transaction.atomic():
            for group in data["results"]:
                name = group["name"]
                if name not in self.LEGO_GROUP_NAMES:
                    continue
                id = group["id"]
                description = group["description"]
                logo = group["logo"]
                detail_link = f"https://abakus.no/pages/komiteer/{id}"
                if group["type"] == "revy":
                    detail_link = f"https://abakus.no/pages/revy/{id}"
                Group.objects.create(
                    lego_id=id,
                    description=description,
                    name=name,
                    detail_link=detail_link,
                    logo=logo,
                )
        if len(self.LEGO_GROUP_NAMES) != Group.objects.count():
            raise ImportError(
                "All %s groups were not fetched from the api"
                % len(self.LEGO_GROUP_NAMES)
            )


def _parse_group_data(response):
    if not isinstance(response, dict):
        return None
    raw_groups = response.get("abakusGroups")
    raw_memberships = response.get("memberships")
    if not isinstance(raw_groups, list) or not isinstance(raw_memberships, list):
        return None
    groups_by_id = {}
    for group in raw_groups:
        if not isinstance(group, dict):
            return None
        group_id = _parse_lego_id(group.get("id"))
        if group_id is None:
            return None
        if group_id in groups_by_id:
            return None
        groups_by_id[group_id] = group

    group_data = []
    roles_by_group = {}
    for membership in raw_memberships:
        if not isinstance(membership, dict):
            return None
        role = membership.get("role")
        if role not in VALID_MEMBERSHIP_ROLES:
            return None
        group_id = _parse_lego_id(membership.get("abakusGroup"))
        group = groups_by_id.get(group_id)
        if group is None:
            return None
        previous_role = roles_by_group.get(group_id)
        if previous_role is not None and previous_role != role:
            return None
        roles_by_group[group_id] = role
        group_data.append((group, membership))
    return group_data


def update_custom_user_details(strategy, details, user=None, *args, **kwargs):
    if not user:
        return

    response = kwargs.get("response")
    group_data = _parse_group_data(response)
    if group_data is None:
        raise AuthFailed(
            getattr(strategy, "backend", None),
            "Invalid LEGO membership payload",
        )
    upstream_group_ids = set()
    for group, membership in group_data:
        if membership.get("role") not in VALID_MEMBERSHIP_ROLES:
            continue
        try:
            upstream_group_ids.add(int(group["id"]))
        except (KeyError, TypeError, ValueError):
            continue
    groups_by_lego_id = Group.objects.in_bulk(
        upstream_group_ids,
        field_name="lego_id",
    )

    with transaction.atomic():
        locked_user = LegoUser.objects.select_for_update(no_key=True).get(pk=user.pk)
        old_memberships = list(
            Membership.objects.filter(user=locked_user).select_related("group")
        )
        old_roles_by_group = {}
        for membership in old_memberships:
            old_roles_by_group.setdefault(membership.group_id, set()).add(
                membership.role
            )
        Membership.objects.filter(user=locked_user).delete()
        roles_by_group = {}
        ambiguous_groups = set()
        for group, membership in group_data:
            role = membership.get("role")
            if role not in VALID_MEMBERSHIP_ROLES:
                continue
            try:
                group_id = int(group["id"])
            except (KeyError, TypeError, ValueError):
                continue
            local_group = groups_by_lego_id.get(group_id)
            if local_group is None:
                continue

            previous_membership = roles_by_group.get(local_group.pk)
            if previous_membership is not None and previous_membership[1] != role:
                ambiguous_groups.add(local_group.pk)
            else:
                roles_by_group[local_group.pk] = (local_group, role)

        memberships = []
        new_roles_by_group = {}
        locked_user.is_staff = False
        for group_id, (local_group, role) in roles_by_group.items():
            if group_id in ambiguous_groups:
                continue
            if (
                local_group.name in constants.STAFF_LEADER_GROUPS
                and role == constants.LEADER
            ):
                locked_user.is_staff = True
            memberships.append(
                Membership(user=locked_user, group=local_group, role=role)
            )
            new_roles_by_group.setdefault(local_group.pk, set()).add(role)

        Membership.objects.bulk_create(memberships)
        profile_picture = response.get("profilePicture")
        gender = response.get("gender")
        profile_picture_limit = locked_user._meta.get_field(
            "profile_picture"
        ).max_length
        gender_limit = locked_user._meta.get_field("gender").max_length
        locked_user.profile_picture = (
            profile_picture
            if isinstance(profile_picture, str)
            and len(profile_picture) <= profile_picture_limit
            else ""
        )
        previous_gender = locked_user.gender
        locked_user.gender = (
            gender if isinstance(gender, str) and len(gender) <= gender_limit else ""
        )
        locked_user.save(update_fields=["is_staff", "profile_picture", "gender"])

        relevant_group_ids = set(old_roles_by_group) | set(new_roles_by_group)
        affected_admissions = list(
            Admission.objects.filter(
                Q(groups__id__in=relevant_group_ids)
                | Q(admin_groups__id__in=relevant_group_ids)
            )
            .distinct()
            .prefetch_related("groups", "admin_groups")
        )
        candidate_admission_ids = set()
        if previous_gender != locked_user.gender:
            candidate_admission_ids = set(
                UserApplication.objects.filter(user=locked_user).values_list(
                    "admission_id",
                    flat=True,
                )
            )
            known_admission_ids = {admission.pk for admission in affected_admissions}
            affected_admissions.extend(
                Admission.objects.filter(
                    pk__in=candidate_admission_ids - known_admission_ids
                ).prefetch_related("groups", "admin_groups")
            )

        def is_actionable_interviewer(admission, roles_by_group):
            committee_group_ids = {group.pk for group in admission.groups.all()}
            admin_group_ids = {group.pk for group in admission.admin_groups.all()}
            return any(
                group_id in committee_group_ids
                and any(
                    role not in constants.INACTIVE_MEMBERSHIP_ROLES for role in roles
                )
                or group_id in admin_group_ids
                and any(
                    role in (constants.LEADER, constants.RECRUITING) for role in roles
                )
                for group_id, roles in roles_by_group.items()
            )

        for admission in affected_admissions:
            was_actionable = is_actionable_interviewer(
                admission,
                old_roles_by_group,
            )
            is_actionable = is_actionable_interviewer(
                admission,
                new_roles_by_group,
            )
            gender_affects_scope = previous_gender != locked_user.gender and (
                admission.pk in candidate_admission_ids
                or was_actionable
                or is_actionable
            )
            if was_actionable != is_actionable or gender_affects_scope:
                invalidate_schedule_scope(admission)
