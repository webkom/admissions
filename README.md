# committee-admissions
#### opptak.abakus.no
Recruitment for Abakom.

## Setup project
Requires python 3.6 and a postgresql database. We recommend using
a virtual environment. The `docker-compose.yml` file provides a 
postgres database with correct config with the command
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

Apply migrations and run the project with the following.
```sh
$ ./manage.py migrate
$ ./manage.py runserver
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