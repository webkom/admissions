from .development import *

env = environ.Env(DEBUG=(bool, False))
SENTRY_CLIENT = 'raven.contrib.django.raven_compat.DjangoClient'
RAVEN_DSN = env('RAVEN_DSN')
RAVEN_PUBLIC_DSN = env('RAVEN_PUBLIC_DSN')
RAVEN_CONFIG = {'dsn': RAVEN_DSN, 'release': "22", 'environment': "s"}
INSTALLED_APPS += [  # noqa
    'raven.contrib.django.raven_compat',
]
MIDDLEWARE = [
    'raven.contrib.django.raven_compat.middleware.SentryResponseErrorIdMiddleware',
] + MIDDLEWARE  # noqa
