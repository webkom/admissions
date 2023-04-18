# admissions

#### [opptak.abakus.no](https://opptak.abakus.no/)

Recruitment for [Abakus](https://abakus.no/).

## Runnings LEGO and this repository in parallel

> When working in development you want to have LEGO running (both frontend and backend). This allows you to create an OAuth2 application from the settings menu in the webapp.

To do this, you need a total of **4 terminals** (or shells if you like).

### Terminal 1

Run LEGO by following the README [here](https://github.com/webkom/lego#readme).

### Terminal 2

Run LEGO-WEBAPP by following the README [here](https://github.com/webkom/lego-webapp#readme).

### Terminal 3

Running the admissions backend requires Python 3.9 and a `postgresql` database.

The backend uses [poetry](https://python-poetry.org/) for dependency management. If you do not have it installed you can follow the installation guide [here](https://python-poetry.org/docs/#installation). Then, the dependencies can be installed or updated with

```sh
$ poetry install
```

This command will also create a virtual environment in which the dependencies are installed, if one has not already been created and activated.

Then, run the following command

```sh
$ make dev_settings
```

The [`docker-compose.yml`](./docker-compose.yml) file provides a `postgresql` database. This uses a different port than LEGO, so you can run it in parallel as follows.

```sh
$ docker-compose up -d
```

#### Secrets

The `.env` file with secret keys is not included, but an [`example.env`](./admissions/settings/example.env) file has been provided in `./admissions/settings`, so that you can simply rename the file and fill in the values.

To access the values to enter, go to the OAuth2 tab in the user settings [menu](http://localhost:3000/users/me/settings/oauth2) in the running dev version of lego-webapp. If you have not already created secrets for the admissions application, create a new application. In the form, enter `http://127.0.0.1:5000/complete/lego/` as the redirect url.

```sh
# Create a copy of the example env file (run from the root of the project)
$ cp admissions/settings/example.env admissions/settings/.env

# Edit the file and change the KEY and SECRET
AUTH_LEGO_KEY="Client ID from OAuth2"
AUTH_LEGO_SECRET="Client Secret from OAuth2"
AUTH_LEGO_API_URL="http://localhost:8000/"
```

Now you are ready to migrate the database and run the server.

```sh
# Migrate the database migrations
$ poetry run python manage.py migrate

# Run the Django server
$ poetry run python manage.py runserver
```

> If coding over long periods of time, or you want to flush the database, run `poetry run python manage.py flush` to flush it, and run the server again with `poetry run python manage.py runserver`.

### Terminal 4

In the last terminal you are ready to start the frontend. The frontend requires `Node`. You simply need to install the requirements and run the dev-server as follows.

```sh
# Install dependencies
$ yarn

# Start the dev-server
$ yarn dev
```

> Finally, you can go to [127.0.0.1:5000](http://127.0.0.1:5000/) and view the admissions page.

To create an admission, first, go to [http://127.0.0.1:5000/login/lego/](http://127.0.0.1:5000/login/lego/) to authorize. Then, click "Administrer opptak" and create an admission. Phew, now you are ready to start developing!

## Requirements

We use the package [pip-tools](https://github.com/jazzband/pip-tools) to organize our requirements.

### Adding a new requirement

Add the new package to either `base.in`, `development.in` or
`production.in` depending on best fit. Then generate a new requirements
file by running

We use [pip-tools](https://github.com/jazzband/pip-tools) to make the requirement files easy to understand and maintain.
Run the following custom command to update `development.txt` and `production.txt`.

```sh
$ poetry run python manage.py compile_requirements
```

Or the manual way

```sh
$ pip-compile requirements/development.in > requirements/development.txt
```

To sync your virtual environment with the requirements file, do

```sh
$ pip-sync requirements/development.txt
```

This will install missing packages, install the correct version and
remove excess packages.

## Creating admissions

Currently when running

```sh
# Create a custom admission for development
$ poetry run python manage.py create_admission
```

you create an admission connected to all groups, if they exist (they are generated the first time you log in). To connect it to a group, this must be done in the shell. Note that when creating groups, you must import the Group model manually, as otherwise it will use the Django Group model instead of our own.

## Run tests

Run django tests using tox. Note that we point at the admissions database running at :5433 if we are running lego and admissions in parallel

```bash
$ DATABASE_PORT=5433 tox -e tests
```

## Code Style

This codebase uses the PEP 8 code style. We enforce this with isort, black & flake8.
In addition to the standards outlined in PEP 8, we have a few guidelines
(see `setup.cfg` for more info):

Format the code with black & isort

```bash
$ make fixme
```

To check if it is formatted properly, run:

```bash
$ DATABASE_PORT=5433 tox -e isort -e flake8 -e black
```
