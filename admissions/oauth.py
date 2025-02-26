from django.db import transaction

from six.moves.urllib.parse import urljoin
from social_core.backends.oauth import BaseOAuth2

from admissions.admissions import constants
from admissions.admissions.models import Group, Membership


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
        "Regi",
        "PR-revy",
        "Scene",
        "Skuespill",
        "Sosial",
        "Teknikk",
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
    """This will parse group data,
    and return a [(group, membership),] structure"""
    user_memberships = response["memberships"]
    abakus_groups = response["abakusGroups"]
    group_data = []
    for membership in user_memberships:
        group = list(
            filter(
                lambda abakusGroup: abakusGroup["id"] == membership["abakusGroup"],
                abakus_groups,
            )
        )[0]
        group_data += [(group, membership)]
    return group_data


def update_custom_user_details(strategy, details, user=None, *args, **kwargs):
    """This will run after the social auth pipelies succeeds"""
    if not user:
        return

    group_data = _parse_group_data(kwargs["response"])
    with transaction.atomic():
        # Remove old memberships before creating the new ones
        Membership.objects.filter(user=user).delete()
        user.is_staff = False
        for group, membership in group_data:
            # Leaders of certain groups have staff_permission, which allows them to manage admissions
            if (
                group["name"] in constants.STAFF_LEADER_GROUPS
                and membership["role"] == constants.LEADER
            ):
                user.is_staff = True

            try:
                group = Group.objects.get(lego_id=group["id"])
            except Group.DoesNotExist:
                # Do not save the membership if the group is not part of this admission
                continue

            # For all other group memebers their role is set
            # This is used later on when we check if they are Leader or Recruitment
            Membership.objects.create(user=user, group=group, role=membership["role"])

        user.save()

    user.profile_picture = kwargs["response"]["profilePicture"]
    user.save()
