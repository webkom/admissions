from .base import *  # noqa

SECRET_KEY = "collectstatic-only"
DEBUG = False
ALLOWED_HOSTS = []
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
DJANGO_VITE_DEV_MODE = False
