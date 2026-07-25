import json
import logging
import secrets
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.sessions.models import Session
from django.core import serializers
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from admissions.admissions.admission_access import user_is_admission_admin
from admissions.admissions.models import (
    Admission,
    AdmissionGroup,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    SolveJob,
    UserApplication,
)

log = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Loads initial data from fixtures."
    cypress_credentials_filename = ".cypress-fixture-credentials.json"
    cypress_admission_id = "9cb0db0f-0139-439c-ad4b-149533a05b33"
    cypress_admission_slug = "webkom-open"
    cypress_admin_id = "40667e62-e5fc-4f97-83f0-f5d6b4326652"
    cypress_admin_username = "webkom"
    cypress_candidate_ids = (
        "ea3a8468-32f2-4a2a-8503-5245c9602c01",
        "ea3a8468-32f2-4a2a-8503-5245c9602c02",
        "ea3a8468-32f2-4a2a-8503-5245c9602c03",
    )
    seeded_admission_ids = (
        cypress_admission_id,
        "64fc34b6-d597-4df2-8ecd-48c3380df456",
        "a5a113af-ed26-4f61-80d5-3b0c4923c28c",
    )
    seeded_user_ids = (
        cypress_admin_id,
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
            "--cypress",
            action="store_true",
            default=False,
            help=(
                "Prepare deterministic scheduler data and a one-time login "
                "credential for Cypress. Requires ALLOW_CYPRESS_FIXTURES."
            ),
        )

    def handle(self, *args, **options):
        prepare_cypress = options["cypress"]
        credentials_path = self.cypress_credentials_path()
        if prepare_cypress and not getattr(settings, "ALLOW_CYPRESS_FIXTURES", False):
            raise CommandError(
                "Cypress fixture preparation is disabled by this settings module."
            )

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

        if options["generate"]:
            if prepare_cypress:
                raise CommandError("--generate and --cypress cannot be combined.")
            log.info("Generating fixtures:")
            self.generate_fixtures()
            log.info("Done")
            return

        if not prepare_cypress:
            self.clear_seeded_admission_relationships()
            log.info("Loading fixtures:")
            self.load_fixtures()
            self.update_dates()
            log.info("Done!")
            return

        password = secrets.token_urlsafe(32)
        try:
            with transaction.atomic():
                self.clear_seeded_admission_relationships()
                log.info("Loading fixtures:")
                self.load_fixtures()
                self.update_dates()
                self.prepare_cypress_state(password)
                self.write_cypress_credentials(credentials_path, password)
        except Exception:
            credentials_path.unlink(missing_ok=True)
            raise
        log.info("Done!")

    def cypress_credentials_path(self):
        return (
            Path(str(settings.BASE_PROJECT_DIR)).resolve()
            / self.cypress_credentials_filename
        )

    def prepare_cypress_state(self, password):
        try:
            admission = Admission.objects.get(
                pk=self.cypress_admission_id,
                slug=self.cypress_admission_slug,
            )
            admin = LegoUser.objects.get(
                pk=self.cypress_admin_id,
                username=self.cypress_admin_username,
                is_active=True,
            )
        except (Admission.DoesNotExist, LegoUser.DoesNotExist) as exc:
            raise CommandError(
                "The exact Cypress admission and administrator fixtures are required."
            ) from exc

        if not user_is_admission_admin(admission, admin):
            raise CommandError(
                "The Cypress fixture user is not an administrator for webkom-open."
            )

        # The static fixture loader updates known rows but does not remove
        # unrelated memberships left in the same committee by an earlier local
        # run. Those rows change the scheduler participant count and make the
        # Cypress baseline nondeterministic.
        Membership.objects.filter(group__in=admission.groups.all()).exclude(
            user_id__in=self.seeded_user_ids
        ).delete()
        Session.objects.all().delete()

        # A failed or interrupted public-application spec can leave the fixture
        # administrator with an application whose generated primary key is not
        # present in the static fixture set. Reset that user-owned state so
        # repeated Cypress runs always start from the same application form.
        UserApplication.objects.filter(
            admission=admission,
            user=admin,
        ).delete()

        applications = list(
            UserApplication.objects.filter(
                admission=admission,
                pk__in=self.cypress_candidate_ids,
            )
            .select_related("user")
            .order_by("created_at")
        )
        if {str(application.pk) for application in applications} != set(
            self.cypress_candidate_ids
        ):
            raise CommandError(
                "The complete Cypress candidate fixture set is required."
            )

        admin.set_password(password)
        admin.save(update_fields=["password"])

        start_date = timezone.localdate() + timedelta(days=3)
        date_text = start_date.isoformat()
        minutes = (14 * 60, 15 * 60, 16 * 60)
        enabled_slots = [f"{date_text}|{minute}" for minute in minutes]
        reviewed_candidate_ids = [str(application.pk) for application in applications]
        panel_name = admin.get_full_name() or admin.username
        schedule = [
            {
                "candidate_id": str(application.pk),
                "candidate": application.user.get_full_name()
                or application.user.username,
                "time": minute,
                "panel": [
                    {
                        "id": str(admin.pk),
                        "name": panel_name,
                        "is_overtime": False,
                    }
                ],
            }
            for application, minute in zip(applications, minutes)
        ]
        saved_schedule, _ = SavedSchedule.objects.update_or_create(
            admission=admission,
            defaults={
                "schedule": schedule,
                "start_date": start_date,
                "end_date": start_date,
                "session_duration": 60,
                "enabled_windows": [
                    {
                        "date": date_text,
                        "start_minute": minutes[0],
                        "end_minute": minutes[-1] + 60,
                    }
                ],
                "enabled_slots": enabled_slots,
                "day_start_minute": minutes[0],
                "day_end_minute": minutes[-1] + 60,
                "chunk_size": len(minutes),
                "chunk_break_minutes": 0,
                "panel_size": 1,
                "solver_options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "stop",
                    "initial_strategy": "balanced",
                },
                "is_distributed": True,
                "conflict_review_open": False,
                "name_visibility": SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            },
        )
        saved_schedule.revealed_groups.set(admission.groups.all())
        InterviewAvailability.objects.filter(admission=admission).exclude(
            user=admin
        ).delete()
        InterviewAvailability.objects.update_or_create(
            admission=admission,
            user=admin,
            defaults={
                "slots": enabled_slots,
                "conflicts": [],
                "reviewed_candidate_ids": reviewed_candidate_ids,
            },
        )
        SolveJob.objects.filter(admission=admission).delete()

    def write_cypress_credentials(self, path, password):
        path.write_text(
            json.dumps(
                {
                    "username": self.cypress_admin_username,
                    "password": password,
                }
            ),
            encoding="utf-8",
        )
        path.chmod(0o600)

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

    def generate_fixtures(self):
        """Generate fixtures from the current state of the database"""

        for file, model in self.fixtures:
            all_objects = model.objects.all()
            fixture_file = "admissions/admissions/fixtures/{}".format(file)
            with open(fixture_file, "w") as f:
                data = serializers.serialize("json", all_objects, indent=2)
                f.write(data)
