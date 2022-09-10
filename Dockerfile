FROM node:16 as frontend-builder

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

RUN mkdir /app
COPY requirements /app/requirements
WORKDIR /app

RUN pip install --no-cache -r requirements/production.txt

COPY . /app/
COPY --from=frontend-builder /app/assets/bundles /app/assets/bundles

RUN set -e \
    && ENV_CONFIG=0 python manage.py collectstatic --noinput
