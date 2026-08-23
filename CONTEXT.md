# Admissions domain context

## Core concepts

- **Admission**: one recruitment period. It defines the participating committees
  (`groups`) and the committees whose active leaders or recruiting responsibles
  administer the whole admission (`admin_groups`).
- **User application**: one candidate's application to an admission. Candidate
  identity, contact details, shared application text, and interview status belong
  here.
- **Group application**: the part of a user application directed to one committee.
  A candidate may have several group applications while still having one interview
  workflow for the admission.
- **Saved schedule**: the canonical interview plan and its scheduling configuration.
  Draft schedule rows are visible only to admission administrators. A distributed
  plan may be read by participating committee members, filtered to rows they are
  authorized to see.
- **Solve job**: an asynchronous request to create a complete admission schedule.
  Admission administrators enqueue and inspect these jobs; the worker owns their
  execution lifecycle.
- **Candidate disclosure**: the decision to reveal candidate identities to a
  committee after a plan is distributed. Recruiters always have the access needed
  to recruit for their represented committees. Other active committee members gain
  identity access only after an authorized reveal.

## Invariants

- Admission-wide administration requires an active `leader` or `recruiting`
  membership in one of the admission's admin groups. Ordinary members of an
  admin group do not receive admission-wide authority.
- An OAuth membership refresh replaces the local membership snapshot atomically.
  Missing, malformed, or unknown membership data must fail closed rather than
  retaining or creating privileges.
- Committee access is the union of represented committees and ordinary active
  memberships whose candidate identities have been revealed.
- Schedule responses omit unauthorized rows entirely. Redacting candidate fields
  is not sufficient because time, panel, and row counts are also sensitive.
- Candidate identities remain hidden from ordinary committee members until an
  authorized reveal, and every reveal or hide action is audited with actor,
  committee, action, and timestamp.
- Admission administrators receive the effective revealed-committee scope so a
  partial disclosure cannot be presented as fully hidden or globally revealed.
- Changing the participating committees preserves disclosure only for retained
  committees. Newly added committees start hidden; removing a visible committee
  revokes and audits its disclosure so re-adding it cannot restore stale access.
- A user application has one interview and one interview status for the admission,
  even when the candidate applies to several committees. Moving the status to a
  group application would mean introducing separate per-committee interviews.
- Interview workflow activity has its own revision timestamp and must not alter or
  expose the candidate-facing application update time.
- Every interview-status change records the previous state, next state, actor,
  actor-name snapshot, and timestamp. Repeating the current state creates no audit
  noise.
- A manually arranged schedule row is marked independently from interview status
  and remains locked across solver reruns. Unlocking it returns the row to solver
  ownership.
- Only admission administrators can solve, inspect solve jobs, edit the complete
  schedule, or export admission-wide scheduling data.
- Schedule and configuration drafts are saved against the server revision they
  were based on. A stale or ambiguous create/update is rejected instead of
  overwriting newer work.
- ICS exports never contain candidate identities. CSV exports never include names
  outside the requesting user's disclosure scope.
- Client-side authorization failures purge sensitive admission state and block
  delayed query or mutation results from restoring it.

## Module boundaries

- `admission_access.py` owns membership, disclosure, and response-scope policy.
- `interview_workflow.py` owns concurrency-safe interview-status transitions.
- `solve_jobs.py` owns solve-job lifecycle operations.
- `candidate_views.py`, `availability_views.py`, `solve_views.py`, and
  `schedule_views.py` adapt HTTP requests to those policies and workflows.
- `schedule_validation.py` validates and canonicalizes persisted schedules.
