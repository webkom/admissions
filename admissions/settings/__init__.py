import os
import sys

TESTING = "test" in sys.argv[:2]
EXPLICIT_SETTINGS_MODULE = os.environ.get("DJANGO_SETTINGS_MODULE", "")

if not EXPLICIT_SETTINGS_MODULE or EXPLICIT_SETTINGS_MODULE == __name__:
    if TESTING:
        from .testing import *  # noqa
    else:
        if os.environ.get("ENV_CONFIG") in ["1", "True", "true"]:
            from .production import *  # noqa
        else:
            try:
                from .local import *  # noqa
            except ImportError:
                raise ImportError(
                    "Couldn't load local settings admissions.settings.local"
                )
