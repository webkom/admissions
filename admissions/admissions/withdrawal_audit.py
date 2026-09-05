"""Recording of withdrawal audit events.

Kept out of models.py and signals.py on purpose: the signals cascade runs on
every delete and must stay lean, and each withdrawal site decides for itself
whether a delete is a full withdrawal or a single committee drop. See
WithdrawalAuditEvent for why this is display-only material.
"""

from admissions.admissions.models import WithdrawalAuditEvent


def record_withdrawal(
    *,
    admission,
    group,
    candidate,
    candidate_id,
    kind,
    actor=None,
):
    """Snapshot one withdrawal into the audit log.

    `candidate` is a UserApplication that is about to be deleted (or has just
    had its last group application removed) - read everything off it now,
    because nothing survives the delete. `actor` is whoever pulled the
    trigger: the applicant themselves, or an admin/recruiter deleting on
    their behalf - which of the two is recorded on the event. Runs inside the
    caller's transaction so a rolled-back delete never leaves a phantom audit
    row.
    """

    user = getattr(candidate, "user", None)
    actor = actor if getattr(actor, "is_authenticated", False) else None
    # Derived here rather than passed in, so no call site can get it wrong:
    # the applicant withdrawing themselves is the only case where the actor
    # and the application's owner are the same person.
    withdrawn_by_candidate = bool(
        user is not None and actor is not None and actor.pk == user.pk
    )
    WithdrawalAuditEvent.objects.create(
        admission=admission,
        group=group,
        group_name=group.name,
        candidate_username=getattr(user, "username", "") or "",
        candidate_full_name=(user.get_full_name() if user else "") or "",
        candidate_id=str(candidate_id or ""),
        kind=kind,
        withdrawn_by_candidate=withdrawn_by_candidate,
        actor=actor,
    )
