from datetime import date, timedelta

from django.db import connection, migrations
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

MIGRATION_0014 = (
    "admissions",
    "0014_solvejob_admissions__status_c65d93_idx_and_more",
)
MIGRATION_0015 = (
    "admissions",
    "0015_solvejob_unique_active_solve_job_per_admission",
)
MIGRATION_0016 = ("admissions", "0016_use_absolute_schedule_minutes")


def create_admission(apps, *, slug, lego_id):
    LegoUser = apps.get_model("admissions", "LegoUser")
    Admission = apps.get_model("admissions", "Admission")
    user = LegoUser.objects.create(
        username=f"{slug}-owner",
        lego_id=lego_id,
        password="",
    )
    now = timezone.now()
    admission = Admission.objects.create(
        created_by=user,
        title=f"Migration test {slug}",
        slug=slug,
        open_from=now - timedelta(days=1),
        public_deadline=now + timedelta(days=1),
        closed_from=now + timedelta(days=2),
    )
    return user, admission


class MigrationTestCase(TransactionTestCase):
    migrate_from = None
    migrate_to = None

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        self.leaf_nodes = executor.loader.graph.leaf_nodes()
        self.addCleanup(self.restore_schema)
        self.migrate_back(executor)

        old_apps = executor.loader.project_state([self.migrate_from]).apps
        self.set_up_before_migration(old_apps)

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def migrate_back(self, executor):
        operation = executor.loader.get_migration(*MIGRATION_0016).operations[0]
        original_reverse_code = operation.reverse_code
        operation.reverse_code = migrations.RunPython.noop
        try:
            executor.migrate([self.migrate_from])
        finally:
            operation.reverse_code = original_reverse_code

    def restore_schema(self):
        MigrationExecutor(connection).migrate(self.leaf_nodes)

    def set_up_before_migration(self, apps):
        raise NotImplementedError


class SolveJobDeduplicationMigrationTestCase(MigrationTestCase):
    migrate_from = MIGRATION_0014
    migrate_to = MIGRATION_0015

    def set_up_before_migration(self, apps):
        SolveJob = apps.get_model("admissions", "SolveJob")
        user, admission = create_admission(
            apps,
            slug="deduplicate-solve-jobs",
            lego_id=91001,
        )
        oldest = SolveJob.objects.create(
            admission=admission,
            requested_by=user,
            status="PENDING",
            request_data={},
        )
        duplicate = SolveJob.objects.create(
            admission=admission,
            requested_by=user,
            status="RUNNING",
            request_data={},
        )
        completed = SolveJob.objects.create(
            admission=admission,
            requested_by=user,
            status="DONE",
            request_data={},
            result={"schedule": []},
            finished_at=timezone.now(),
        )
        now = timezone.now()
        SolveJob.objects.filter(pk=oldest.pk).update(
            created_at=now - timedelta(minutes=2)
        )
        SolveJob.objects.filter(pk=duplicate.pk).update(
            created_at=now - timedelta(minutes=1)
        )

        self.admission_id = admission.pk
        self.oldest_id = oldest.pk
        self.duplicate_id = duplicate.pk
        self.completed_id = completed.pk

    def test_keeps_oldest_active_job_and_marks_other_active_jobs_as_errors(self):
        SolveJob = self.apps.get_model("admissions", "SolveJob")

        active_jobs = SolveJob.objects.filter(
            admission_id=self.admission_id,
            status__in=("PENDING", "RUNNING"),
        )
        self.assertEqual(
            list(active_jobs.values_list("id", flat=True)),
            [self.oldest_id],
        )

        duplicate = SolveJob.objects.get(pk=self.duplicate_id)
        self.assertEqual(duplicate.status, "ERROR")
        self.assertEqual(
            duplicate.error,
            "Erstattet av en annen aktiv solverjobb under oppgradering.",
        )
        self.assertIsNotNone(duplicate.finished_at)

        completed = SolveJob.objects.get(pk=self.completed_id)
        self.assertEqual(completed.status, "DONE")
        self.assertEqual(completed.result, {"schedule": []})


class AbsoluteScheduleMinutesMigrationTestCase(MigrationTestCase):
    migrate_from = MIGRATION_0015
    migrate_to = MIGRATION_0016

    def set_up_before_migration(self, apps):
        SavedSchedule = apps.get_model("admissions", "SavedSchedule")
        SolveJob = apps.get_model("admissions", "SolveJob")

        user, convertible_admission = create_admission(
            apps,
            slug="convert-legacy-schedule",
            lego_id=91002,
        )
        _, ambiguous_admission = create_admission(
            apps,
            slug="clear-ambiguous-schedule",
            lego_id=91003,
        )

        convertible = SavedSchedule.objects.create(
            admission=convertible_admission,
            schedule=[
                {
                    "candidate_id": "candidate-a",
                    "candidate": "Ada",
                    "time": 9,
                    "panel": [],
                },
                {
                    "candidate_id": "candidate-b",
                    "candidate": "Bob",
                    "time": 32,
                    "panel": [],
                },
            ],
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 21),
            session_duration=60,
            enabled_slots=["2026-04-20|540", "2026-04-21|480"],
            is_distributed=True,
            name_visibility="committee",
        )
        ambiguous = SavedSchedule.objects.create(
            admission=ambiguous_admission,
            schedule=[
                {
                    "candidate_id": "candidate-c",
                    "candidate": "Charlie",
                    "time": 20,
                    "panel": [],
                }
            ],
            start_date=date(2026, 4, 20),
            end_date=date(2026, 4, 20),
            session_duration=25,
            enabled_slots=["2026-04-20|500", "2026-04-20|510"],
            is_distributed=True,
            name_visibility="committee",
        )
        SolveJob.objects.create(
            admission=convertible_admission,
            requested_by=user,
            status="DONE",
            request_data={"candidates": [{"name": "Ada"}]},
            result={"schedule": [{"candidate": "Ada"}]},
            finished_at=timezone.now(),
        )

        self.convertible_id = convertible.pk
        self.ambiguous_id = ambiguous.pk

    def test_converts_unique_times_clears_ambiguous_plans_and_deletes_solve_jobs(self):
        SavedSchedule = self.apps.get_model("admissions", "SavedSchedule")
        SolveJob = self.apps.get_model("admissions", "SolveJob")

        convertible = SavedSchedule.objects.get(pk=self.convertible_id)
        self.assertEqual(
            convertible.schedule,
            [
                {
                    "candidate_id": "candidate-a",
                    "candidate": "Ada",
                    "time": 540,
                    "panel": [],
                },
                {
                    "candidate_id": "candidate-b",
                    "candidate": "Bob",
                    "time": 1920,
                    "panel": [],
                },
            ],
        )
        self.assertTrue(convertible.is_distributed)
        self.assertEqual(convertible.name_visibility, "committee")

        ambiguous = SavedSchedule.objects.get(pk=self.ambiguous_id)
        self.assertEqual(ambiguous.schedule, [])
        self.assertFalse(ambiguous.is_distributed)
        self.assertEqual(ambiguous.name_visibility, "hidden")

        self.assertFalse(SolveJob.objects.exists())
