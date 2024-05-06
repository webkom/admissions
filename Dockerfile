FROM node:22 as frontend-builder

RUN mkdir /app
WORKDIR /app
COPY . /app

RUN yarn

ARG RELEASE

ENV NODE_ENV production
ENV RELEASE ${RELEASE}

RUN yarn build

FROM python:3.9
MAINTAINER Abakus Webkom <webkom@abakus.no>

ARG RELEASE

ENV PYTHONPATH /app/
ENV PYTHONUNBUFFERED 1

ENV ENV_CONFIG 1
ENV RELEASE ${RELEASE}

RUN pip install "poetry==1.4.0"

RUN mkdir /app
COPY poetry.lock pyproject.toml /app/
WORKDIR /app

RUN poetry config virtualenvs.create false \
    && poetry install --no-dev --no-interaction --no-ansi


COPY . /app/
COPY --from=frontend-builder /app/assets /app/assets

RUN set -e \
    && ENV_CONFIG=0 python manage.py collectstatic --noinput
