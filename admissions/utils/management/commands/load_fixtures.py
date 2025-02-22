import logging
from datetime import timedelta

from django.contrib.sessions.models import Session
from django.core import serializers
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone

from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    LegoUser,
    Membership,
)

log = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Loads initial data from fixtures."

    def add_arguments(self, parser):
        parser.add_argument(
            "--generate",
            action="store_true",
            default=False,
            help="Generate fixtures from the current state of the database",
        )
        parser.add_argument(
            "--gen-sessions",
            action="store_true",
            default=False,
            help="Also generate session fixtures",
        )

    def handle(self, *args, **options):
        self.fixtures = [
            ("groups.json", Group),
            ("users.json", LegoUser),
            ("memberships.json", Membership),
            ("admissions.json", Admission),
            ("admission_group.json", AdmissionGroup),
        ]

        if not options["generate"] or options["gen_sessions"]:
            self.fixtures.append(("sessions.json", Session))

        if options["generate"]:
            log.info("Generating fixtures:")
            self.generate_fixtures()
            log.info("Done")
            return

        log.info("Loading fixtures:")
        self.load_fixtures()
        self.update_dates()
        log.info("Done!")

    def load_fixtures(self):
        for file, _ in self.fixtures:
            path = "admissions/admissions/fixtures/{}".format(file)
            call_command("loaddata", path)

    def update_dates(self):
        """Update timestamps to make them relative to the current timestamp"""

        date = timezone.now().replace(hour=16, minute=15, second=0, microsecond=0)
        for i, admission in enumerate(Admission.objects.all()):
            admission.open_from = date - timedelta(days=1)
            admission.public_deadline = date + timedelta(days=i + 10, hours=4)
            admission.closed_from = date + timedelta(days=i + 10, hours=4)
            admission.save()

        for session in Session.objects.all():
            session.expire_date = date + timedelta(days=1)
            session.save()

    def generate_fixtures(self):
        """Generate fixtures from the current state of the database"""

        for file, model in self.fixtures:
            all_objects = model.objects.all()
            fixture_file = "admissions/admissions/fixtures/{}".format(file)
            with open(fixture_file, "w") as f:
                data = serializers.serialize("json", all_objects, indent=2)
                f.write(data)
