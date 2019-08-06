from urllib.parse import urlparse

from .base import *  # noqa

env = environ.Env(DEBUG=(bool, False))

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")
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
    "committee_admissions.oauth.LegoOAuth2"
] + AUTHENTICATION_BACKENDS  # noqa

# Sentry
SENTRY_CLIENT = "raven.contrib.django.raven_compat.DjangoClient"
RAVEN_DSN = env("RAVEN_DSN")
RAVEN_PUBLIC_DSN = env("RAVEN_PUBLIC_DSN")
RAVEN_CONFIG = {"dsn": RAVEN_DSN, "release": RELEASE, "environment": ENVIRONMENT_NAME}
INSTALLED_APPS += ["raven.contrib.django.raven_compat"]  # noqa
MIDDLEWARE = [
    "raven.contrib.django.raven_compat.middleware.SentryResponseErrorIdMiddleware"
] + MIDDLEWARE  # noqa

CORS_FRONTEND_URL = urlparse(FRONTEND_URL).netloc
CORS_ORIGIN_WHITELIST = list(
    {
        CORS_FRONTEND_URL,
        f"www.{CORS_FRONTEND_URL}",
        "127.0.0.1:8000",
        "localhost:8000",
        "localhost:3000",
        "127.0.0.1:3000",
    }
)
