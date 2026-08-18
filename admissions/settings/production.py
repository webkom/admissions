from urllib.parse import urlparse

import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

from admissions.utils.sentry import remove_sensitive_data

from .base import *  # noqa

env = environ.Env(DEBUG=(bool, False))

DEBUG = env("DEBUG")
# Keep the Cypress credential/seeding path impossible to opt into through
# production environment variables.
ALLOW_CYPRESS_FIXTURES = False
DJANGO_VITE_DEV_MODE = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS").split(",")
FRONTEND_URL = env("FRONTEND_URL")
API_URL = env("API_URL")
ENVIRONMENT_NAME = env("ENVIRONMENT_NAME", default="production")
RELEASE = env("RELEASE")
DATA_UPLOAD_MAX_MEMORY_SIZE = env.int(
    "DATA_UPLOAD_MAX_MEMORY_SIZE", default=2 * 1024 * 1024
)

# Database
DATABASES = {"default": env.db()}

SETTINGS_DIR = environ.Path(__file__) - 1

SOCIAL_AUTH_LEGO_KEY = env("AUTH_LEGO_KEY")
SOCIAL_AUTH_LEGO_SECRET = env("AUTH_LEGO_SECRET")
SOCIAL_AUTH_LEGO_API_URL = env("AUTH_LEGO_API_URL")

AUTHENTICATION_BACKENDS = [
    "admissions.oauth.LegoOAuth2"
] + AUTHENTICATION_BACKENDS  # noqa

# Email
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp-relay.gmail.com"
EMAIL_USE_TLS = True
EMAIL_PORT = 587
EMAIL_HOST_USER = "noreply@abakus.no"
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")

# Sentry
SENTRY_DSN = env("RAVEN_DSN")
sentry_sdk.init(
    dsn=SENTRY_DSN,
    release=RELEASE,
    environment=ENVIRONMENT_NAME,
    integrations=[DjangoIntegration()],
    before_send=remove_sensitive_data,
    include_local_variables=False,
    max_request_body_size="never",
    send_default_pii=False,
)

connect_origins = {"'self'"}
for external_url in (SENTRY_DSN, API_URL):
    parsed_external_url = urlparse(external_url)
    if parsed_external_url.scheme in ("http", "https") and parsed_external_url.netloc:
        connect_origins.add(
            f"{parsed_external_url.scheme}://{parsed_external_url.netloc}"
        )
CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        f"connect-src {' '.join(sorted(connect_origins))}",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
    )
)


parsed_frontend_url = urlparse(
    FRONTEND_URL if "://" in FRONTEND_URL else f"https://{FRONTEND_URL}"
)
if parsed_frontend_url.scheme != "https" or not parsed_frontend_url.netloc:
    raise ValueError("FRONTEND_URL must be an HTTPS URL or hostname")
FRONTEND_ORIGIN = f"https://{parsed_frontend_url.netloc}"
CORS_ALLOWED_ORIGINS = [FRONTEND_ORIGIN]
CSRF_TRUSTED_ORIGINS = [FRONTEND_ORIGIN]

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
# Fails closed: the scheduler stays off until this is set true on BOTH the web
# service and the solve worker. Deploy the worker first, watch it idle cleanly,
# then flip the flag — staging before production.
ADMISSIONS_SCHEDULER_ENABLED = env.bool(
    "ADMISSIONS_SCHEDULER_ENABLED",
    default=False,
)

SESSION_COOKIE_AGE = env.int("SESSION_COOKIE_AGE", default=8 * 60 * 60)
# Sessions slide forward on real activity (see admissions.session_renewal) but
# never outlive this ceiling measured from login.
ADMISSIONS_SESSION_MAX_LIFETIME = env.int(
    "ADMISSIONS_SESSION_MAX_LIFETIME", default=12 * 60 * 60
)
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 365)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
