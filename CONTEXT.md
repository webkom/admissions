# Admissions domain context

## Core concepts

- **Admission**: one recruitment period. It defines the participating committees
  (`groups`) and the overseeing bodies (`admin_groups`). All active members of an
  admin group are equal admission administrators (they read all applications and
  priority text). In addition, God users (`constants.GOD_LEGO_IDS`) are
  admission-wide administrators for every admission.
- **Roles in an admission**:
  1. **God Users (`constants.GOD_LEGO_IDS`)**: Central org leadership. Admin for
     all applications across all admissions (including priority text). Never operates
     committee interview schedules unless holding a committee recruiter role.
  2. **Admin Group Members (`admission.admin_groups`)**: All active members are
     equal. Full access to all applications in `admin_full` mode (including
     priority text). Do not operate committee interview schedules.
  3. **Committee Leaders / Recruiters (`leader` / `recruiting` in `admission.groups`)**:
     Full authority over their own committee only (`committee_full` mode, own
     schedule, solver, and publishing).
  4. **Committee Members (`member` in `admission.groups`)**: Submit own availability
     timeslots and fadderbarn declarations. View own committee's published plan
     (name + status when revealed). No access to application texts or recruiter metadata.
  5. **Applicants / Outsiders**: Apply to committees and manage own application.
- **User application**: one candidate's application to an admission. Candidate
  identity, contact details, shared application text, and interview status belong
  here.
- **Group application**: the part of a user application directed to one committee.
  A candidate may have several group applications while still having one interview
  workflow for the admission.
- **Saved schedule**: the canonical interview plan and its scheduling configuration.
  Draft schedule rows are visible only to that committee's own interview admins
  (leaders/recruiters). A distributed plan may be read by participating committee
  members, filtered to rows they are authorized to see.
- **Solve job**: an asynchronous request to create a complete committee schedule.
  Committee recruiters enqueue and inspect these jobs; the worker owns their
  execution lifecycle.
- **Committee roster mirror**: LEGO's own list of who is in a participating
  committee, synced ahead of time. It exists so the availability roster can
  name the members who have never signed in, and is display scope only - never
  an authorization source.
- **Candidate disclosure**: the decision to reveal candidate identities to a
  committee after a plan is distributed. Recruiters always have the access needed
  to recruit for their represented committees. Other active committee members gain
  identity access only after an authorized reveal.

## Invariants

- Admission-wide administration requires an active membership in one of the
  admission's admin groups, or a God-listed LEGO id (`constants.GOD_LEGO_IDS`).
  All active members of an admin group are equal admission administrators. Admin
  groups do not manage committee interview schedules.
- An OAuth membership refresh replaces the local membership snapshot atomically.
  Missing, malformed, or unknown membership data must fail closed rather than
  retaining or creating privileges.
- Membership is written by the login pipeline and nothing else. The LEGO roster
  mirror widens who is listed, chased, and schedulable; it never widens who may
  do anything, and every permission check reads Membership directly.
- Only someone the app has actually seen sign in can be required to answer.
  Publication waits on their availability or opt-out; a mirrored member who has
  never signed in is shown as awaiting but cannot hold the plan hostage.
- Conflict-review filler names are drawn from a pool at least as wide as the
  real applicant population, and from a cohort bounded to roughly the size of
  the real candidate pool so fillers recur at the rate real candidates do. A
  narrower pool identifies real applicants by elimination; an unbounded one
  identifies them to any two interviewers who compare lists.
- Committee access is the union of represented committees and ordinary active
  memberships whose candidate identities have been revealed.
- Schedule responses omit rows outside the caller's scope entirely: rows past
  the publication boundary, and any row belonging to another committee. Time,
  panel, and row counts are sensitive, so an unauthorized row is dropped rather
  than blanked.
- Within a committee's own published plan, an ordinary member sees every row
  even before identities are revealed - a member who cannot see when they are
  interviewing cannot turn up. Those rows carry a placeholder name and nothing
  else about the candidate: no candidate id, no phone.
- After an authorized name reveal, ordinary committee members see the candidate's
  real name and the interview status (the value) but not the recruiter-side
  metadata - not who last changed the status, not when. Those fields are
  workflow information reserved for interview admins. The status itself stays
  visible so members can see whether the candidate has confirmed; only the
  provenance is hidden.
- A placeholder names the same person for as long as it is shown. It is
  numbered over the committee's whole candidate set, never over the rows in one
  response, or extending the publication would renumber people who had already
  been written down. Gaps in the sequence are expected.
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
- `utils/lego_service.py` owns server-to-server LEGO reads on the service
  credential, and is never reachable from a request.
- `interview_workflow.py` owns concurrency-safe interview-status transitions.
- `solve_jobs.py` owns solve-job lifecycle operations.
- `candidate_views.py`, `availability_views.py`, `solve_views.py`, and
  `schedule_views.py` adapt HTTP requests to those policies and workflows.
- `schedule_validation.py` validates and canonicalizes persisted schedules.
