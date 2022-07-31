from django.db import transaction

from six.moves.urllib.parse import urljoin
from social_core.backends.oauth import BaseOAuth2

from committee_admissions.admissions import constants
from committee_admissions.admissions.models import Committee, Membership


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
        "Arrkom",
        "Bankkom",
        "Bedkom",
        "Fagkom",
        "Koskom",
        "LaBamba",
        "readme",
        "PR",
        "Webkom",
    ]

    def get_scope(self):
        if not Committee.objects.all().exists():
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

    def get_user_details(self, response):
        """Return user details from Lego account"""
        fullname, first_name, last_name = self.get_user_names(
            response.get("fullName"),
            response.get("firstName"),
            response.get("lastName"),
        )
        return {
            "username": response.get("username"),
            "email": response.get("emailAddress") or "",
            "fullname": fullname,
            "first_name": first_name,
            "last_name": last_name,
        }

    def user_data(self, access_token, *args, **kwargs):
        user_data = self._user_data(access_token)

        if not Committee.objects.all().exists():
            self._create_initial_committees(access_token)

        return user_data

    def _user_data(self, access_token):
        url = urljoin(self.api_url(), "api/v1/users/oauth2_userdata/")
        return self.get_json(url, headers={"AUTHORIZATION": "Bearer %s" % access_token})

    def _create_initial_committees(self, access_token):
        url = urljoin(self.api_url(), "api/v1/groups/")
        data = self.get_json(url, headers={"AUTHORIZATION": "Bearer %s" % access_token})
        with transaction.atomic():
            for committee in data["results"]:
                name = committee["name"]
                if name not in self.LEGO_GROUP_NAMES:
                    continue
                pk = committee["id"]
                description = committee["description"]
                logo = committee["logo"]
                detail_link = f"https://abakus.no/pages/komiteer/{pk}"
                Committee.objects.create(
                    pk=pk,
                    description=description,
                    name=name,
                    detail_link=detail_link,
                    logo=logo,
                )
        if len(self.LEGO_GROUP_NAMES) != Committee.objects.count():
            raise ImportError(
                "All %s groups were not fetched from the api"
                % len(self.LEGO_GROUP_NAMES)
            )


def parse_group_data(response):
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

    group_data = parse_group_data(kwargs["response"])
    with transaction.atomic():
        # Remove old memberships before creating the new ones
        Membership.objects.filter(user=user).delete()
        user.is_superuser = False
        for group, membership in group_data:
            # This check finds the leader of Abakus by looking at the group leader
            # of Hovedstyret. This is the only superuser of this application.
            if (
                group["name"] == "Hovedstyret"
                and membership["role"] == constants.LEADER
            ):
                user.is_superuser = True
                continue

            try:
                committee = Committee.objects.get(pk=group["id"])
            except Committee.DoesNotExist:
                # Do not save the membership if the group is not part of this admission
                continue

            # For all other committee memebers their role is set
            # This is used later on when we check if they are Leader or Recruitment
            Membership.objects.create(
                user=user, committee=committee, role=membership["role"]
            )

        user.save()

    user.profile_picture = kwargs["response"]["profilePicture"]
    user.save()
