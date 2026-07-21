from os import environ
from uuid import UUID, uuid4

from django.conf import settings
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.utils.cache import patch_cache_control
from django.utils.deprecation import MiddlewareMixin

from structlog import get_logger

log = get_logger()
development = getattr(settings, "DEVELOPMENT", False)


class LoggingMiddleware(MiddlewareMixin):
    def generate_request_id(self):
        return str(uuid4())

    def process_request(self, request):
        context = {}

        request_id = request.META.get("HTTP_REQUEST_ID", "")
        try:
            context["request_id"] = str(UUID(request_id))
        except (TypeError, ValueError, AttributeError):
            context["request_id"] = self.generate_request_id()

        context["version"] = environ.get("RELEASE", "latest")
        context["system"] = "lego"
        context["environment"] = (
            "development"
            if development
            else getattr(settings, "ENVIRONMENT_NAME", "unknown")
        )
        context["request_method"] = request.method

        request.log = log.new(**context)

    def process_response(self, request, response):
        if request.path.startswith("/api/") or getattr(
            request.user, "is_authenticated", False
        ):
            patch_cache_control(response, private=True, no_store=True)
            response["Pragma"] = "no-cache"
        content_security_policy = getattr(settings, "CONTENT_SECURITY_POLICY", None)
        if content_security_policy:
            response.setdefault("Content-Security-Policy", content_security_policy)
            response.setdefault("Referrer-Policy", "no-referrer")
            response.setdefault(
                "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
            )
        return response


class StaleSessionRecoveryMiddleware:
    """Recover browser sessions that no longer have access to the web app.

    API consumers must receive the original 401/403 response so that the
    frontend can handle it without unexpectedly navigating away. A regular
    browser navigation, however, is more useful when it clears the stale
    session and returns to the public landing page.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        is_browser_navigation = (
            request.method in {"GET", "HEAD"}
            and not request.path.startswith("/api/")
            and request.accepts("text/html")
        )
        if (
            response.status_code == 403
            and is_browser_navigation
            and getattr(request.user, "is_authenticated", False)
        ):
            logout(request)
            return redirect("/")
        return response
