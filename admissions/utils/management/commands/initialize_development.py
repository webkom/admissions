from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Migrates the database and loads the local Admissions development fixtures."

    def handle(self, *args, **options):
        if not getattr(settings, "ALLOW_DEVELOPMENT_INITIALIZATION", False):
            raise CommandError(
                "Development initialization is disabled by this settings module."
            )

        verbosity = options["verbosity"]
        call_command("migrate", interactive=False, verbosity=verbosity)
        call_command("load_fixtures", verbosity=verbosity)
        self.stdout.write(
            self.style.SUCCESS("Admissions development data initialized.")
        )
