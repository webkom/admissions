from os import environ
from uuid import UUID, uuid4

from django.conf import settings
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
