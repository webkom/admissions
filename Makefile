help:
	@echo 'ci_settings            - create a committee_admissions/settings/local.py for ci'
	@echo 'dev_settings            - create a committee_admissions/settings/local.py for dev'

ci_settings:
	echo "from .testing import *" > committee_admissions/settings/local.py

dev_settings:
	echo "from .development import *" > committee_admissions/settings/local.py

.PHONY: ci_settings dev_settings
