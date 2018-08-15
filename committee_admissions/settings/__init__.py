import os
import sys

TESTING = 'test' in sys.argv[:2]

if TESTING:
    from .testing import *  # noqa
else:
    if os.environ.get('ENV_CONFIG') in ['1', 'True', 'true']:
        from .production import *  # noqa
    else:
        try:
            from .local import *  # noqa
        except ImportError as e:
            raise ImportError('Couldn\'t load local settings committee_admissions.settings.local')
