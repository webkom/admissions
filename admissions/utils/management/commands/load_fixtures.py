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
    GroupApplication,
    LegoUser,
    Membership,
    UserApplication,
)

log = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Loads initial data from fixtures."
    seeded_admission_ids = (
        "9cb0db0f-0139-439c-ad4b-149533a05b33",
        "64fc34b6-d597-4df2-8ecd-48c3380df456",
        "a5a113af-ed26-4f61-80d5-3b0c4923c28c",
    )
    seeded_user_ids = (
        "40667e62-e5fc-4f97-83f0-f5d6b4326652",
        "a8ef4e3d-9e1f-44f3-8ed2-8d1d2d147404",
    )
    seeded_application_ids = (
        "ea3a8468-32f2-4a2a-8503-5245c9602c01",
        "ea3a8468-32f2-4a2a-8503-5245c9602c02",
        "ea3a8468-32f2-4a2a-8503-5245c9602c03",
        "ea3a8468-32f2-4a2a-8503-5245c9602c04",
        "ea3a8468-32f2-4a2a-8503-5245c9602c05",
        "ea3a8468-32f2-4a2a-8503-5245c9602c06",
    )

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
            ("candidate_users.json", LegoUser),
            ("memberships.json", Membership),
            ("admissions.json", Admission),
            ("admission_group.json", AdmissionGroup),
            ("applications.json", UserApplication),
            ("group_applications.json", GroupApplication),
        ]

        if not options["generate"] or options["gen_sessions"]:
            self.fixtures.append(("sessions.json", Session))

        if options["generate"]:
            log.info("Generating fixtures:")
            self.generate_fixtures()
            log.info("Done")
            return

        self.clear_seeded_admission_relationships()
        log.info("Loading fixtures:")
        self.load_fixtures()
        self.update_dates()
        log.info("Done!")

    def clear_seeded_admission_relationships(self):
        UserApplication.objects.filter(id__in=self.seeded_application_ids).delete()
        seeded_admissions = Admission.objects.filter(id__in=self.seeded_admission_ids)
        AdmissionGroup.objects.filter(admission__in=seeded_admissions).delete()
        for admission in seeded_admissions:
            admission.admin_groups.clear()
        # Fixtures do not remove old rows. Clear memberships so a changed seed
        # role (for example leader -> member) takes effect on existing local DBs.
        Membership.objects.filter(user_id__in=self.seeded_user_ids).delete()

    def load_fixtures(self):
        for file, _ in self.fixtures:
            path = "admissions/admissions/fixtures/{}".format(file)
            call_command("loaddata", path)

    def update_dates(self):
        """Update timestamps to make them relative to the current timestamp"""

        date = timezone.now().replace(hour=16, minute=15, second=0, microsecond=0)
        schedules = {
            "webkom-open": (
                date - timedelta(days=1),
                date + timedelta(days=365 * 100),
                date + timedelta(days=365 * 100),
            ),
            "webkom-past-deadline": (
                date - timedelta(days=30),
                date + timedelta(days=-2, hours=4),
                date + timedelta(days=-1, hours=4),
            ),
            "webkom-no-admin": (
                date - timedelta(days=30),
                date + timedelta(days=-2, hours=4),
                date + timedelta(days=-1, hours=4),
            ),
        }
        for i, admission in enumerate(Admission.objects.all()):
            open_from, public_deadline, closed_from = schedules.get(
                admission.slug,
                (
                    date - timedelta(days=1),
                    date + timedelta(days=i + 10, hours=4),
                    date + timedelta(days=i + 10, hours=4),
                ),
            )
            admission.open_from = open_from
            admission.public_deadline = public_deadline
            admission.closed_from = closed_from
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
