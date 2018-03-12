import os

if os.environ.get('PRODUCTION') == 'True':
    try:
        from .production import *
    except ImportError as e:
        raise ImportError("Couldn't load local settings committee_admissions.settings.production")
else:
    try:
        from .development import *
    except ImportError as e:
        raise ImportError("Couldn't load local settings committee_admissions.settings.local")