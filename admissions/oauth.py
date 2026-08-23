import logging

from django.db import transaction

from six.moves.urllib.parse import urljoin
from social_core.backends.oauth import BaseOAuth2

from admissions.admissions import constants
from admissions.admissions.models import Group, LegoUser, Membership
from admissions.admissions.session_renewal import stamp_session_start

logger = logging.getLogger(__name__)

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
        # Without this, extra_data never carries a refresh_token, so
        # UserSocialAuth.get_access_token() has nothing to refresh with and
        # every token silently dies at LEGO's expiry. See lego_directory.py.
        ("refresh_token", "refresh_token"),
    ]

    LEGO_GROUP_NAMES = [
        # Central admission administration
        "Hovedstyret",
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

    def _fetch_all_lego_groups(self, access_token):
        """Walk every page of the group list.

        The endpoint is paginated, so reading only the first page made the
        import silently depend on LEGO's page size being larger than the
        list below.
        """
        url = urljoin(self.api_url(), "api/v1/groups/")
        headers = {"AUTHORIZATION": "Bearer %s" % access_token}
        results = []
        seen_urls = set()
        while url and url not in seen_urls:
            seen_urls.add(url)
            page = self.get_json(url, headers=headers)
            results.extend(page.get("results") or [])
            url = page.get("next")
        return results

    def _create_initial_groups(self, access_token):
        results = self._fetch_all_lego_groups(access_token)
        with transaction.atomic():
            for group in results:
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
        missing = sorted(
            set(self.LEGO_GROUP_NAMES)
            - set(Group.objects.values_list("name", flat=True))
        )
        if missing:
            raise ImportError(
                "These groups were not fetched from the api: %s" % ", ".join(missing)
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
        if not isinstance(role, str) or not role:
            # No role at all is a malformed entry, not an unfamiliar one, and
            # a malformed payload still fails closed.
            return None
        if role not in VALID_MEMBERSHIP_ROLES:
            # A role LEGO models and this app does not: skip the membership,
            # do not veto the payload. The sync below
            # already refuses to act on a role it does not model, so rejecting
            # everything here bought no safety - it just meant one unmodelled
            # role in any Abakus group deleted every membership the user had,
            # silently removing them from their own committee. LEGO adds roles
            # we do not carry yet; that must not de-authorise anyone.
            logger.warning("Ignoring membership with unmodelled LEGO role %r", role)
            continue
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

    # Anchors the renewal ceiling: sessions slide forward on real activity but
    # never outlive this stamp by more than ADMISSIONS_SESSION_MAX_LIFETIME.
    request = getattr(strategy, "request", None)
    stamp_session_start(getattr(request, "session", None))

    response = kwargs.get("response")
    if not isinstance(response, dict):
        response = {}
    group_data = _parse_group_data(response)
    if group_data is None:
        group_data = []
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
        Membership.objects.filter(user=user).delete()
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

        # Staff comes straight from the LEGO payload, not from a local Group
        # row: the staff groups (Hovedstyret in particular) have no reason to
        # exist in the local table, so requiring a row here silently revoked
        # the Abakus leader's access on their first login.
        user.is_staff = any(
            group.get("name") in constants.STAFF_LEADER_GROUPS
            and membership.get("role") == constants.LEADER
            for group, membership in group_data
        )

        memberships = []
        for group_id, (local_group, role) in roles_by_group.items():
            if group_id in ambiguous_groups:
                continue
            memberships.append(Membership(user=user, group=local_group, role=role))

        Membership.objects.bulk_create(memberships)
        profile_picture = response.get("profilePicture")
        gender = response.get("gender")
        profile_picture_limit = user._meta.get_field("profile_picture").max_length
        gender_limit = user._meta.get_field("gender").max_length
        user.profile_picture = (
            profile_picture
            if isinstance(profile_picture, str)
            and len(profile_picture) <= profile_picture_limit
            else ""
        )
        user.gender = (
            gender if isinstance(gender, str) and len(gender) <= gender_limit else ""
        )
        user.save(update_fields=["is_staff", "profile_picture", "gender"])
