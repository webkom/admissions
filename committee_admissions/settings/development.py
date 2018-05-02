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

SETTINGS_DIR = environ.Path(__file__) - 1

env = environ.Env()
env_file = str(SETTINGS_DIR.path('.env'))
env.read_env(env_file)

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

INTERNAL_IPS = [
    '127.0.0.1',
]

AUTHENTICATION_BACKENDS = [
    'committee_admissions.oauth.LegoOAuth2',
] + AUTHENTICATION_BACKENDS

SOCIAL_AUTH_LEGO_KEY = env('AUTH_LEGO_KEY')
SOCIAL_AUTH_LEGO_SECRET = env('AUTH_LEGO_SECRET')
SOCIAL_AUTH_LEGO_API_URL = env('AUTH_LEGO_API_URL')

CORS_ORIGIN_WHITELIST = ['127.0.0.1:3000', 'localhost:3000']
