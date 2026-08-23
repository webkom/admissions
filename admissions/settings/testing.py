import os
import sys

from django.core.management.commands.runserver import Command as runserver

from .base import *

env = environ.Env(DEBUG=(bool, False))
ADMISSIONS_SOLVER_ENGINE_VERSION = "v2"

# GENERAL CONFIGURATION =======================================================
DEBUG = True
# `manage.py test` never runs a frontend build first (no vite-manifest.json
# on disk), so manifest-mode django_vite fails to render any page that hits
# the app shell. Dev mode emits script tags that point at a dev server
# instead of reading the manifest, which is all the unit test suite needs -
# none of those tests actually fetch the linked JS/CSS. Scoped to the test
# runner specifically (mirrors the TESTING check in settings/__init__.py) -
# this same settings module also backs the Cypress backend's `runserver`,
# which genuinely does have a real manifest (build-frontend runs first) and
# would break in dev mode, since no Vite dev server is running there.
DJANGO_VITE_DEV_MODE = "test" in sys.argv[:2]
ALLOW_DEVELOPMENT_INITIALIZATION = True
ALLOW_CYPRESS_FIXTURES = env.bool("ALLOW_CYPRESS_FIXTURES", default=False)
ALLOW_SYNTHETIC_SOLVER_INPUT = True
ALLOW_UNMARKED_SYNTHETIC_SOLVER_INPUT = True
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    scope: "10000/minute" for scope in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
}
SECRET_KEY = "secretkeythatisnotsosecret"
runserver.default_port = "5000"

API_URL = env("API_URL", default="/api")

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

ALLOWED_HOSTS = ("*",)
FRONTEND_URL = env("FRONTEND_URL", default="127.0.0.1:5000")

AUTHENTICATION_BACKENDS = ["admissions.oauth.LegoOAuth2"] + AUTHENTICATION_BACKENDS

# DATABASE CONFIGURATION ======================================================
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql_psycopg2",
        "NAME": "admissions",
        "USER": "admissions",
        "PASSWORD": "",
        "HOST": os.environ.get("DATABASE") or "127.0.0.1",
        "PORT": os.environ.get("DATABASE_PORT") or "5432",
    }
}
