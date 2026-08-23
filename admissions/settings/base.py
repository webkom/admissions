"""
Django settings for admissions project.

For more information on this file, see
https://docs.djangoproject.com/en/2.0/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/2.0/ref/settings/
"""

import os

import environ

from .logging import *  # noqa

ADMISSIONS_SOLVER_ENGINE_VERSION = os.environ.get(
    "ADMISSIONS_SOLVER_ENGINE_VERSION", "v1"
)
# Development fixture initialization and Cypress preparation are local-only
# database writes. They must be enabled by an explicitly non-production
# settings module before the management commands will write fixture data.
ALLOW_DEVELOPMENT_INITIALIZATION = False
ALLOW_CYPRESS_FIXTURES = False

# Interview scheduling needs a solve worker deployed alongside the web app.
# Development and tests run with it on; production opts in explicitly, so the
# feature cannot go live before the worker exists.
ADMISSIONS_SCHEDULER_ENABLED = True

# Fadderbarn-derived conflicts, the per-interviewer swap review list, and the
# repair-mode review-scope hard exclusion. A bad snapshot (e.g. a broken
# ranking or a crash in build_conflict_review_lists) can be switched off
# without a deploy - disabling it falls back to manually-declared conflicts
# only, not to any older mechanism (there isn't one anymore).
ADMISSIONS_CONFLICT_REVIEW_V2 = True

# A narrow, read-only LEGO service credential (OAuth2 client-credentials
# grant) used only by the sync_directory_entries management command, never
# in the request path. Empty by default - the command logs why and exits
# cleanly rather than failing when unset, so this is safe to leave
# unconfigured indefinitely (decoys just stay empty). Provisioning the actual
# credential in LEGO is an operational step outside this codebase.
ADMISSIONS_ROSTER_SYNC_CLIENT_ID = ""
ADMISSIONS_ROSTER_SYNC_CLIENT_SECRET = ""

# GENERAL CONFIGURATION ======================================================
BASE_PROJECT_DIR = environ.Path(__file__) - 3  # manage.py level
ROOT_DIR = environ.Path(__file__) - 2  # (admissions/settings/base.py - 2 = admissions/)
FILES_ROOT = ROOT_DIR.path("files/")

# APP CONFIGURATION ===========================================================
DJANGO_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.admin",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework.authtoken",
    "social_django",
    "corsheaders",
    "django_vite",
]

LOCAL_APPS = ["admissions.utils", "admissions.admissions"]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# MIDDLEWARE CONFIGURATION =====================================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.BrokenLinkEmailsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "admissions.utils.middleware.StaleSessionRecoveryMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "admissions.utils.middleware.LoggingMiddleware",
]

# DJANGO REST FRAMEWORK CONFIGURATION ==========================================
REST_FRAMEWORK = {
    # Use Django's standard `django.contrib.auth` permissions,
    # or allow read-only access for unauthenticated users.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_RATES": {
        "application_write": "120/hour",
        "application_read": "120/minute",
        "solve_schedule": "12/hour",
        "solve_status": "120/minute",
        "schedule": "120/minute",
        "availability": "120/minute",
        "candidate_read": "120/minute",
        # Every miss is an outbound call to LEGO, so this is tighter than the
        # other read scopes and has its own bucket: a typeahead must never be
        # able to exhaust an applicant's ability to submit.
        "member_search": "40/minute",
    },
}

# CACHE CONFIGURATION ===========================================================
# uwsgi runs with `processes = 4` (admissions.ini), and DRF throttle counters
# and the member-search cache both need to be visible across all of them - the
# default LocMemCache is per-process, which silently multiplies every
# configured rate limit by the worker count. Backed by Postgres rather than a
# new service so this doesn't require provisioning new infrastructure; see
# migration 0036_cache_table.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

# TEMPLATE CONFIGURATION =======================================================
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [ROOT_DIR.path("templates")()],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# PASSWORD VALIDATION ===========================================================
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]

# INTERNATIONALIZATION ==========================================================
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_L10N = True
USE_TZ = True

# STATIC FILES & MEDIA CONFIGURATION =============================================
STATIC_ROOT = FILES_ROOT.path("static")()
STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]

STATICFILES_DIRS = [
    ROOT_DIR.path("assets")(),
    ROOT_DIR.path("../assets")(),
]

STATIC_URL = "/static/"

MEDIA_ROOT = str(FILES_ROOT.path("media")())
MEDIA_URL = "/media/"

# MISC CONFIGURATION ============================================================
WSGI_APPLICATION = "admissions.wsgi.application"
ROOT_URLCONF = "admissions.urls"
SHELL_PLUS = "ipython"

LOGIN_REDIRECT_URL = "/"
LOGIN_URL = "/login/lego/"
LOGOUT_REDIRECT_URL = "/"

# When using PostgreSQL, it’s recommended to use the built-in JSONB field to store the extracted extra_data.
SOCIAL_AUTH_JSONFIELD_ENABLED = True

# Vite: Frontent assets =======================================================================
DJANGO_VITE_ASSETS_PATH = BASE_PROJECT_DIR.path("assets/bundles")
DJANGO_VITE_MANIFEST_PATH = BASE_PROJECT_DIR.path("assets/vite-manifest.json")()

AUTH_USER_MODEL = "admissions.LegoUser"
SOCIAL_AUTH_USER_FIELDS = ["lego_id", "username", "email", "first_name", "last_name"]

SOCIAL_AUTH_LEGO_KEY = os.environ.get("AUTH_LEGO_KEY")
SOCIAL_AUTH_LEGO_SECRET = os.environ.get("AUTH_LEGO_SECRET")
SOCIAL_AUTH_LEGO_API_URL = os.environ.get("AUTH_LEGO_API_URL")
SOCIAL_AUTH_PIPELINE = (
    # Default pipeline
    "social_core.pipeline.social_auth.social_details",
    "social_core.pipeline.social_auth.social_uid",
    "social_core.pipeline.social_auth.auth_allowed",
    "social_core.pipeline.social_auth.social_user",
    "admissions.oauth.use_existing_lego_user",
    "social_core.pipeline.user.get_username",
    "social_core.pipeline.user.create_user",
    "social_core.pipeline.social_auth.associate_user",
    "social_core.pipeline.social_auth.load_extra_data",
    "social_core.pipeline.user.user_details",
    # Custom pipe
    "admissions.oauth.update_custom_user_details",
)
