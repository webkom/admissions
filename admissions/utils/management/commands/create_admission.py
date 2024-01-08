from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from admissions.admissions.models import Admission, Group


class Command(BaseCommand):
    help = "Creates a new admission with valid dates"

    def add_arguments(self, parser):
        pass

    def handle(self, *args, **options):
        base_date = timezone.now().replace(
            hour=23, minute=59, second=59, microsecond=59
        )

        open_date = base_date.replace(
            hour=12, minute=15, second=0, microsecond=0
        ) - timedelta(days=1)
        public_deadline_date = base_date + timedelta(days=7)
        closed_from_date = base_date + timedelta(days=9)

        admission = Admission.objects.create(
            title=f"Opptak {base_date.year}",
            slug=f"opptak-{base_date.year}",
            open_from=open_date,
            public_deadline=public_deadline_date,
            closed_from=closed_from_date,
        )

        admission.groups.set(Group.objects.all())

        self.stdout.write(self.style.SUCCESS("Successfully created admission"))
