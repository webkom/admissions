import os

from .base import *

SECRET_KEY = "Testing"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql_psycopg2",
        "NAME": "admissions",
        "USER": "admissions",
        "PASSWORD": "",
        "HOST": os.environ.get("DATABASE") or "127.0.0.1",
        "PORT": "5433",
    }
}
