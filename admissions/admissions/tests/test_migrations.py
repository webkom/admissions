from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

MIGRATION_0005 = ("admissions", "0005_scheduler_authority")
MIGRATION_0006 = ("admissions", "0006_scheduler_workflow")


class MigrationTestCase(TransactionTestCase):
    migrate_from = None
    migrate_to = None

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        self.leaf_nodes = executor.loader.graph.leaf_nodes()
        self.addCleanup(self.restore_schema)
        executor.migrate([self.migrate_from])

        old_apps = executor.loader.project_state([self.migrate_from]).apps
        self.set_up_before_migration(old_apps)

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.apps = executor.loader.project_state([self.migrate_to]).apps

    def restore_schema(self):
        MigrationExecutor(connection).migrate(self.leaf_nodes)

    def set_up_before_migration(self, apps):
        raise NotImplementedError


class AdmissionDateOrderMigrationTestCase(MigrationTestCase):
    migrate_from = MIGRATION_0005
    migrate_to = MIGRATION_0006

    def set_up_before_migration(self, apps):
        Admission = apps.get_model("admissions", "Admission")
        now = timezone.now()
        admission = Admission.objects.create(
            title="Legacy invalid dates",
            slug="legacy-invalid-dates",
            open_from=now + timedelta(days=2),
            public_deadline=now,
            closed_from=now - timedelta(days=1),
        )
        self.admission_id = admission.pk

    def test_normalizes_legacy_dates_before_adding_the_constraint(self):
        Admission = self.apps.get_model("admissions", "Admission")

        admission = Admission.objects.get(pk=self.admission_id)
        self.assertLess(admission.open_from, admission.public_deadline)
        self.assertLessEqual(admission.public_deadline, admission.closed_from)
