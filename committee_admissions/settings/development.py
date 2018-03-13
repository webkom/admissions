from .base import *


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

# APP CONFIGURATION ============================================================
INSTALLED_APPS += [
    'debug_toolbar',
]

# MIDDLEWARE CONFIGURATION =====================================================
MIDDLEWARE += [
    'debug_toolbar.middleware.DebugToolbarMiddleware',
]

# DEBUG-TOOLBAR CONFIGURATION ==================================================
DEBUG_TOOLBAR_PANELS = [
    'debug_toolbar.panels.versions.VersionsPanel',
    'debug_toolbar.panels.timer.TimerPanel',
    'debug_toolbar.panels.settings.SettingsPanel',
    'debug_toolbar.panels.headers.HeadersPanel',
    'debug_toolbar.panels.request.RequestPanel',
    'debug_toolbar.panels.sql.SQLPanel',
    'debug_toolbar.panels.templates.TemplatesPanel',
    'debug_toolbar.panels.cache.CachePanel',
    'debug_toolbar.panels.signals.SignalsPanel',
    'debug_toolbar.panels.logging.LoggingPanel',
    'debug_toolbar.panels.redirects.RedirectsPanel',
]

INTERNAL_IPS = ['127.0.0.1', ]
