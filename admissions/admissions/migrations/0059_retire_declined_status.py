"""Retire the 'declined' interview status.

'declined' (the candidate said no before the interview) and 'cancelled'
(the interview will not happen) meant the same thing in practice, and every
UI surface already treats them identically - two red chips for one state.
So the enum is collapsing onto 'cancelled': existing 'declined' values are
rewritten here, and the choice is removed from the model.

Historical audit events are rewritten too, not just live rows: they are
validated against the same choices, so leaving 'declined' behind would make
old events unreadable in the admin. The rewrite preserves the distinction
the events actually exist to record - who changed what, and when - while
the status itself collapses to the one value that survives.
"""

from django.db import migrations, models


def rewrite_declined_to_cancelled(apps, schema_editor):
    GroupApplication = apps.get_model("admissions", "GroupApplication")
    InterviewStatusAuditEvent = apps.get_model(
        "admissions", "InterviewStatusAuditEvent"
    )

    GroupApplication.objects.filter(interview_status="declined").update(
        interview_status="cancelled"
    )
    # Both endpoints of a transition can be 'declined'; one UPDATE covers
    # either, and an event that was declined->declined collapses to
    # cancelled->cancelled, which the audit UI renders like any no-op pair.
    InterviewStatusAuditEvent.objects.filter(previous_status="declined").update(
        previous_status="cancelled"
    )
    InterviewStatusAuditEvent.objects.filter(new_status="declined").update(
        new_status="cancelled"
    )


def restore_declined(apps, schema_editor):
    # The reverse direction is deliberately lossy and only exists so the
    # migration is reversible in principle: everything 'cancelled' goes back
    # to 'declined', including rows that were cancelled before this change.
    # Nobody should run this outside a rollback drill.
    GroupApplication = apps.get_model("admissions", "GroupApplication")
    InterviewStatusAuditEvent = apps.get_model(
        "admissions", "InterviewStatusAuditEvent"
    )
    GroupApplication.objects.filter(interview_status="cancelled").update(
        interview_status="declined"
    )
    InterviewStatusAuditEvent.objects.filter(previous_status="cancelled").update(
        previous_status="declined"
    )
    InterviewStatusAuditEvent.objects.filter(new_status="cancelled").update(
        new_status="declined"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("admissions", "0058_withdrawalauditevent_withdrawn_by_candidate"),
    ]

    operations = [
        migrations.RunPython(rewrite_declined_to_cancelled, restore_declined),
        migrations.AlterField(
            model_name="groupapplication",
            name="interview_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                default="not_invited",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="interviewstatusauditevent",
            name="new_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="interviewstatusauditevent",
            name="previous_status",
            field=models.CharField(
                choices=[
                    ("not_invited", "Not invited"),
                    ("invited", "Invited"),
                    ("confirmed", "Confirmed"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                max_length=20,
            ),
        ),
    ]
