import environ

from .base import *  # noqa

env = environ.Env(DEBUG=(bool, False))

DEBUG = env('DEBUG')
SECRET_KEY = env('SECRET_KEY')
ALLOWED_HOSTS = env('ALLOWED_HOSTS')
SERVER_URL = env('SERVER_URL')
FRONTEND_URL = env('FRONTEND_URL')
SERVER_EMAIL = env('SERVER_EMAIL', default='Abakus <no-reply@abakus.no>')
ENVIRONMENT_NAME = env('ENVIRONMENT_NAME', default='production')

# Database
DATABASES = {'default': env.db()}

SETTINGS_DIR = environ.Path(__file__) - 1

AUTHENTICATION_BACKENDS = [
    'committee_admissions.oauth.LegoOAuth2',
] + AUTHENTICATION_BACKENDS  # noqa

SOCIAL_AUTH_LEGO_KEY = env('AUTH_LEGO_KEY')
SOCIAL_AUTH_LEGO_SECRET = env('AUTH_LEGO_SECRET')
SOCIAL_AUTH_LEGO_API_URL = env('AUTH_LEGO_API_URL')

# Sentry
SENTRY_CLIENT = 'raven.contrib.django.raven_compat.DjangoClient'
RAVEN_DSN = env('RAVEN_DSN')
RAVEN_CONFIG = {
    'dsn': RAVEN_DSN,
    'release': env('RELEASE', default='latest'),
    'environment': ENVIRONMENT_NAME
}
INSTALLED_APPS += [  # noqa
    'raven.contrib.django.raven_compat',
]
MIDDLEWARE = [
    'raven.contrib.django.raven_compat.middleware.SentryResponseErrorIdMiddleware',
] + MIDDLEWARE  # noqa
LOGGING = {
    'version': 1,
    'disable_existing_loggers': True,
    'root': {
        'level': 'WARNING',
        'handlers': ['sentry'],
    },
    'formatters': {
        'verbose': {
            'format': '%(levelname)s %(asctime)s %(module)s '
            '%(process)d %(thread)d %(message)s'
        },
    },
    'handlers': {
        'sentry': {
            'level': 'ERROR',  # To capture more than ERROR, change to WARNING, INFO, etc.
            'class': 'raven.contrib.django.raven_compat.handlers.SentryHandler',
            'tags': {
                'custom-tag': 'x'
            },
        },
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose'
        }
    },
    'loggers': {
        'django.db.backends': {
            'level': 'ERROR',
            'handlers': ['console'],
            'propagate': False,
        },
        'raven': {
            'level': 'DEBUG',
            'handlers': ['console'],
            'propagate': False,
        },
        'sentry.errors': {
            'level': 'DEBUG',
            'handlers': ['console'],
            'propagate': False,
        },
    },
}
