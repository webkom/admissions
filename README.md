# committee-admissions

#### opptak.abakus.no

Recruitment for Abakom.

## Runnings LEGO and this repository in parallel

> When working in development you want to have LEGO running (both frontend and backend). This allows you to create a oAuth application from the settings menu in the webapp.

You need a total of **4 terminals**(or shells if you like).

### Terminal 1

Run LEGO by following the [README here](https://github.com/webkom/lego/blob/master/README.md)

### Terminal 2

Run LEGO-WEBAPP by following the [README here](https://github.com/webkom/lego-webapp/blob/master/README.md)

### Terminal 3

Run the committe_admissions backend by doing the following:

Running the backend requires Python 3.6 and a `postgresql` database. The frontend requires `Node`. We recommend using
a virtual environment. Create a `venv` in root using

```sh
$ python3 -m venv venv
$ source venv/bin/activate
$ make dev_settings
```

The `docker-compose.yml` file provides a `postgresql` database. This uses a different port then LEGO, so you can run it in parallel.

```sh
$ docker-compose up -d
```

Install requirements either with the default

```sh
$ pip install -r requirements/development.txt
```

or by first installing [pip-tools](https://github.com/jazzband/pip-tools) and running

```sh
$ pip install pip-tools
$ pip-sync requirements/development.txt
```

The `.env` file with secret keys is not included, but an `example.env` file has been provided in `./committe_admissions/settings`, so that you can simply rename the file and fill in the values. The secrets can be found at **localhost:3000** in the user settings menu after creating an application there. The project will not run without setting these variables.

```sh
# Create a copy of the example env file (run from the root of the project)
$ cp /committee_admissions/settings/example.env /committee_admissions/settings/.env

# Edit the file and change the KEY and SECRET
AUTH_LEGO_KEY="Client ID from oAuth"
AUTH_LEGO_SECRET="Client Secret from oAuth"
AUTH_LEGO_API_URL="http://localhost:8000/"
```

Now you are ready to create some fixtures, migrate the database and run the server.

```sh
# Create a custom admission for development
$ python manage.py create_admission

# Migrate the database migrations
$ python manage.py migrate

# Run the Django server
$ python manage.py runserver
```

> If coding over long periods of time, simply flush the db with `python manage.py flush` and run the server again.

### Terminal 4

In the last terminal you are ready to start the frontend. Simply install the requirement and run the dev-server.

```sh
# Install dependencies
$ yarn

# Start the dev-server
$ yarn watch
```

## Requirements

We use the package [pip-tools](https://github.com/jazzband/pip-tools) to organize our requirements.

### Adding a new requirement

Add the new package to either `base.in`, `development.in` or
`production.in` depending on best fit. Then generate a new requirements
file by running

We use [pip-tools](https://github.com/jazzband/pip-tools) to make the requirement files easy to understand and maintain.
Run the following custom command to update `development.txt` and `production.txt`.

```sh
$ python manage.py compile_requirements
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
$ tox -e isort -e flake8 -e black
```
