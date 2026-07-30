from datetime import timedelta
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection
from django.db.migrations.exceptions import IrreversibleError
from django.db.migrations.executor import MigrationExecutor
from django.db.models.query import QuerySet
from django.test import TransactionTestCase
from django.utils import timezone

MIGRATION_0003 = (
    "admissions",
    "0003_alter_group_description_alter_group_response_label",
)
MIGRATION_0004 = ("admissions", "0004_scheduler_domain")
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


class DestructiveMigrationPreflightTestCase(TransactionTestCase):
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
        Group = apps.get_model("admissions", "Group")
        UserApplication = apps.get_model("admissions", "UserApplication")
        GroupApplication = apps.get_model("admissions", "GroupApplication")
        user, admission = create_admission(
            apps,
            slug="duplicate-preflight",
            lego_id=90990,
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

        with self.assertRaisesRegex(
            RuntimeError,
            "No rows were deleted",
        ):
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

    def test_invalid_admission_dates_block_migration_without_rewriting(self):
        executor = MigrationExecutor(connection)
        executor.migrate([MIGRATION_0005])
        apps = executor.loader.project_state([MIGRATION_0005]).apps
        Admission = apps.get_model("admissions", "Admission")
        now = timezone.now()
        admission = Admission.objects.create(
            title="Legacy invalid dates",
            slug="legacy-invalid-dates",
            open_from=now + timedelta(days=2),
            public_deadline=now,
            closed_from=now - timedelta(days=1),
        )
        original = (
            admission.open_from,
            admission.public_deadline,
            admission.closed_from,
        )
        self.addCleanup(
            Admission.objects.filter(pk=admission.pk).update,
            open_from=now - timedelta(days=1),
            public_deadline=now + timedelta(days=1),
            closed_from=now + timedelta(days=2),
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "No historical dates were rewritten",
        ):
            MigrationExecutor(connection).migrate([MIGRATION_0006])

        admission.refresh_from_db()
        self.assertEqual(
            (
                admission.open_from,
                admission.public_deadline,
                admission.closed_from,
            ),
            original,
        )


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


class GroupScopedApplicationAnswersReverseTestCase(TransactionTestCase):
    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        self.apps = executor.loader.project_state([MIGRATION_0006]).apps
        self.reverse = import_module(
            "admissions.admissions.migrations.0006_scheduler_workflow"
        ).restore_legacy_application_answers

    def create_scoped_rows(self, *, question_values, answer_values):
        Group = self.apps.get_model("admissions", "Group")
        AdmissionGroup = self.apps.get_model("admissions", "AdmissionGroup")
        UserApplication = self.apps.get_model("admissions", "UserApplication")
        GroupApplication = self.apps.get_model("admissions", "GroupApplication")
        user, admission = create_admission(
            self.apps,
            slug=f"reverse-{len(question_values)}-{len(answer_values)}",
            lego_id=92000,
        )
        admission.header_fields = [{"id": "legacy-question"}]
        admission.save(update_fields=["header_fields"])
        application = UserApplication.objects.create(
            user=user,
            admission=admission,
            phone_number="00000000",
            header_fields_response={"legacy": "answer"},
        )
        for index, (questions, answers) in enumerate(
            zip(question_values, answer_values, strict=True),
            start=1,
        ):
            group = Group.objects.create(
                name=f"Reverse group {index}",
                lego_id=92000 + index,
            )
            AdmissionGroup.objects.create(
                admission=admission,
                group=group,
                header_fields=questions,
            )
            GroupApplication.objects.create(
                application=application,
                group=group,
                header_fields_response=answers,
            )
        return admission, application

    def run_reverse(self):
        self.reverse(
            self.apps,
            SimpleNamespace(connection=connection),
        )

    def test_reverse_copies_identical_scoped_values_to_legacy_fields(self):
        questions = [{"id": "shared-question"}]
        answers = {"shared-question": "shared answer"}
        admission, application = self.create_scoped_rows(
            question_values=[questions, questions],
            answer_values=[answers, answers],
        )

        self.run_reverse()

        admission.refresh_from_db()
        application.refresh_from_db()
        self.assertEqual(admission.header_fields, questions)
        self.assertEqual(application.header_fields_response, answers)

    def test_reverse_rejects_divergent_question_sets_without_partial_updates(self):
        admission, application = self.create_scoped_rows(
            question_values=[[{"id": "question-a"}], [{"id": "question-b"}]],
            answer_values=[{"answer": "same"}, {"answer": "same"}],
        )

        with self.assertRaises(IrreversibleError):
            self.run_reverse()

        admission.refresh_from_db()
        application.refresh_from_db()
        self.assertEqual(admission.header_fields, [{"id": "legacy-question"}])
        self.assertEqual(
            application.header_fields_response,
            {"legacy": "answer"},
        )

    def test_reverse_rejects_divergent_answers_without_partial_updates(self):
        admission, application = self.create_scoped_rows(
            question_values=[[{"id": "same"}], [{"id": "same"}]],
            answer_values=[{"answer": "a"}, {"answer": "b"}],
        )

        with self.assertRaises(IrreversibleError):
            self.run_reverse()

        admission.refresh_from_db()
        application.refresh_from_db()
        self.assertEqual(admission.header_fields, [{"id": "legacy-question"}])
        self.assertEqual(
            application.header_fields_response,
            {"legacy": "answer"},
        )
