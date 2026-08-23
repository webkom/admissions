from django.contrib.auth import login
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpResponseForbidden
from django.test import RequestFactory, TestCase

from admissions.admissions.models import LegoUser
from admissions.utils.middleware import StaleSessionRecoveryMiddleware


class StaleSessionRecoveryMiddlewareTestCase(TestCase):
    def setUp(self):
        self.user = LegoUser.objects.create(username="stale-session", lego_id=93000)

    def authenticated_request(self, path="/", accept="text/html"):
        request = RequestFactory().get(path, HTTP_ACCEPT=accept)
        SessionMiddleware(lambda request: None).process_request(request)
        request.session.save()
        login(request, self.user, backend="django.contrib.auth.backends.ModelBackend")
        request.user = self.user
        return request

    def test_authenticated_browser_403_logs_out_and_returns_to_landing_page(self):
        request = self.authenticated_request()

        response = StaleSessionRecoveryMiddleware(
            lambda request: HttpResponseForbidden()
        )(request)

        self.assertRedirects(response, "/", fetch_redirect_response=False)
        self.assertNotIn("_auth_user_id", request.session)

    def test_api_403_is_preserved_for_the_frontend(self):
        request = self.authenticated_request("/api/admin/", "application/json")

        response = StaleSessionRecoveryMiddleware(
            lambda request: HttpResponseForbidden()
        )(request)

        self.assertEqual(response.status_code, 403)
        self.assertIn("_auth_user_id", request.session)
