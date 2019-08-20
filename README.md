# committee-admissions

#### opptak.abakus.no

Recruitment for Abakom.

## Setup project

Running the backend requires Python 3.6 and a `postgresql` database. The frontend requires `Node`. We recommend using
a virtual environment. Create a `venv` in root using

```sh
$ python3 -m venv venv
$ source venv/bin/activate
$ make dev_settings
```

The `docker-compose.yml` file provides a `postgresql` database with correct config with the command

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

The `.env` file with secret keys is not included, but an `example.env` file has been provided in `./committe_admissions/settings`, so that you can simply rename the file and fill in the values. The secrets can be found at abakus.no after creating an application there. The project will not run without setting these variables.

```sh
AUTH_LEGO_KEY="INSERT KEY"
AUTH_LEGO_SECRET="INSERT SECRET"
AUTH_LEGO_API_URL="https://lego.abakus.no"
```

Now migrate the database and install frontend dependencies:

```sh
$ python manage.py migrate
$ yarn
```

Now, you need two terminals to run this project, one for frontend and one for backend. Make sure the backend one has activated the virtualenv.

These are the start commands:

```sh
$ python manage.py runserver
$ yarn watch
```

To populate the database with data for development, we use a custom command for creating an admission.

```sh
$ python manage.py create_admission
```

If coding over long periods of time, you want to update the dates that the admission is open (since it will eventually close). Either do it manually from shell, or simply flush the db (`python manage.py flush`) and run the above command again.

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
