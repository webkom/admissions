from unittest import mock

from django.test import RequestFactory, TestCase, override_settings

from admissions.admissions.models import LegoUser
from admissions.utils.middleware import LoggingMiddleware


class SensitiveResponseCachePolicyTestCase(TestCase):
    def test_app_page_sets_csrf_cookie_for_api_mutations(self):
        response = self.client.get("/")

        self.assertIn("csrftoken", response.cookies)

    def test_api_responses_are_never_cacheable(self):
        response = self.client.get("/api/admission/")

        cache_control = response.headers.get("Cache-Control", "")
        self.assertIn("no-store", cache_control)
        self.assertIn("private", cache_control)
        self.assertEqual(response.headers.get("Pragma"), "no-cache")

    @override_settings(CONTENT_SECURITY_POLICY="default-src 'self'")
    def test_production_security_headers_are_applied(self):
        response = self.client.get("/api/admission/")

        self.assertEqual(
            response.headers["Content-Security-Policy"], "default-src 'self'"
        )
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertIn("camera=()", response.headers["Permissions-Policy"])

    def test_profile_data_is_json_escaped_in_page_bootstrap(self):
        user = LegoUser.objects.create_user(
            username="bootstrap-user",
            lego_id=91001,
            first_name='</script><script data-secret="candidate">',
        )
        self.client.force_login(user)

        response = self.client.get("/")
        body = response.content.decode()

        self.assertNotIn('</script><script data-secret="candidate">', body)
        self.assertIn("\\u003C/script\\u003E", body)
        self.assertIn('id="django-data"', body)


class RequestIdPrivacyTestCase(TestCase):
    def test_untrusted_request_id_is_replaced(self):
        request = RequestFactory().get(
            "/api/admission/", HTTP_REQUEST_ID="candidate-name\nforged-log=true"
        )
        middleware = LoggingMiddleware(lambda req: None)

        with mock.patch("admissions.utils.middleware.log.new") as new_log:
            middleware.process_request(request)

        request_id = new_log.call_args.kwargs["request_id"]
        self.assertNotIn("candidate", request_id)
        self.assertEqual(len(request_id), 36)
