FROM node:22 AS frontend-builder

RUN mkdir /app
WORKDIR /app
COPY package.json yarn.lock /app/
RUN yarn install --frozen-lockfile

COPY . /app

ARG RELEASE

ENV NODE_ENV=production
ENV RELEASE=${RELEASE}

RUN yarn build

FROM python:3.12
LABEL org.opencontainers.image.authors="Webkom <webkom@abakus.no>"

ARG RELEASE

ENV PYTHONPATH=/app/
ENV PYTHONUNBUFFERED=1

ENV ENV_CONFIG=1
ENV RELEASE=${RELEASE}

RUN python -m pip install --upgrade "pip==26.1.2" \
    && pip install "poetry==2.4.1"

RUN mkdir /app
COPY poetry.lock pyproject.toml /app/
WORKDIR /app

RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-root --no-interaction --no-ansi

RUN useradd --create-home --uid 10001 admissions

COPY --chown=admissions:admissions admissions /app/admissions
COPY --chown=admissions:admissions manage.py admissions.ini /app/
COPY --chown=admissions:admissions --from=frontend-builder /app/assets /app/assets

RUN python manage.py collectstatic --noinput --settings=admissions.settings.build

USER admissions
