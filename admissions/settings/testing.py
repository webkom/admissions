import os

from django.core.management.commands.runserver import Command as runserver

from .base import *

env = environ.Env(DEBUG=(bool, False))

# GENERAL CONFIGURATION =======================================================
DEBUG = True
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
