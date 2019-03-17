"""
Django settings for committee_admissions project.

For more information on this file, see
https://docs.djangoproject.com/en/2.0/topics/settings/

For the full list of settings and their values, see
https://docs.djangoproject.com/en/2.0/ref/settings/
"""
import os

import environ

from .logging import *  # noqa

# GENERAL CONFIGURATION ======================================================
BASE_PROJECT_DIR = environ.Path(__file__) - 3  # manage.py level
ROOT_DIR = (
    environ.Path(__file__) - 2
)  # (committee_admissions/settings/base.py - 2 = committee_admissions/)
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
    "django_extensions",
    "rest_framework",
    "rest_framework.authtoken",
    "social_django",
    "corsheaders",
    "webpack_loader",
]

LOCAL_APPS = ["committee_admissions.utils", "committee_admissions.admissions"]

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
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "committee_admissions.utils.middleware.LoggingMiddleware",
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

STATICFILES_DIRS = [BASE_PROJECT_DIR.path("assets")(), ROOT_DIR.path("assets")()]

STATIC_URL = "/static/"

MEDIA_ROOT = str(FILES_ROOT.path("media")())
MEDIA_URL = "/media/"

# MISC CONFIGURATION ============================================================
WSGI_APPLICATION = "committee_admissions.wsgi.application"
ROOT_URLCONF = "committee_admissions.urls"
SHELL_PLUS = "ipython"

LOGIN_REDIRECT_URL = "/"
LOGIN_URL = "/login/lego/"
LOGOUT_REDIRECT_URL = "/"

# When using PostgreSQL, it’s recommended to use the built-in JSONB field to store the extracted extra_data.
SOCIAL_AUTH_POSTGRES_JSONFIELD = True

# WEBPACK =======================================================================
WEBPACK_LOADER = {
    "DEFAULT": {
        "BUNDLE_DIR_NAME": "bundles/",
        "STATS_FILE": BASE_PROJECT_DIR.path("webpack-stats.json")(),
    }
}
SOCIAL_AUTH_LEGO_KEY = os.environ.get("AUTH_LEGO_KEY")
SOCIAL_AUTH_LEGO_SECRET = os.environ.get("AUTH_LEGO_SECRET")
SOCIAL_AUTH_LEGO_API_URL = os.environ.get("AUTH_LEGO_API_URL")

SOCIAL_AUTH_PIPELINE = (
    # Default pipeline
    "social_core.pipeline.social_auth.social_details",
    "social_core.pipeline.social_auth.social_uid",
    "social_core.pipeline.social_auth.auth_allowed",
    "social_core.pipeline.social_auth.social_user",
    "social_core.pipeline.user.get_username",
    "social_core.pipeline.user.create_user",
    "social_core.pipeline.social_auth.associate_user",
    "social_core.pipeline.social_auth.load_extra_data",
    "social_core.pipeline.user.user_details",
    # Custom pipe
    "committee_admissions.oauth.update_custom_user_details",
)
