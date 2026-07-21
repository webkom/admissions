# Feature Context: Admission Scheduler

## 1. Executive summary

**Confirmed:** The admission scheduler is an admission-wide workflow at `/:admissionSlug/schedule`. It stores one canonical `SavedSchedule` per admission, gathers interviewer availability and candidate conflicts, queues an administrator-only OR-Tools CP-SAT solve as a `SolveJob`, lets administrators edit and lock the result, and publishes it by setting `is_distributed=true`.

**Confirmed:** The current checkout is branch `distribute-interviews`, not `master` or a deployed environment. It has extensive uncommitted changes, including most of the newer scheduler workflow and privacy model. Claims below describe the active working tree and distinguish repository guidance from code evidence where relevant.

The likely change boundary depends on the requested behavior: configuration belongs in `schedule_workflow.py` and `AdminScheduleConfig*`; solving belongs in `solve_schedule.py`, `solve_views.py`, `solve_jobs.py`, and the solver UI; publication and row visibility belong in `schedule_validation.py`, `schedule_workflow.py`, `admission_access.py`, and distributed-plan components. The decisive constraints are revision checks, server-side rehydration/canonicalization, omission of unauthorized rows, locked-row preservation, and the difference between an unpublished draft and a published plan.

**Confirmed gaps/risk:** runtime deployment/worker health is not established by repository inspection; ordinary end-to-end runtime behavior was not started. The checkout also contains an explicitly synthetic solver-input path controlled by settings, so local/demo behavior must not be assumed to match production.

## 2. Requested feature or problem

The request was to “write about the admission scheduler”; no implementation requirement or specific defect was supplied.

**Explicit requirement:** Produce a repository-grounded technical context brief for an external model.

**Implied requirement:** Explain current behavior, interfaces, ownership boundaries, constraints, tests, and likely change surface without implementing anything.

**Plausible interpretations:** “Scheduler” could mean the entire interview scheduling workflow, only the OR-Tools solver, only the admin schedule configuration UI, or the published interview-plan UI. This brief covers the full workflow and calls out those boundaries.

**Distinct subsystems not to conflate:** admission creation/application review; interviewer availability; conflict review; solver proposal generation; manual plan editing; publication/name disclosure; interview follow-up status and outreach. Interview status is stored on the admission-wide application and is adjacent to, but not the same as, schedule placement.

## 3. Project and architecture context

The project is a Django + Django REST Framework backend with a React/TypeScript frontend and Cypress/browser tests. The solver uses OR-Tools CP-SAT. Schedule mutations use session authentication, DRF permissions, scoped throttling, database transactions, and optimistic revision checks.

Relevant map:

```text
admissions/admissions/models.py              persistence entities
admissions/admissions/schedule_views.py      SavedSchedule HTTP adapter
admissions/admissions/schedule_workflow.py   transactional schedule state machine
admissions/admissions/schedule_validation.py  canonicalization and invariants
admissions/admissions/solve_views.py         enqueue/status/cancel HTTP adapters
admissions/admissions/solve_jobs.py          queue request construction/lifecycle
admissions/admissions/solve_schedule.py      CP-SAT model and objective
admissions/utils/management/.../run_solver_worker.py  worker loop
admissions/admissions/admission_access.py    role and response-scope policy
frontend/src/routes/SchedulePage/             workflow shell and published plan
frontend/src/components/Scheduling/            config, availability, solver views
cypress/e2e/*schedule* and *interview_plan*   browser acceptance coverage
admissions/admissions/tests/test_*schedule*   API, solver, worker, privacy coverage
```

`CONTEXT.md` is the normative compact domain guide. `ADMISSIONS_AI_CONTEXT.md` describes a working tree on `distribute-interviews`, including uncommitted work; code and tests are the current evidence for behavior.

## 4. Current user and system behavior

### Actors and entry

Admission administrators are active members of an admission’s `admin_groups`. Recruiters are active `leader`/`recruiting` members of participating groups. Ordinary active committee members can submit their own availability and, after publication and disclosure, see authorized interviews. Only administrators can configure, solve, inspect solve jobs, edit the complete schedule, publish/unpublish, or export admission-wide scheduling data.

The frontend route is `/:admissionSlug/schedule`; the backend schedule endpoint is `/admin/admission/<admission_slug>/schedule/`. The workflow stepper is role-sensitive: members see availability and plan surfaces; administrators also see configuration, coverage, solver, and publication controls.

### Configuration

Administrators set `start_date`, optional `end_date`, `day_start_minute`, `day_end_minute`, `session_duration`, `enabled_windows` (with legacy `enabled_slots` compatibility), `chunk_size`, `chunk_break_minutes`, `panel_size`, and solver options. Windows are normalized to canonical contiguous intervals and derived slot keys. The period and slot counts are bounded by constants.

Changing the grid or block shape clears an existing plan when the request did not explicitly provide a replacement, unpublishes it, and removes availability that no longer matches the grid. A new schedule write requires `expected_updated_at=null`; an update requires the exact server revision. Stale or missing revisions return `409` rather than last-writer-wins behavior.

### Availability and conflicts

`InterviewAvailability` is unique per `(admission,user)` and stores selected slots, candidate conflict IDs, and reviewed candidate IDs. The UI includes participant availability editing, an administrator heatmap/coverage surface, and conflict review for proposed assignments. A participant’s conflicts are hard solver exclusions, not just visual annotations.

### Solving and proposal review

The administrator starts a solve from the solver setup surface. The request is validated and canonicalized against database candidates, interviewers, availability, conflicts, schedule configuration, and locked assignments. The HTTP request enqueues a job and returns immediately; the frontend polls job status. The result can be `SUCCESS`, `PARTIAL`, `INFEASIBLE`, `TIMEOUT`, `ERROR`, or a locked-conflict result from validation/worker handling. Partial results include unplaceable candidates and reasons.

The solver maximizes placement first. Secondary behavior includes overtime penalties, interviewer load balancing, earliness/continuity preferences, same-gender coverage when enabled, same-panel-per-block behavior for initial planning, and repair profiles (`minimum_change`, `preserve_panels`, `balanced`) when a previous schedule is supplied. Locked rows are pinned across reruns. Manual assignment marks a row as manual and locks it.

### Publication and follow-up

An unpublished schedule is a draft visible to administrators. A changed published schedule automatically unpublishes unless explicitly published again. Publishing an empty plan is rejected; publication canonicalization requires all active candidates to be scheduled and checks conflicts, panel size, valid times, interviewer identity, availability/overtime, gender, and block consistency.

Publishing opens the committee-facing plan. Candidate identity is separately controlled by `name_visibility` and `revealed_groups`; disclosure is audited. ICS export is anonymized, while CSV and schedule rows are scoped to the requesting user. Email/SMS actions open browser drafts; they do not send messages or persist templates server-side. Interview status updates are a separate optimistic-concurrency workflow on `UserApplication`.

## 5. End-to-end execution flow

1. An authenticated user enters `/:admissionSlug/schedule`; the frontend loads admission context, the saved schedule, participant/availability data, and role-sensitive workflow state.
2. An administrator saves configuration through the schedule mutation. `SavedScheduleView.post` validates `SaveScheduleInputSerializer`, calls `update_saved_schedule`, locks the admission/schedule path transactionally, normalizes windows/slots, checks `expected_updated_at`, canonicalizes any supplied rows, and persists one `SavedSchedule`.
3. Participants submit availability and conflicts through the availability APIs. Access is scoped by represented committee, admin role, or current-user ownership.
4. The administrator opens coverage and solver setup. The client builds solver options and locked assignments from the current draft, including `baseline_updated_at` for repair/re-solve protection.
5. `SolveScheduleView.post` verifies administrator access, validates `ScheduleRequestsSerializer`, locks the admission, rejects a missing saved configuration, rejects a stale baseline when supplied, and canonicalizes non-synthetic input from database state.
6. `enqueue_solve_job` creates one pending `SolveJob` per admission. A partial unique database constraint and an `IntegrityError` fallback make concurrent enqueue requests converge on the existing active job.
7. `run_solver_worker` claims pending jobs, rehydrates candidates/interviewers and current availability for non-synthetic jobs, calls `solve_schedule`, stores result/error/status timestamps, and releases the active-job slot on completion/failure/cancellation.
8. The frontend polls `SolveJobStatusView`, displays progress/error/partial/unplaceable/optimality state, and holds the solve result as a draft until the administrator explicitly persists it.
9. Manual row edits, time changes, panel changes, and lock/unlock operations update the draft. Manual changes are represented independently from `interview_status` and normally retain ownership across future solves.
10. The administrator persists the proposal. `schedule_workflow` re-canonicalizes it and opens assignment conflict review while it remains unpublished.
11. Participants review assigned candidates/conflicts where authorized. Publication is rejected until required review is complete and all candidates are placed.
12. The administrator publishes. `is_distributed` becomes true, disclosure controls become eligible, and committee users receive only rows in their authorization scope. Unpublishing hides draft rows from ordinary committee users.
13. After publication, authorized users can view filtered table/calendar/person plans, export scoped artifacts, open outreach drafts, and update admission-wide interview status with its own revision/audit workflow.

```mermaid
sequenceDiagram
  participant Browser
  participant ScheduleAPI
  participant DB
  participant Worker
  participant Solver
  Browser->>ScheduleAPI: GET/POST SavedSchedule
  ScheduleAPI->>DB: validate, revise-check, canonicalize, persist
  Browser->>ScheduleAPI: POST solve request
  ScheduleAPI->>DB: create one active SolveJob
  Browser->>ScheduleAPI: poll job status
  Worker->>DB: claim and rehydrate job/input
  Worker->>Solver: solve CP-SAT model
  Solver-->>Worker: complete/partial/infeasible/timeout result
  Worker->>DB: persist result and terminal status
  Browser->>ScheduleAPI: save proposal / publish
  ScheduleAPI->>DB: canonicalize, review-check, persist publication
```

## 6. Relevant files and symbols

| File | Symbol or section | Role | Why it matters |
| --- | --- | --- | --- |
| `admissions/admissions/models.py:257-470` | `SavedSchedule`, `InterviewAvailability`, `SolveJob` | Persistence | Canonical schedule/config, participant state, async queue and uniqueness constraint. |
| `admissions/admissions/schedule_views.py:30-135` | `SavedScheduleView` | HTTP adapter | Auth, throttling, revision-aware read/write path. |
| `admissions/admissions/schedule_workflow.py:57-535` | `update_saved_schedule` and helpers | State machine | Window normalization, grid-change clearing, publication/review transitions, transaction. |
| `admissions/admissions/schedule_validation.py:92-400` | canonicalizers | Server authority | Rehydrates names/IDs and enforces schedule invariants. |
| `admissions/admissions/solve_views.py:34-220` | solve/status/cancel views | Async API | Admin gate, baseline check, enqueue, polling and cancellation. |
| `admissions/admissions/solve_jobs.py:7-79` | queue helpers | Queue contract | Request shape and one-active-job behavior. |
| `admissions/admissions/solve_schedule.py:1-704` | solver model | Optimization | Constraints, objectives, repair strategies, result statuses. |
| `admissions/utils/management/commands/run_solver_worker.py` | `Command` | Worker | Claims and executes jobs outside HTTP. |
| `admissions/admissions/admission_access.py` | schedule response/access helpers | Privacy | Admission admin, recruiter/member scope, row omission and disclosure. |
| `admissions/admissions/serializers.py:685-1060` | schedule/job/input serializers | Contract validation | Response shape and bounded input fields. |
| `frontend/src/routes/SchedulePage/index.tsx` | route shell | UI entry | Selects workflow mode, role surfaces, and data loading. |
| `frontend/src/routes/SchedulePage/workflowSteps.ts` | workflow definitions | UI state | Distinguishes foundation, proposal, publication/execution. |
| `frontend/src/components/Scheduling/Calendar/AdminScheduleConfig.tsx` | admin config | UI | Date/grid/block configuration. |
| `frontend/src/components/Scheduling/Solver/SolverSetupPanel.tsx` | solve setup | UI | Options, rerun, lock continuity, repair entry. |
| `frontend/src/components/Scheduling/Solver/SolverResults.tsx` | proposal views | UI | List/calendar/person results and partial/error states. |
| `frontend/src/routes/SchedulePage/ScheduleInterviewWorkflow.tsx` | published plan | UI | Plan actions, outreach and interview follow-up. |
| `frontend/src/routes/SchedulePage/useDistributedPlanActions.ts` | plan mutations | UI/API bridge | Publish, edit, visibility, export and row operations. |
| `cypress/e2e/interview_plan_workflow_spec.cy.ts` | workflow specs | Acceptance | Confirms visible step separation, coverage and publication controls. |
| `admissions/admissions/tests/test_schedule_api_hardening.py` | schedule hardening tests | Backend regression | Revision, publication, conflict review and canonicalization behavior. |
| `admissions/admissions/tests/test_api.py` | API/solver tests | Backend regression | Locked assignment preservation and solve/job behavior. |

## 7. Data model and state

`Admission` owns participating `Group`s and administrator groups. `UserApplication` is one candidate application per admission; its group applications can be multiple, but interview placement and `interview_status` are admission-wide. `SavedSchedule` is a one-to-one admission object. Its `schedule` JSON contains rows shaped approximately as:

```json
{
  "candidate_id": "application-uuid",
  "candidate": "server-resolved display name",
  "time": 600,
  "panel": [{"id": "user-uuid", "name": "server-resolved name", "is_overtime": false}],
  "locked": true,
  "booking_source": "manual"
}
```

Time is an integer minute representation relative to the schedule start date in solver input/output; frontend utilities encode/decode date and minute keys. Availability stores canonical date/minute slot keys. `enabled_windows` is the preferred persisted representation; `enabled_slots` is derived/compatibility state.

Persisted state: `SavedSchedule`, availability/conflicts, `SolveJob`, disclosure/audit events, and application interview status. Derived/ephemeral state: frontend workflow step, solver polling state, current unsaved draft, coverage visualizations, and browser-local outreach templates. The worker result is not itself the canonical schedule until an administrator saves it.

Important invariants: one active solve job per admission; one schedule per admission; one availability row per participant; candidate appears at most once; one panel member cannot occupy overlapping slots; unknown/stale IDs are rejected; published plans are complete; locked rows remain solver-owned constraints until unlocked; schedule writes are revision-checked.

Authority is split deliberately: the browser proposes IDs/names and draft rows; the backend database and canonicalizer decide whether candidates, interviewers, time slots, conflicts, availability, and disclosure are valid. `SolveJob` owns asynchronous execution state; `SavedSchedule` owns durable plan/config state.

## 8. API and interface contracts

### Saved schedule

`GET /admin/admission/<slug>/schedule/` returns the scoped `SavedSchedule` or `404`; authenticated admission participants may read an authorized projection. `POST` accepts schedule/config fields plus required `expected_updated_at` (null only for first create). Administrators may mutate the full schedule/config; recruiters may use the narrow group name-visibility mutation. Responses include revision metadata, distribution, conflict-review and visibility state, and only authorized rows. Errors include `400` validation, `403` permission, `404` absent schedule/admission, and `409` stale revision.

### Availability and review

Availability endpoints accept the current user’s slots/conflicts or admin-scoped participant actions. They enforce admission/group scope and persist `InterviewAvailability`; conflict review also tracks reviewed candidate IDs and audit snapshots. Exact route declarations are in `admissions/urls.py` and adapters in `availability_views.py`/`candidate_views.py`.

### Solve

`POST /solve-schedule/` accepts `admission_slug`, candidate/interviewer IDs, panel size, options, locked assignments, optional blocks, and optional `baseline_updated_at`. Production-shaped requests set `rehydrate=true` through `build_solve_request`; synthetic candidate/interviewer payloads are only allowed by settings. It returns `202` with a `SolveJob`, returns an existing active job for duplicate/concurrent requests, `400` for invalid input/missing saved config, `403` for non-admins, and `409` for a stale baseline.

`GET` job status returns status, timestamps, result, and error to authorized admission administrators. Cancellation changes an active job to `CANCELLED`; worker claim/execution must tolerate cancellation and exceptions.

### Publication/disclosure

Publication is a `POST` to the saved-schedule endpoint with `is_distributed=true`, not a separate immutable publish entity. It is blocked for empty/incomplete/noncanonical plans or incomplete conflict review. Name visibility is a separate scoped mutation and is audited. Compatibility risk is high if a client treats `is_distributed` as equivalent to identity visibility.

## 9. Existing analogous implementations

The schedule workflow itself is the closest analogous state machine: reuse its revision-aware transactional update pattern for any new durable schedule state. `InterviewStatus` uses a separate optimistic-concurrency/audit workflow; reuse its audit and stale-write discipline, but do not move placement state into it.

The availability heatmap and `AdminAvailabilityGrid` are the nearest UI patterns for slot-grid editing and coverage visualization. They are reusable for interaction conventions, but their participant scope differs from the all-admission admin solver view.

The solver’s warm-start/locked-assignment path is the closest analogous repair mechanism. Reuse `locked_assignments`, `previous_schedule`, `baseline_updated_at`, and explicit repair strategies rather than inventing a second schedule version model.

The distributed plan table/calendar and export helpers are the analogous read-scope surfaces. They demonstrate that unauthorized rows must be filtered at the response/data-selection boundary, not merely hidden in presentation.

## 10. Business rules and constraints

**Confirmed hard constraints:** only admission admins can solve/edit the full plan; one active job per admission; schedule writes use optimistic revision checks; server canonicalization is authoritative; published schedules cannot be empty and must be complete; conflicts, duplicate candidates/times/panel members, unknown IDs, invalid times, self-interviews, same-gender requirements, and same-panel block rules are validated; locked rows survive reruns; unauthorized rows are omitted; disclosure is audited.

**Confirmed implementation conventions:** schedule period is bounded (the configured constant is used by `schedule_workflow`); slot/window counts and payload sizes are bounded; solve work is asynchronous; ICS is anonymized; outreach templates are browser-local.

**Inferred requirements:** changes to a published plan should be treated as a new review/publication step; repair previews should be compared against a specific baseline; user-facing partial results should remain actionable rather than silently discarded.

**Unknown product decisions:** whether publication should be immutable after distribution; whether conflict review should remain assignment-based or become a separate explicit approval model; desired worker retry/backoff and operational ownership; target maximum admission/candidate sizes; whether browser-local outreach templates should become shared durable templates.

## 11. Testing and validation

Relevant repository coverage includes:

- `admissions/admissions/tests/test_schedule_api_hardening.py`: stale revision conflicts, publication/unpublication, empty/incomplete plans, conflict-review readiness, canonicalized names/IDs, gender/panel constraints, and privacy-sensitive schedule behavior.
- `admissions/admissions/tests/test_api.py`: solve endpoint/job behavior and locked assignment preservation/conflicts.
- `admissions/admissions/tests/test_solver_quality.py`: solver quality/objective and constraint behavior.
- `admissions/admissions/tests/test_worker_resilience.py`: worker failure/cancellation resilience.
- `cypress/e2e/interview_plan_workflow_spec.cy.ts`: workflow navigation, outreach, coverage, publication controls, and separation of proposal vs published-plan editing.
- `cypress/e2e/admin_schedule_config_model_spec.cy.ts`, `admin_schedule_config_toggle_spec.cy.ts`, and `availability_coverage_model_spec.cy.ts`: frontend configuration and coverage model behavior.

Missing or uncertain coverage: full production-shaped browser flow against a real worker/database; runtime authorization with live LEGO membership refresh; queue crash/restart recovery across processes; large-admission performance; all export privacy combinations; and durable publication rollback.

Commands run for this investigation: repository/file inspection with `rg`, `find`, `git status`, `git log`, and `nl`; `git diff --check -- docs/feature-context/admission-scheduler.md` passed; `python manage.py check` was blocked because Django is not installed in the active environment; `yarn types` ran but failed with type errors in `frontend/src/components/Scheduling/Solver/repairScenarios.ts:151,155` and `frontend/src/components/Scheduling/Solver/SolverView.tsx:283`. No application was started. Recommended focused commands, subject to local dependency/database setup: `python manage.py test admissions.admissions.tests.test_schedule_api_hardening admissions.admissions.tests.test_solver_quality admissions.admissions.tests.test_worker_resilience` and the relevant Cypress specs.

## 12. Performance, security, and operational considerations

CP-SAT complexity grows with candidates × slots × interviewer assignments; bounds, solver timeouts, and a worker keep heavy work out of HTTP. The schedule and availability JSON fields can become large; query and payload limits are therefore material. A single active job prevents duplicate concurrent solves but also serializes solving per admission.

Revision checks protect schedule writes and baseline checks protect repair solves. The unique active-job constraint protects queue consistency. Worker retry semantics, orphaned `RUNNING` recovery, and durable result retention require runtime verification.

Authorization is high risk: candidate identity, time, panel, row count, exports, conflict data, and disclosure state are sensitive. Backend scope filtering is mandatory; frontend hiding is not authorization. Session cache invalidation code also blocks sensitive delayed writes after access failures.

Accessibility/responsive risk is concentrated in dense calendar/table/panel controls and mobile workflow navigation. Cypress currently checks visible labels and workflow separation but does not prove keyboard/screen-reader quality. Migration risk is material because the branch adds schedule/disclosure/conflict/status migrations and changes JSON contracts.

## 13. Likely change surface

For solver semantics: `solve_schedule.py`, `solve_views.py`, `solve_jobs.py`, worker command, solver serializers/types, `SolverSetupPanel`, `SolverResults`, repair helpers, and solver tests.

For schedule configuration: `schedule_workflow.py`, `schedule_validation.py`, `serializers.py`, `schedule_views.py`, `models.py`/migrations, `AdminScheduleConfig*`, frontend schedule hooks, and configuration/Cypress tests.

For publication/visibility: `schedule_workflow.py`, `admission_access.py`, serializers, distributed-plan components, export helpers, audit models/migrations, privacy tests, and Cypress publication flows.

Stable contracts to preserve are one `SavedSchedule` per admission, revision-aware writes, async `SolveJob`, server-resolved IDs/names, scoped rows, and separate `is_distributed`/name visibility. A new abstraction is justified only if it reduces duplication without creating a second source of truth for plan lifecycle.

## 14. Candidate solution directions

**A. Extend the existing schedule workflow and contracts.** Add the behavior to `schedule_workflow`, canonicalization, and the corresponding UI surface. This best fits current boundaries and preserves revision/publication semantics. Risk: the workflow already has many coupled state transitions; new flags can increase ambiguity.

**B. Add a dedicated proposal/repair domain object.** Persist a solve result or repair scenario separately before applying it to `SavedSchedule`. This improves auditability and preview isolation, but introduces version ownership, cleanup, authorization, and compatibility work. The current `SolveJob.result` plus `baseline_updated_at` may already cover a lightweight version.

**C. Keep the behavior ephemeral in the frontend.** Use the existing solver result/draft state and persist only on explicit save. This is appropriate for preview-only UI changes and minimizes migrations, but cannot support cross-user review, durable approval, or recovery after reload.

**D. Make publication a first-class lifecycle entity.** Useful if the product needs immutable releases, rollback, or release-specific audit/export. It is a larger change and conflicts with the current `SavedSchedule.is_distributed` model unless a migration strategy is explicit.

## 15. Open questions

### Blocking

- Is the intended subject the whole workflow, the CP-SAT solver, configuration, or publication? The implementation surface and acceptance tests differ substantially.
- Is the current uncommitted `distribute-interviews` working tree the intended baseline, or should the brief compare against `master`? The active behavior differs materially.
- Must published schedules be editable in place, or should each change create a reviewable release? This determines whether `SavedSchedule` remains sufficient.

### Important

- What worker deployment, retry, timeout, and stale-`RUNNING` recovery guarantees are required? Repository code cannot prove operational behavior.
- What are the target admission sizes and acceptable solve latency? This determines whether the current CP-SAT model and JSON persistence are sufficient.
- Should conflict review be mandatory for every proposal, and who owns completion? Current code gates publication but the product policy is not explicit in the request.
- Should outreach templates be shared and audited, or remain browser-local drafts?

### Optional

- Should administrators be able to inspect immutable solve inputs/results after a schedule is saved?
- Should solver objective weights and repair strategy labels be configurable per admission or remain code-defined?
- What keyboard/mobile acceptance standard is required for dense schedule editing?

## 16. Recommended next investigation steps

1. Confirm the target baseline by comparing the active worktree with `master` and identifying which uncommitted scheduler files are intended product scope.
2. Run the focused Django, TypeScript, and Cypress commands in an environment with the required database and worker dependencies.
3. Exercise a real admission through configure → availability → solve → partial result → edit/lock → conflict review → publish → scoped committee view.
4. Inspect worker logs and measure solve latency/memory across representative candidate/interviewer/slot sizes.
5. Ask product owners to decide publication mutability, conflict-review ownership, and whether repair scenarios need durable history.
6. Verify export payloads and disclosure transitions for admin, recruiter, ordinary member, removed group, and re-added group cases.

## 17. Evidence appendix

```text
[admissions/admissions/models.py — SavedSchedule, InterviewAvailability, SolveJob]

SavedSchedule is one-to-one with Admission and stores schedule/configuration, distribution, visibility, and review state. InterviewAvailability is unique per admission/user. SolveJob has an admission-scoped conditional unique constraint for PENDING/RUNNING jobs.

Why it matters:
These are the durable authorities and concurrency boundaries for the scheduler.
```

```text
[admissions/admissions/schedule_workflow.py — _ensure_revision_matches, _resolve_schedule_state, _ensure_conflict_review_ready_for_publish]

Missing/stale expected_updated_at raises a revision conflict. Grid changes can clear the plan. Changed schedules unpublish unless explicitly republished. Publication requires conflict-review readiness.

Why it matters:
The schedule is a stateful draft/review/publish workflow, not a stateless solver output.
```

```text
[admissions/admissions/solve_views.py and solve_jobs.py — SolveScheduleView, build_solve_request, enqueue_solve_job]

The endpoint validates admin access, checks saved configuration and baseline revision, canonicalizes non-synthetic input, and returns a queued job. Requests rehydrate IDs server-side; concurrent active jobs converge on one job.

Why it matters:
The browser is not trusted as the source of candidate/interviewer identity or current schedule state.
```

```text
[admissions/admissions/solve_schedule.py — objective and result construction]

Placement dominates secondary objectives. The model supports locked rows, conflicts, availability/overtime, gender coverage, load balancing, continuity, panel blocks, and repair costs. Results distinguish SUCCESS/PARTIAL/INFEASIBLE/TIMEOUT/ERROR and include unplaceable explanations.

Why it matters:
Solver changes must preserve both hard constraints and priority ordering.
```

```text
[CONTEXT.md and ADMISSIONS_AI_CONTEXT.md — scheduler invariants and workflow]

The domain guidance states that unauthorized rows are omitted, identity disclosure is audited and scoped, `SavedSchedule` is canonical, `SolveJob` is asynchronous, and interview status is admission-wide.

Why it matters:
These are explicit architectural constraints, but ADMISSIONS_AI_CONTEXT.md describes a working tree and must not be mistaken for deployed state.
```

## 18. External-model handoff

### What you should assume

- The scheduler is admission-wide and represented by one `SavedSchedule`.
- Solver execution is asynchronous through one active `SolveJob` per admission.
- Server-side canonicalization and authorization are authoritative.
- Draft, published/distributed, and identity-visible are separate concepts.
- Locked/manual rows are intended to survive reruns.

### What you should not assume

- That this uncommitted branch is deployed or matches `master`.
- That a reachable frontend proves worker, migration, authorization, or publication behavior.
- That a solve result is durable until an administrator saves it.
- That `is_distributed=true` means all committee members can see candidate names.
- That browser-local outreach templates are shared product data.

### Decisions you are being asked to make

- Identify the exact scheduler slice to change.
- Decide whether publication is mutable or release-based.
- Decide the required worker/retry/scale guarantees.
- Decide whether conflict review and repair proposals need durable, auditable entities.

### Most relevant evidence

- `admissions/admissions/models.py:257-470`
- `admissions/admissions/schedule_workflow.py:57-535`
- `admissions/admissions/schedule_validation.py:92-400`
- `admissions/admissions/solve_views.py:34-220`
- `admissions/admissions/solve_jobs.py:7-79`
- `admissions/admissions/solve_schedule.py:340-704`
- `frontend/src/routes/SchedulePage/index.tsx`
- `frontend/src/components/Scheduling/Solver/SolverSetupPanel.tsx`
- `frontend/src/components/Scheduling/Solver/SolverResults.tsx`
- `cypress/e2e/interview_plan_workflow_spec.cy.ts`
- `admissions/admissions/tests/test_schedule_api_hardening.py`
