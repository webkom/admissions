from urllib.parse import urlparse

import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

from admissions.utils.sentry import remove_sensitive_data

from .base import *  # noqa

env = environ.Env(DEBUG=(bool, False))

DEBUG = env("DEBUG")
DJANGO_VITE_DEV_MODE = False
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS").split(",")
FRONTEND_URL = env("FRONTEND_URL")
API_URL = env("API_URL")
ENVIRONMENT_NAME = env("ENVIRONMENT_NAME", default="production")
RELEASE = env("RELEASE")

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
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp-relay.gmail.com'
EMAIL_USE_TLS = True
EMAIL_PORT = 587
EMAIL_HOST_USER = 'noreply@abakus.no'
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")

# Sentry
SENTRY_DSN = env("RAVEN_DSN")
sentry_sdk.init(
    dsn=SENTRY_DSN,
    release=RELEASE,
    environment=ENVIRONMENT_NAME,
    integrations=[DjangoIntegration()],
    before_send=remove_sensitive_data,
)


CORS_FRONTEND_URL = urlparse(FRONTEND_URL).netloc
CORS_ORIGIN_WHITELIST = list(
    {
        f"https://{CORS_FRONTEND_URL}",
        f"https://www.{CORS_FRONTEND_URL}",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    }
)
