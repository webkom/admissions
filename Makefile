ADMISSIONS_HOST ?= 127.0.0.1
ADMISSIONS_PORT ?= 5002
RUNSERVER_ARGS ?= $(ADMISSIONS_HOST):$(ADMISSIONS_PORT)

help:
	@echo 'ci_settings            - create a admissions/settings/local.py for ci'
	@echo 'dev_settings           - create a admissions/settings/local.py for dev'
	@echo 'cypress_fixtures       - prepare deterministic local Cypress data/login'
	@echo 'dev                    - run Django and the solver worker together'
	@echo 'fixme                  - Fix code formatting'

ci_settings:
	echo "from .testing import *" > admissions/settings/local.py

dev_settings:
	echo "from .development import *" > admissions/settings/local.py

cypress_fixtures:
	ALLOW_CYPRESS_FIXTURES=true poetry run python manage.py load_fixtures --cypress

dev:
	@set -e; \
	poetry run python manage.py run_solver_worker & \
	worker_pid=$$!; \
	cleanup() { \
		kill "$$worker_pid" 2>/dev/null || true; \
		wait "$$worker_pid" 2>/dev/null || true; \
	}; \
	trap cleanup EXIT INT TERM; \
	poetry run python manage.py runserver $(RUNSERVER_ARGS)

fixme:
	docker run --rm -v ${PWD}:/code -it python:3.12-slim "bash" "-c" "cd /code && pip install poetry && poetry install && poetry run isort -rc admissions && poetry run black admissions"

.PHONY: ci_settings dev_settings cypress_fixtures dev
