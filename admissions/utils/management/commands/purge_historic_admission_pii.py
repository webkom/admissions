"""Purge and scrub applicant personal data from concluded admissions.

Complies with GDPR Article 5(1)(e) (Storage Limitation) by stripping candidate
personal information (phone numbers, priority texts, committee application
essays, header answers, and conflict relationship declarations) from
admissions that are closed and past their appeal/retention window.

Applications are scrubbed in place - the row survives, the personal data does
not. Declarations and withdrawal audit events are deleted outright: both exist
only to name a person, so an anonymised one has nothing left to say.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from structlog import get_logger

from admissions.admissions.models import (
    Admission,
    FadderbarnDeclaration,
    GroupApplication,
    SavedSchedule,
    UserApplication,
    WithdrawalAuditEvent,
)

log = get_logger()


class Command(BaseCommand):
    help = "Scrub applicant PII and declarations from concluded admissions."

    def add_arguments(self, parser):
        parser.add_argument(
            "--admission",
            type=str,
            help="Slug of a specific admission to purge.",
        )
        parser.add_argument(
            "--older-than-days",
            type=int,
            default=180,
            help="Purge admissions closed more than this many days ago (default: 180).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Simulate the purge and report affected records without modifying data.",
        )

    def handle(self, *args, **options):
        admission_slug = options.get("admission")
        older_than_days = options.get("older_than_days")
        dry_run = options.get("dry_run", False)

        now = timezone.now()
        cutoff = now - timedelta(days=older_than_days)

        if admission_slug:
            admissions = Admission.objects.filter(slug=admission_slug)
            if not admissions.exists():
                raise CommandError(
                    f"Admission with slug '{admission_slug}' does not exist."
                )
            admission = admissions.first()
            if admission.closed_from and admission.closed_from > now:
                raise CommandError(
                    f"Admission '{admission_slug}' is not yet closed (closed_from={admission.closed_from}). "
                    "Cannot purge an active admission."
                )
        else:
            admissions = Admission.objects.filter(closed_from__lt=cutoff).order_by(
                "closed_from"
            )

        total_admissions = admissions.count()
        if total_admissions == 0:
            self.stdout.write(
                self.style.SUCCESS(
                    "No concluded admissions matched the purge criteria."
                )
            )
            return

        self.stdout.write(
            self.style.WARNING(
                f"{'[DRY RUN] ' if dry_run else ''}Found {total_admissions} admission(s) eligible for PII purge."
            )
        )

        total_apps_scrubbed = 0
        total_group_apps_scrubbed = 0
        total_fadderbarn_deleted = 0
        total_schedules_scrubbed = 0
        total_withdrawals_deleted = 0

        for admission in admissions:
            user_apps = UserApplication.objects.filter(admission=admission)
            group_apps = GroupApplication.objects.filter(
                application__admission=admission
            )
            fadderbarn_qs = FadderbarnDeclaration.objects.filter(admission=admission)
            schedules = SavedSchedule.objects.filter(admission=admission)
            # Withdrawal is a hard delete, so these snapshots are the only
            # place a withdrawn applicant's name still lives. Without this
            # pass the people who left would keep their names long after the
            # people who stayed had theirs scrubbed.
            withdrawals = WithdrawalAuditEvent.objects.filter(admission=admission)

            app_count = user_apps.count()
            group_app_count = group_apps.count()
            fadderbarn_count = fadderbarn_qs.count()
            schedule_count = schedules.count()
            withdrawal_count = withdrawals.count()

            self.stdout.write(
                f" - {admission.slug} (closed {admission.closed_from}): "
                f"{app_count} applications, {group_app_count} group applications, "
                f"{fadderbarn_count} declarations, {schedule_count} schedules, "
                f"{withdrawal_count} withdrawal events."
            )

            if not dry_run:
                with transaction.atomic():
                    user_apps.update(phone_number="", text="")
                    group_apps.update(text="", header_fields_response={})
                    fadderbarn_qs.delete()
                    # Deleted, not blanked: the whole point of the event is
                    # to name who left, so a nameless one is dead weight.
                    withdrawals.delete()

                    for schedule_obj in schedules:
                        raw_items = schedule_obj.schedule or []
                        cleaned_items = []
                        for index, item in enumerate(raw_items):
                            if not isinstance(item, dict):
                                continue
                            item_copy = dict(item)
                            item_copy["candidate"] = f"Kandidat {index + 1}"
                            item_copy.pop("candidate_phone", None)
                            cleaned_items.append(item_copy)
                        schedule_obj.schedule = cleaned_items
                        schedule_obj.name_visibility = (
                            SavedSchedule.NAME_VISIBILITY_HIDDEN
                        )
                        schedule_obj.save(update_fields=["schedule", "name_visibility"])

            total_apps_scrubbed += app_count
            total_group_apps_scrubbed += group_app_count
            total_fadderbarn_deleted += fadderbarn_count
            total_schedules_scrubbed += schedule_count
            total_withdrawals_deleted += withdrawal_count

        log.info(
            "historic_admission_pii_purged",
            admissions_count=total_admissions,
            applications_scrubbed=total_apps_scrubbed,
            group_applications_scrubbed=total_group_apps_scrubbed,
            fadderbarn_deleted=total_fadderbarn_deleted,
            schedules_scrubbed=total_schedules_scrubbed,
            withdrawal_events_deleted=total_withdrawals_deleted,
            dry_run=dry_run,
        )

        status_prefix = (
            "[DRY RUN] Completed simulation: " if dry_run else "Successfully purged: "
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"{status_prefix}{total_apps_scrubbed} candidate application(s), "
                f"{total_group_apps_scrubbed} committee application(s), "
                f"{total_fadderbarn_deleted} relationship declaration(s), "
                f"{total_schedules_scrubbed} saved schedule(s), "
                f"{total_withdrawals_deleted} withdrawal event(s) "
                f"across {total_admissions} admission(s)."
            )
        )
