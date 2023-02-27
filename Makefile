help:
	@echo 'ci_settings            - create a admissions/settings/local.py for ci'
	@echo 'dev_settings           - create a admissions/settings/local.py for dev'
	@echo 'fixme                  - Fix code formatting'

ci_settings:
	echo "from .testing import *" > admissions/settings/local.py

dev_settings:
	echo "from .development import *" > admissions/settings/local.py

fixme:
	docker run --rm -v ${PWD}:/code -it python:3.9-slim "bash" "-c" "cd /code && pip install poetry && poetry install && poetry run isort -rc admissions && poetry run black admissions"

.PHONY: ci_settings dev_settings
