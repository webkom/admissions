from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

MIGRATION_0003 = (
    "admissions",
    "0003_alter_group_description_alter_group_response_label",
)
MIGRATION_0004 = ("admissions", "0004_scheduler_domain")


class SchedulerDomainMigrationTestCase(TransactionTestCase):
    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        self.leaf_nodes = executor.loader.graph.leaf_nodes()
        self.addCleanup(self.restore_schema)

    def restore_schema(self):
        MigrationExecutor(connection).migrate(self.leaf_nodes)

    def test_duplicate_group_applications_block_migration_without_deletion(self):
        executor = MigrationExecutor(connection)
        executor.migrate([MIGRATION_0003])
        apps = executor.loader.project_state([MIGRATION_0003]).apps
        LegoUser = apps.get_model("admissions", "LegoUser")
        Admission = apps.get_model("admissions", "Admission")
        Group = apps.get_model("admissions", "Group")
        UserApplication = apps.get_model("admissions", "UserApplication")
        GroupApplication = apps.get_model("admissions", "GroupApplication")

        now = timezone.now()
        user = LegoUser.objects.create(
            username="duplicate-preflight-owner",
            lego_id=90990,
            password="",
        )
        admission = Admission.objects.create(
            created_by=user,
            title="Duplicate preflight",
            slug="duplicate-preflight",
            open_from=now - timedelta(days=1),
            public_deadline=now + timedelta(days=1),
            closed_from=now + timedelta(days=2),
        )
        group = Group.objects.create(
            name="Duplicate preflight group",
            lego_id=90991,
        )
        application = UserApplication.objects.create(
            user=user,
            admission=admission,
            phone_number="00000000",
        )
        first = GroupApplication.objects.create(
            application=application,
            group=group,
            text="first",
        )
        second = GroupApplication.objects.create(
            application=application,
            group=group,
            text="second",
        )
        self.addCleanup(
            GroupApplication.objects.filter(pk=second.pk).delete,
        )

        with self.assertRaisesRegex(RuntimeError, "No rows were deleted"):
            MigrationExecutor(connection).migrate([MIGRATION_0004])

        self.assertEqual(
            set(
                GroupApplication.objects.filter(application=application).values_list(
                    "pk",
                    flat=True,
                )
            ),
            {first.pk, second.pk},
        )
