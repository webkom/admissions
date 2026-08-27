# Admissions: AI system context

## Purpose and scope

`admissions` (Norwegian product name: **opptak**) is Abakus's recruitment
application. It lets a student organization run a recruitment period from
application creation through committee review, interview scheduling, plan
publication, and interview follow-up.

This document is a detailed orientation guide for an AI working on the
repository. It describes the **current working tree on `distribute-interviews`**,
including uncommitted work. It is not a statement about `master` or a deployed
environment. Verify branch and working-tree state before making a history or
deployment claim.

The short, normative companion is [CONTEXT.md](CONTEXT.md). When this file and
the code differ, treat the code and tests as the current implementation, and
preserve the invariants in `CONTEXT.md` unless a deliberate product decision
changes them.

## Product in one sentence

An admission administrator configures a time-bounded recruitment round and its
committees; applicants submit one application that may target several
committees; authorized recruiters review candidates; committee members submit
availability and conflicts; an asynchronous OR-Tools solver proposes a complete
interview plan; administrators publish it; and candidate identity is revealed
to committees only through explicit, audited scope controls.

## Vocabulary: do not conflate these concepts

| Term | Meaning |
| --- | --- |
| **Admission** | One recruitment period, e.g. a semester's main recruitment. It has dates, shared questions, participating committees, and admission-wide admin committees. |
| **Group** | An Abakus committee/team imported from LEGO. A group can participate in many admissions. |
| **Admin group** | A group whose active `leader` or `recruiting` members administer the whole admission, including all candidates and the full schedule. Ordinary members do not inherit that authority. |
| **Admission group** | The join between an admission and a participating group. It carries question fields unique to that group. |
| **User application** | One candidate's application to one admission. Holds identity, phone number, shared text/answers, and the single admission-wide interview status. |
| **Group application** | The candidate's application material for one participating group. One user application can contain several group applications. |
| **Recruiter / representative** | An active `leader` or `recruiting` member of a participating group. They can see and act for their represented groups. |
| **Committee member** | An active member of a participating group. They can participate in scheduling, but do not automatically see candidate identity. |
| **Saved schedule** | The canonical persisted schedule configuration and plan for an admission. It is a single `OneToOne` object, not one plan per group. |
| **Draft plan** | A saved schedule with `is_distributed=false`. Administrators can see it; ordinary committee users cannot see its rows. |
| **Published/distributed plan** | A schedule with `is_distributed=true`. Committee users may see only rows in their authorized candidate scope. |
| **Solve job** | An asynchronous request to generate a plan. It is queued and executed by the solver worker, not inside the HTTP request. |
| **Availability** | A committee participant's chosen open time slots and declared candidate conflicts for one admission. |
| **Conflict / inhabilitet** | An interviewer says they must not interview a particular candidate. This is an exclusion constraint, not merely a visual warning. |
| **Lock** | A schedule row marked `locked=true`. It is a manual commitment retained by future solver runs. |
| **Booking source** | `solver` for a generated proposal, or `manual` for a manually arranged interview. Marking manual also locks the row. |

## Actors and authorization model

Membership is imported from the LEGO identity service at OAuth login. Inactive
roles (`retiree`, `alumni`, `retiree_email`) never grant active access.

| Actor | Primary capabilities |
| --- | --- |
| Applicant | Browse admissions, choose groups, create/update their own application while the admission is open, withdraw it, and view the receipt. |
| Admission administrator | Full candidate access; create/edit the plan configuration; see all availability and genders; enqueue/cancel/inspect solve jobs; edit all schedule rows; publish/unpublish; export admission-wide data; inspect disclosure audit events. This is a leader/recruiting member of an `admin_groups` group, plus organisation-listed God users who are admission-wide admins in every opptak regardless of `admin_groups`. |
| Recruiter (`leader`/`recruiting`) | Review applicants for represented groups; see candidate identity and contact data for their scope; submit their own availability and inspect represented-group availability; reveal/hide their represented groups after a plan is published; update interview status; use outreach actions. |
| Ordinary committee member | Submit their own availability; see their own interviews after publication; can see candidate identity only for groups explicitly revealed to them; can record conflicts only after names are visible. |
| Admission manager | Creates/edits admissions. This is an active Webkom member, or a staff creator under the repository's manager rules. |

Important access rules:

- Being in a participating committee does **not** mean the person may see every
  candidate or every schedule row.
- Recruiters always have the candidate scope needed to recruit for their own
  represented groups. Ordinary members acquire scope only through a reveal.
- Server responses omit rows outside the caller's scope entirely - rows past the
  publication boundary, and other committees' rows. Time, panel, and counts leak,
  so an out-of-scope row is dropped rather than blanked.
- Inside a committee's own published plan the rule is different: an ordinary
  member sees every row even while identities are hidden, because a member who
  cannot see when they interview cannot show up. Those rows carry a placeholder
  ("Kandidat N") and nothing else about the candidate - no id, status, or phone.
  Placeholders are numbered over the committee's whole candidate set, never over
  the rows in one response, so extending the publication cannot renumber someone
  a member already wrote down.
- Candidate email and phone in schedule payloads are limited to admission
  administrators and recruiters. They are used to prefill `mailto:`/`sms:`
  drafts; the app does not send a message directly.
- Frontend caches marked as sensitive are purged and blocked after relevant
  `401`, `403`, scoped `404`, role-scope, or authenticated-actor changes.
  Sensitive requests capture monotonic authority epochs so delayed callbacks
  from an earlier scope remain inert after purge or verified recovery. Do not
  reintroduce stale candidate data through optimistic or delayed writes.
- Membership updates are atomic snapshots at OAuth login. A LEGO role change is
  not instantly reflected in an existing session; urgent revocation also needs
  the admissions session invalidated.

## Core data model

### Admission and application data

`Admission` contains:

- `title`, immutable-after-create `slug`, description;
- `open_from`, `public_deadline`, and `closed_from` (enforced chronological);
- shared `header_fields` question schema;
- `groups` (participating committees) and `admin_groups` (admission-wide
  administrators). On top of `admin_groups`, organisation-listed God users are
  always admission-wide admins, even when they are not members of a group in
  the admission.

Question fields use Pydantic-backed JSON models. Supported types are display
text, text input, textarea, number input, phone input, and checkbox. Each input
field has a stable ID, title, label, placeholder, and required flag. Shared
questions live on `Admission`; committee-specific questions live on the
`AdmissionGroup` join record.

`UserApplication` is unique per `(admission, user)`. It stores shared text,
phone, shared question responses, timestamps, and one `interview_status`.
`GroupApplication` is unique per `(user application, group)` and stores that
group's text and answers. Do not move interview status down to a group
application unless the product is intentionally changing from one admission-wide
interview to separate interviews per committee.

Application writes are transactional. A resubmission updates the one user
application, creates/updates selected group applications, and removes groups
the candidate deselected. Recruiter withdrawal-notification email is best
effort: a mail failure must never roll back the user's application change.

### Interview follow-up state

The admission-wide `interview_status` values are:

`not_invited` → `invited` → `confirmed` / `declined` → `completed` or
`cancelled` as operationally appropriate. The code treats these as editable
states rather than enforcing a narrow transition graph.

Changing status uses optimistic concurrency through
`expected_interview_status_updated_at`, locks the row in a transaction, updates
a dedicated workflow timestamp (not the candidate-facing application timestamp),
and writes an `InterviewStatusAuditEvent` with actor, actor-name snapshot,
previous status, next status, and time. Repeating the same status does not make
an audit event.

### Schedule data

`SavedSchedule` owns both configuration and plan:

- date range (`start_date`, optional `end_date`), day bounds, and
  `session_duration`;
- `enabled_windows` (canonical contiguous intervals) and compatibility
  `enabled_slots` (individual string keys such as date + minute);
- interview blocks: `chunk_size` consecutive appointments and optional
  `chunk_break_minutes` between blocks;
- `panel_size` and solver options;
- plan rows, draft/published state, visibility state, and last-update revision.

A row has `candidate_id`, display candidate name, integer `time`, a full panel,
optional `locked`, and optional `booking_source`. Server-side canonicalization
is authoritative: it resolves names from IDs, recomputes overtime, and refuses
unknown candidates/interviewers, duplicated candidates/times/panel members,
self-interviews, unavailable manual assignments when overtime is disabled,
conflicts, invalid open times, invalid same-gender panels, and inconsistent
same-panel blocks.

`expected_updated_at` is required on schedule writes. A missing, stale, or
ambiguous revision is a `409`, not a last-writer-wins update. Configuration
changes that alter the grid clear an existing plan, reset publication, remove
submitted availability (because it no longer matches the grid), and delete
queued/finished solve jobs for that admission.

## End-to-end user flows

### 1. Create and configure an admission

1. A manager visits `/manage` and creates or edits an admission.
2. They provide title, slug, description, the three dates, at least one admin
   group, and at least one participating group.
3. They configure shared questions and optional per-group questions.
4. The public landing page lists admissions, sorted to favor open/applicable
   rounds. It shows a timeline/countdown and routes eligible users to their
   application, administrator panel, or scheduler.

The manager route is separate from recruiter administration. Do not assume a
recruiter can globally alter admission timing or participating committees.

### 2. Applicant application flow

1. An authenticated applicant enters `/:admissionSlug/velg-grupper` to choose
   groups, unless the admission has only one group.
2. At `/:admissionSlug/min-soknad`, they fill in phone number, shared text,
   shared questions, group-specific text, and group-specific questions.
3. The frontend stores local drafts scoped by admission and user. The backend
   validates the selected groups and all required field responses.
4. The receipt screen lets the applicant view, edit, or withdraw the
   application while allowed by the admission dates.

### 3. Recruiter application review

1. A recruiter opens `/:admissionSlug/admin/`.
2. The application list is scoped: admission administrators see all candidate
   data; recruiters see only their represented groups, with shared answers
   withheld where they are not admission administrators.
3. They can filter by group and interview status, toggle candidate-data display,
   inspect mobile triage rows or desktop tables, export CSV within their scope,
   edit group description/response label if authorized, delete applications in
   scope, and update interview status.

### 4. Interview scheduling workflow

The scheduler is at `/:admissionSlug/schedule`. It is deliberately a workflow,
not a single calendar:

1. **Rammer / configuration** (administrator only): set interview dates, daily
   start/end, appointment duration, contiguous open windows, block size, and
   breaks. Save creates or revises the `SavedSchedule`.
2. **Tilgjengelighet / availability**: participants select the open slots when
   they can interview. Administrators can see all participation; recruiters can
   inspect their represented group; ordinary members only see themselves.
3. **Inhabilitet / conflicts**: users record candidate IDs they cannot
   interview. A recruiter/admin may do this in their candidate scope; an
   ordinary member must first have name visibility for a relevant group.
4. **Fordeling / coverage heatmap** (administrator only): inspect capacity and
   who has submitted availability before solving.
5. **Intervjuforslag / solver proposal** (administrator only): choose panel
   size and solver options, run the job, review partial/unplaceable results,
   edit rows, and persist the proposal.
6. **Intervjuplan / plan**: administrators publish or unlock a plan; committee
   users see the publication appropriate to their scope. Table and calendar
   views can filter to the current user's interviews. ICS output is anonymized;
   CSV is constrained by identity scope.

The workflow stepper is role-sensitive. Members see only availability and plan;
administrators see configuration, availability, coverage, solver, and plan.
The UI's status badges are guidance, not authorization—the backend remains the
source of truth.

### 5. Publication, visibility, outreach, and manual changes

- A plan cannot publish empty and canonical validation requires every active
  candidate to be scheduled before publication.
- Publication turns `is_distributed` on. Unlocking turns it off so it can be
  edited; normal committee users then lose draft-row access.
- Visibility starts hidden. `committee` means identities are revealed to all
  participating groups, but the system can represent a partial per-group
  reveal through `revealed_groups` and reports that as `admin_only` rather than
  pretending all groups can see names.
- Recruiters can toggle visibility only for their represented groups and only
  as the dedicated name-visibility mutation. They cannot edit the whole plan.
- Every reveal/hide is audited. Removing a participating group revokes and
  audits its disclosure; newly added groups start hidden. A partial disclosure
  is not silently restored by remove/re-add.
- Admins can change time, swap a panel member, set manual/solver origin, and
  lock/unlock rows. Manual changes lock the row so a re-solve preserves it.
- Once names are visible and the user may manage interview workflow, the plan
  offers invitation/follow-up actions. Email and SMS templates are currently
  browser-local, keyed per admission in `localStorage`, with separate email
  subject/body and SMS body. Do not mistake them for server-persisted templates.

## How the scheduler actually works

### Slot representation and setup

The browser expresses open slots as canonical date/minute keys. The backend
normalizes them into contiguous `enabled_windows` and derives the corresponding
slots. The solver uses integer minutes relative to `start_date`:

`day_index * 1440 + minute_of_day`

Blocks are generated per day from day bounds, appointment duration, chunk size,
and breaks, then filtered to enabled slots. A block represents a run of
back-to-back appointments that can require the same panel.

The schedule period is bounded to 21 days; the APIs also bound slot/window,
candidate, interviewer, conflict, panel, and block sizes. These are safety
limits, not mere frontend suggestions.

### Who becomes an interviewer

The roster is the union of two sources. `Membership` is written only by the
OAuth login pipeline, so on its own it lists just the people who have already
signed in - which is the wrong half of a committee when the question is "who
has not answered yet". `CommitteeRosterEntry`, mirrored from LEGO by
`sync_committee_rosters`, covers the rest. A mirrored person gets a local
`LegoUser` row (unusable password, no `Membership`) so the app can name,
chase, and schedule them; they gain no access until they sign in for real.

`get_eligible_interviewer_ids` returns that union and decides display, write-
on-behalf, and panel eligibility. `get_responding_interviewer_ids` returns the
`Membership` half alone and decides one thing only: whose answer publication
may wait for. Do not collapse them - requiring an answer from someone who has
never opened the app deadlocks the publish.

Eligible interviewers are all active members of participating groups, plus an
admission-admin member who has submitted availability. This avoids implicitly
including every administrator while allowing an administrator who opts in to
participate. The non-synthetic solve endpoint rehydrates candidate and
interviewer data from the database; client-provided names, availability, and
conflicts are not trusted.

### Asynchronous job lifecycle

1. An administrator `POST`s `/api/solve/` after a schedule configuration exists.
2. The server validates authorization, rehydrates canonical inputs, refuses a
   duplicate active job for the admission, snapshots the request, and returns
   `202` with `job_id`.
3. `run_solver_worker` claims the oldest pending job with row locking, marks it
   `RUNNING`, solves outside the lock, then writes `DONE` plus result or `ERROR`.
4. The browser polls `/api/solve/<job_id>/`; an administrator can `DELETE` to
   cancel an active job.
5. A watchdog marks stale pending/running jobs as error, and completed/error/
   cancelled jobs are retained only one day.

The worker is mandatory. Starting Django directly without it makes jobs remain
`PENDING`; `make dev` starts both. Multiple workers are safe because job claims
use locks, although one worker is normally enough.

The same worker loop also carries the two LEGO syncs (committee rosters and the
decoy directory), throttled to `ADMISSIONS_LEGO_SYNC_INTERVAL_SECONDS`, default
six hours. They ride the worker rather than a cron entry because the worker
already has to exist wherever the scheduler is on, and both degrade silently
when unscheduled - an empty decoy pool means review lists made only of real
applicants. Both are no-ops without `ADMISSIONS_ROSTER_SYNC_CLIENT_ID`/`_SECRET`,
and both can be run by hand as management commands. The service credential must
never be used to serve a request: it is more privileged than any person using
the app.

### Solver inputs and hard constraints

The solver is OR-Tools CP-SAT. For each candidate, time, and interviewer it
creates Boolean placement/assignment variables. It enforces:

- at most one interview per candidate;
- at most one candidate occupying a time slot;
- exactly `panel_size` distinct interviewers for a placed interview;
- at most one assignment per interviewer per time;
- no declared interviewer-candidate conflict;
- no unavailable interviewer when overtime is disabled;
- optional same-gender representation when usable gender data exists;
- optional identical panels for all occupied slots in a configured block;
- locks: the locked candidate, time, and full panel are pinned and validated
  before solving.

A malformed or contradictory lock returns an explicit `LOCKED_CONFLICT`
response instead of an opaque infeasible result. The solver also fails early if
the model-variable estimate exceeds the configured limit, which protects the
worker from huge model construction before CP-SAT's search timeout applies.

### Optimization order

The objective is intentionally lexicographic by weight:

1. maximize the number of placed candidates (dominates all secondary goals);
2. minimize overtime;
3. balance workload (maximum load and spread among usable interviewers);
4. favor earlier slots and continuous occupied runs;
5. as a strictly lower-priority tie-breaker, keep prior plan times/panels where
   they are otherwise equally good.

This means an oversubscribed/overconstrained admission should produce a
`PARTIAL` plan plus candidate-specific unplaceable reasons, rather than drop
the entire plan. The solve may run up to five minutes; successful easy cases
return earlier. The seed and interleaved parallel search aim for repeatable
re-solves, but neither should be treated as a promise that every future solver
version returns byte-identical output.

### Manual editing and re-solving

Editing a row in the proposal or plan is server-validated and marks it locked
when it becomes a manual arrangement. Subsequent solves receive locked rows and
must preserve them. Unlocking a row returns it to solver ownership. The frontend
uses a server revision to detect that someone else changed the schedule while a
local proposal is being edited; it must surface a conflict rather than overwrite
remote work.

## HTTP/API map

All APIs use session authentication and CSRF-protected browser requests.

| Area | Routes | Notes |
| --- | --- | --- |
| Public admissions | `GET /api/admission/`, `GET /api/admission/:slug/` | Lists and detail including applicant-specific `userdata`. |
| Applicant's application | `POST /api/admission/:slug/application/`; `GET`/`DELETE .../mine/` | Create/update is one transactional submission; withdrawal is allowed even if notification email fails. |
| Recruiter/admin applications | `GET /api/admin/admission/:slug/application/`; `PATCH .../:id/interview-status/`; `DELETE .../:id/` | Queryset and fields are scoped by role/group. |
| Admission management | `/api/manage/admission/`, `/api/manage/group/` | Manager-facing create/edit/delete and group listing. |
| Recruiter/admin admission view | `GET /api/admin/admission/:slug/` | Returns the admission with privileged data. |
| Schedule | `GET`/`PATCH /api/admin/admission/:slug/schedule/` | Requires revision for writes; response is filtered/redacted by server scope. |
| Availability | `GET`/`POST /api/admin/admission/:slug/availability/` | Slots must be in enabled grid; conflicts must be in caller's visible candidate scope. |
| Candidate list for scheduler | `GET /api/admin/admission/:slug/candidates/` | Returns no identities when caller lacks scope. |
| Name-visibility audit | `GET /api/admin/admission/:slug/name-visibility-audit/` | Admission administrators only. |
| Solve jobs | `POST /api/solve/`; `GET`/`DELETE /api/solve/:job_id/` | Administrators only; job polling/cancellation. |

## Frontend route and module map

| Responsibility | Primary location |
| --- | --- |
| SPA/router, React Query sensitive-cache handling | `frontend/src/index.tsx` |
| Landing page and admission cards | `frontend/src/routes/LandingPage/` |
| Applicant portal and nested routes | `frontend/src/routes/ApplicationPortal.tsx` |
| Applicant selection/form/receipt | `frontend/src/routes/GroupsPage/`, `ApplicationForm/`, `ReceiptForm/` |
| Global admission manager | `frontend/src/routes/ManageAdmissions/` |
| Recruiter application review | `frontend/src/routes/AdmissionAdmin/` |
| Scheduler orchestration and workflow tabs | `frontend/src/routes/SchedulePage/index.tsx`, `workflowSteps.ts`, `useScheduleWorkflow.ts` |
| Schedule config and personal availability state | `useScheduleConfiguration.ts`, `useAvailabilityEditor.ts` |
| Schedule plan view/publication/export/outreach | `DistributedPlanView.tsx`, `useDistributedPlanActions.ts`, `distributedPlanExports.ts`, `interviewOutreach.ts` |
| Solver UI/session/draft persistence | `frontend/src/components/Scheduling/Solver/` |
| Calendar setup, availability grid, heatmap | `frontend/src/components/Scheduling/Calendar/` |
| API query/mutation hooks | `frontend/src/query/hooks.ts`, `mutations.ts`, `queries.ts` |

## Backend module map

| Responsibility | Primary location |
| --- | --- |
| Persistent models | `admissions/admissions/models.py` |
| API endpoints/viewsets | `admissions/admissions/views.py`, `schedule_views.py`, `availability_views.py`, `candidate_views.py`, `solve_views.py` |
| Serialization, question validation, response shaping | `admissions/admissions/serializers.py`, `json_models.py` |
| Membership/disclosure access policy | `admissions/admissions/admission_access.py`, `permissions.py` |
| Interview status concurrency/audit | `admissions/admissions/interview_workflow.py` |
| Schedule write workflow and revision checks | `admissions/admissions/schedule_workflow.py` |
| Schedule/solver canonicalization | `admissions/admissions/schedule_validation.py`, `schedule_windows.py`, `scheduling_utils.py` |
| CP-SAT model | `admissions/admissions/solve_schedule.py` |
| Job enqueue/cancel lifecycle | `admissions/admissions/solve_jobs.py` |
| Long-lived worker | `admissions/utils/management/commands/run_solver_worker.py` |
| LEGO service-credential HTTP | `admissions/utils/lego_service.py` |
| Committee roster / decoy pool syncs | `admissions/utils/management/commands/sync_committee_rosters.py`, `sync_directory_entries.py` |
| URLs | `admissions/urls.py` |

## Non-negotiable implementation guidance for another AI

1. Check whether a requested scheduling change targets configuration, personal
   availability, solver proposal, or distributed plan. These are adjacent but
   distinct interfaces with different authority.
2. Treat the backend as authoritative for membership, scope, candidate details,
   schedule validity, solver input, and revision conflicts. Frontend checks are
   usability aids only.
3. Do not broaden a response merely because the UI can hide data. Omit rows and
   fields server-side according to scope.
4. Preserve candidate identity boundaries in logs, Sentry, exports, local state,
   error text, and query caches. ICS must stay anonymous; CSV must respect
   caller visibility.
5. Preserve a single interview/status per user application unless explicitly
   redesigning the business model.
6. Keep manual locks durable across re-solves. A re-solve must never silently
   move a manually committed interview.
7. Schedule-grid changes invalidate plan and availability by design. Do not
   retain data against a changed time grid without an explicit migration model.
8. Use optimistic revisions for schedule and interview-status writes. Never
   silently overwrite a newer plan/status.
9. Keep solver work out of web requests. Do not replace the queue/worker with a
   synchronous solve just because a small fixture is fast.
10. Do not rely on client-provided solver identities or conflict data in normal
    production solving. The server rehydrates canonical data from its database.
11. Run targeted backend tests and affected frontend checks after changes. For
    Django tests on this checkout, local parallel development generally needs
    `DATABASE_PORT=5433 poetry run tox -e tests`.
12. The product is Norwegian-facing. Preserve Norwegian user copy unless the
    requested task is a localization change; code/domain names remain English.

## Local development and verification

- The backend is Django, the frontend is React/Vite, and PostgreSQL is supplied
  by Docker or a local service. LEGO and lego-webapp are needed for full local
  OAuth.
- Use `127.0.0.1:5002`, not `localhost`, for the admissions app; sharing a
  hostname with local LEGO conflicts with session storage.
- `make dev` is the normal backend development command because it starts Django
  and the solver worker. If using `manage.py runserver`, also run
  `poetry run python manage.py run_solver_worker`.
- Frontend development uses the repository's package scripts (`yarn dev` in the
  README; this working tree also contains pnpm metadata). Follow the active
  lockfile/package-manager convention of the task rather than mixing installers.
- Relevant regression suites include API, schedule hardening, solver quality,
  worker resilience, OAuth, stale-session recovery, application/admin tests,
  and Cypress interview-plan workflow tests under `cypress/e2e/`.

## Known boundaries and intentional limitations

- There is no automatic post-admission candidate-retention/deletion policy in
  the product. Production operation needs an approved retention period and
  deletion procedure; solver-job cleanup is unrelated.
- Outreach templates are local-browser convenience state, not shared workflow
  configuration or a delivery system.
- A published plan may still have partial candidate disclosure. Do not infer
  that `is_distributed` means every committee member sees every name.
- Candidate/gender data is sensitive. Same-gender panel enforcement is skipped
  when usable interviewer gender data does not exist, rather than making all
  gendered candidates impossible to schedule.
- A solver `TIMEOUT`, `ERROR`, `INFEASIBLE`, `LOCKED_CONFLICT`, and `PARTIAL`
  have distinct meanings. Do not present them all as a generic failed solve.
