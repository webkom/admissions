from six.moves.urllib.parse import urljoin
from social_core.backends.oauth import BaseOAuth2
from social_core.exceptions import AuthFailed


class LegoOAuth2(BaseOAuth2):

    name = 'lego'
    ACCESS_TOKEN_METHOD = 'POST'
    SCOPE_SEPARATOR = ','
    EXTRA_DATA = [
        ('id', 'id'),
        ('expires_in', 'expires_in'),
    ]

    def api_url(self):
        api_url = self.setting('API_URL')
        if not api_url:
            raise ValueError('Please set the LEGO_API_URL setting.')
        return api_url

    def authorization_url(self):
        return urljoin(self.api_url(), '/authorization/oauth2/authorize/')

    def access_token_url(self):
        return urljoin(self.api_url(), '/authorization/oauth2/token/')

    def get_user_details(self, response):
        """Return user details from Lego account"""
        fullname, first_name, last_name = self.get_user_names(
            response.get('fullName'),
            response.get('firstName'),
            response.get('lastName')
        )
        return {'username': response.get('username'),
                'email': response.get('email') or '',
                'fullname': fullname,
                'first_name': first_name,
                'last_name': last_name}

    def user_data(self, access_token, *args, **kwargs):
        user_data = self._user_data(access_token)

        if not user_data.get('isStudent'):
            raise AuthFailed('You must be a verified student.')

        return user_data

    def _user_data(self, access_token):
        url = urljoin(self.api_url(), 'api/v1/users/me/')
        return self.get_json(url, headers={'AUTHORIZATION': 'Bearer %s' % access_token})