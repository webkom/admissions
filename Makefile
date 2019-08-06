help:
	@echo 'ci_settings            - create a committee_admissions/settings/local.py for ci'
	@echo 'dev_settings           - create a committee_admissions/settings/local.py for dev'
	@echo 'fixme                  - Fix code formatting'

ci_settings:
	echo "from .testing import *" > committee_admissions/settings/local.py

dev_settings:
	echo "from .development import *" > committee_admissions/settings/local.py

fixme:
	docker run --rm -v ${PWD}:/code -it python:3.7-slim "bash" "-c" "cd /code && pip install -r requirements/black.txt -r requirements/isort.txt && isort -rc committee_admissions && black committee_admissions"

.PHONY: ci_settings dev_settings
