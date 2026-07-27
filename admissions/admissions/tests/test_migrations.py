from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.db.models.query import QuerySet
from django.test import TransactionTestCase
from django.utils import timezone

MIGRATION_0005 = ("admissions", "0005_scheduler_authority")
MIGRATION_0006 = ("admissions", "0006_scheduler_workflow")


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


class GroupScopedApplicationAnswersMigrationTestCase(MigrationTestCase):
    migrate_from = MIGRATION_0005
    migrate_to = MIGRATION_0006

    def set_up_before_migration(self, apps):
        Group = apps.get_model("admissions", "Group")
        AdmissionGroup = apps.get_model("admissions", "AdmissionGroup")
        UserApplication = apps.get_model("admissions", "UserApplication")
        GroupApplication = apps.get_model("admissions", "GroupApplication")

        user, admission = create_admission(
            apps,
            slug="legacy-group-answers",
            lego_id=91030,
        )
        legacy_fields = [
            {
                "id": "motivation",
                "type": "textarea",
                "title": "Motivasjon",
                "label": "Motivasjon",
                "placeholder": "",
                "required": True,
            }
        ]
        legacy_answers = {"motivation": "Jeg vil bidra."}
        admission.header_fields = legacy_fields
        admission.save(update_fields=["header_fields"])

        empty_group = Group.objects.create(name="Empty target", lego_id=91031)
        racing_group = Group.objects.create(
            name="Concurrent target",
            lego_id=91032,
        )
        empty_admission_group = AdmissionGroup.objects.create(
            admission=admission,
            group=empty_group,
        )
        racing_admission_group = AdmissionGroup.objects.create(
            admission=admission,
            group=racing_group,
        )

        application = UserApplication.objects.create(
            user=user,
            admission=admission,
            phone_number="00000000",
            header_fields_response=legacy_answers,
        )
        empty_group_application = GroupApplication.objects.create(
            application=application,
            group=empty_group,
        )
        racing_group_application = GroupApplication.objects.create(
            application=application,
            group=racing_group,
        )

        self.legacy_fields = legacy_fields
        self.legacy_answers = legacy_answers
        self.concurrent_fields = [
            {
                "id": "concurrent",
                "type": "textinput",
                "title": "Samtidig spørsmål",
                "label": "Samtidig spørsmål",
                "placeholder": "",
                "required": False,
            }
        ]
        self.concurrent_answers = {"concurrent": "Behold det samtidige svaret."}
        self.empty_admission_group_id = empty_admission_group.pk
        self.racing_admission_group_id = racing_admission_group.pk
        self.empty_group_application_id = empty_group_application.pk
        self.racing_group_application_id = racing_group_application.pk

        original_update = QuerySet.update
        injected = {
            "admission_group": False,
            "group_application": False,
        }

        def inject_concurrent_value_before_legacy_update(queryset, **kwargs):
            model_name = queryset.model._meta.model_name
            if (
                model_name == "admissiongroup"
                and kwargs.get("header_fields") == self.legacy_fields
                and not injected["admission_group"]
            ):
                concurrent_target = queryset.model._base_manager.using(
                    queryset.db
                ).filter(pk=self.racing_admission_group_id)
                original_update(
                    concurrent_target,
                    header_fields=self.concurrent_fields,
                )
                injected["admission_group"] = True
            elif (
                model_name == "groupapplication"
                and kwargs.get("header_fields_response") == self.legacy_answers
                and not injected["group_application"]
            ):
                concurrent_target = queryset.model._base_manager.using(
                    queryset.db
                ).filter(pk=self.racing_group_application_id)
                original_update(
                    concurrent_target,
                    header_fields_response=self.concurrent_answers,
                )
                injected["group_application"] = True
            return original_update(queryset, **kwargs)

        update_patcher = patch.object(
            QuerySet,
            "update",
            new=inject_concurrent_value_before_legacy_update,
        )
        update_patcher.start()
        self.addCleanup(update_patcher.stop)

    def test_backfills_only_still_empty_targets(self):
        AdmissionGroup = self.apps.get_model("admissions", "AdmissionGroup")
        GroupApplication = self.apps.get_model("admissions", "GroupApplication")

        empty_admission_group = AdmissionGroup.objects.get(
            pk=self.empty_admission_group_id
        )
        racing_admission_group = AdmissionGroup.objects.get(
            pk=self.racing_admission_group_id
        )
        empty_group_application = GroupApplication.objects.get(
            pk=self.empty_group_application_id
        )
        racing_group_application = GroupApplication.objects.get(
            pk=self.racing_group_application_id
        )

        self.assertEqual(empty_admission_group.header_fields, self.legacy_fields)
        self.assertEqual(
            racing_admission_group.header_fields,
            self.concurrent_fields,
        )
        self.assertEqual(
            empty_group_application.header_fields_response,
            self.legacy_answers,
        )
        self.assertEqual(
            racing_group_application.header_fields_response,
            self.concurrent_answers,
        )
