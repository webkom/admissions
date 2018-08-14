import environ

from .base import *

SECRET_KEY = 'RIP'
DEBUG = False
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': 'admissions',
        'USER': 'admissions',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '5900',
    }
}

# GENERAL CONFIGURATION =======================================================
DEBUG = True
SECRET_KEY = 'secretkeythatisnotsosecret'

# DATABASE CONFIGURATION ======================================================
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': 'admissions',
        'USER': 'admissions',
        'PASSWORD': '',
        'HOST': '127.0.0.1',
        'PORT': '5900',
    }
}

SETTINGS_DIR = environ.Path(__file__) - 1

AUTHENTICATION_BACKENDS = [
    'committee_admissions.oauth.LegoOAuth2',
] + AUTHENTICATION_BACKENDS

SOCIAL_AUTH_LEGO_KEY = env('AUTH_LEGO_KEY')
SOCIAL_AUTH_LEGO_SECRET = env('AUTH_LEGO_SECRET')
SOCIAL_AUTH_LEGO_API_URL = env('AUTH_LEGO_API_URL')
