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


The `.env` file with secret keys is not included, and a copy of it must ble placed in `./committee-admissions/settings`. The values needed can be found at abakus.no after creating an application there. The project will not run without setting these variables:

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

Now, you need two terminals to run this project, one for frontend and one for backend. 

These are the start commands: 
```sh
$ 
$ python manage.py runserver
$ yarn watch
```

To populate the database with data for development, we have set up factories.
```sh
$ python manage.py shell_plus
$ from committee_admissions.admissions.factories import RandomAdmissionFactory
$ RandomAdmissionFactory.create()
```

## Requirements
We use the package [pip-tools](https://github.com/jazzband/pip-tools) to organize our requirements.
### Adding a new requirement
Add the new package to either `base.in`, `development.in` or 
`production.in` depending on best fit. Then generate a new requirements
file by running
```sh
$ pip-compile requirements/base.in > requirements/base.txt
``` 
To sync your virtual environment with the requirements file, do
```sh
$ pip-sync requirements/development.txt
```
This will install missing packages, install the correct version and 
remove excess packages.
