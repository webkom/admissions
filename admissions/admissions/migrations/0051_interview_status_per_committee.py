"""Move interview status from UserApplication to GroupApplication.

Interview status was shared across every committee an applicant applied to
in one admission, because it lived on UserApplication (one row per
applicant per admission). It belongs on GroupApplication (one row per
applicant per committee): Webkom can have someone at "Tid bekreftet" while
Arrkom still has them at "Ikke kalt inn".

This migration adds the fields to GroupApplication, copies the shared value
onto every committee row, re-homes the audit events, and drops the old
fields.
"""

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def _flush_deferred_constraints(schema_editor):
    """Force Django's DEFERRABLE INITIALLY DEFERRED FK checks to run now.

    This migration does row-level writes (RunPython) and then ALTER TABLE on
    the same tables in one transaction. Postgres refuses the ALTER while
    deferred FK trigger events are still pending ("cannot ALTER TABLE ...
    because it has pending trigger events"), so settle them first.
    """
    if schema_editor.connection.vendor == "postgresql":
        schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def migrate_forward(apps, schema_editor):
    UserApplication = apps.get_model("admissions", "UserApplication")
    GroupApplication = apps.get_model("admissions", "GroupApplication")
    InterviewStatusAuditEvent = apps.get_model(
        "admissions", "InterviewStatusAuditEvent"
    )

    # The old status was shared, so seed every committee row with it.
    for application in UserApplication.objects.all().iterator():
        GroupApplication.objects.filter(application=application).update(
            interview_status=application.interview_status,
            interview_status_updated_at=(
                application.interview_status_updated_at or django.utils.timezone.now()
            ),
            interview_status_updated_by=application.interview_status_updated_by,
            interview_status_updated_by_username=(
                application.interview_status_updated_by_username
            ),
        )

    # Re-home audit events. A change under the old model touched the shared
    # status, i.e. effectively every committee - so fan each event out.
    # `application` (the old FK) is still a NOT NULL column at this point in
    # the migration - it is dropped by a later operation - so the fanned-out
    # clones must still carry it.
    for event in (
        InterviewStatusAuditEvent.objects.select_related("application").all().iterator()
    ):
        group_applications = list(
            GroupApplication.objects.filter(application=event.application)
        )
        if not group_applications:
            event.delete()
            continue
        event.group_application = group_applications[0]
        event.save(update_fields=["group_application"])
        for group_application in group_applications[1:]:
            clone = InterviewStatusAuditEvent.objects.create(
                application=event.application,
                group_application=group_application,
                actor=event.actor,
                actor_username=event.actor_username,
                previous_status=event.previous_status,
                new_status=event.new_status,
            )
            InterviewStatusAuditEvent.objects.filter(pk=clone.pk).update(
                created_at=event.created_at
            )

    _flush_deferred_constraints(schema_editor)


def migrate_backward(apps, schema_editor):
    UserApplication = apps.get_model("admissions", "UserApplication")
    GroupApplication = apps.get_model("admissions", "GroupApplication")
    InterviewStatusAuditEvent = apps.get_model(
        "admissions", "InterviewStatusAuditEvent"
    )

    # Collapse the per-committee statuses back onto UserApplication, keeping
    # the most recently changed one.
    for application in UserApplication.objects.all().iterator():
        latest = (
            GroupApplication.objects.filter(application=application)
            .order_by("-interview_status_updated_at")
            .first()
        )
        if latest is None:
            continue
        application.interview_status = latest.interview_status
        application.interview_status_updated_at = latest.interview_status_updated_at
        application.interview_status_updated_by = latest.interview_status_updated_by
        application.interview_status_updated_by_username = (
            latest.interview_status_updated_by_username
        )
        application.save(
            update_fields=[
                "interview_status",
                "interview_status_updated_at",
                "interview_status_updated_by",
                "interview_status_updated_by_username",
            ]
        )

    seen_applications = set()
    for event in (
        InterviewStatusAuditEvent.objects.select_related("group_application")
        .all()
        .iterator()
    ):
        application_id = event.group_application.application_id
        if application_id in seen_applications:
            event.delete()
            continue
        seen_applications.add(application_id)
        event.application_id = application_id
        event.save(update_fields=["application"])

    _flush_deferred_constraints(schema_editor)


class Migration(migrations.Migration):
    dependencies = [
        ("admissions", "0050_savedschedule_published_without_review_by_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="interviewstatusauditevent",
            name="interview_status_app_time_idx",
        ),
        migrations.AddField(
            model_name="groupapplication",
            name="interview_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("declined", "Declined"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="not_invited",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="groupapplication",
            name="interview_status_updated_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name="groupapplication",
            name="interview_status_updated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="interview_status_updates",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="groupapplication",
            name="interview_status_updated_by_username",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="interviewstatusauditevent",
            name="group_application",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="interview_status_events",
                to="admissions.groupapplication",
            ),
        ),
        migrations.RunPython(migrate_forward, migrate_backward),
        migrations.RemoveField(
            model_name="interviewstatusauditevent",
            name="application",
        ),
        migrations.AlterField(
            model_name="interviewstatusauditevent",
            name="group_application",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="interview_status_events",
                to="admissions.groupapplication",
            ),
        ),
        migrations.AddIndex(
            model_name="interviewstatusauditevent",
            index=models.Index(
                fields=["group_application", "-created_at"],
                name="interview_status_ga_time_idx",
            ),
        ),
        migrations.RemoveField(
            model_name="userapplication",
            name="interview_status",
        ),
        migrations.RemoveField(
            model_name="userapplication",
            name="interview_status_updated_at",
        ),
        migrations.RemoveField(
            model_name="userapplication",
            name="interview_status_updated_by",
        ),
        migrations.RemoveField(
            model_name="userapplication",
            name="interview_status_updated_by_username",
        ),
    ]
