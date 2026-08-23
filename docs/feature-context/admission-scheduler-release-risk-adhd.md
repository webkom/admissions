# Admissions Scheduler release-risk divergence

## Brief

The question was: what deeper release risks could remain after the current
hardening, and what evidence or minimal fix would close them before a
production push? Five isolated frames generated the pool: regulator, hostile
competitor, 3 a.m. on-call, inversion, and biology.

Scores are novelty, viability, and fit on a 0–10 scale. They are discovery
priorities, not proof that a risk exists in the current implementation.

## Wide set

### Revision and publication integrity

- Independent publish-time validation of a plausible but invalid schedule
  `[N6 V9 F9]`
- Immutable revision ancestry across solve, proposal, repair, and publication
  `[N8 V7 F9]`
- Publish-time agreement between canonical draft and every accepted
  revision-bound artifact `[N9 V8 F10]`
- Terminal invalidation for superseded solve jobs `[N8 V7 F9]`
- Explicit deployment/configuration identity on persisted work
  `[N8 V6 F8]`
- Barrier-controlled two-admin lock, repair, and publication races
  `[N8 V8 F10]`
- Continuous cross-model reconciliation and quarantine `[N9 V4 F8]`
- A server refusal gate for stale, nonterminal, or invalid publication state
  `[N7 V8 F10]`

### Idempotency and side-effect consistency

- Lose the response after a successful publication commit, then retry
  `[N7 V10 F10]`
- Replay publication and repair after timeouts or double taps
  `[N7 V9 F10]`
- Crash between publication persistence and future downstream notifications
  `[N7 V8 F10]`
- Atomic revision-pointer publication with an outbox and idempotency key
  `[N7 V7 F10]`
- One transaction identity across publication and future recipient delivery
  `[N8 V7 F10]`
- Restore a database after recipients have already observed external effects
  `[N9 V6 F9]`

### Deployment compatibility and recovery

- Queue jobs across a rolling deploy to expose API/worker contract skew
  `[N7 V9 F10]`
- Roll the application back after applying its production migration
  `[N7 V7 F8]`
- Require mixed-version worker compatibility or a fail-closed engine gate
  `[N8 V8 F10]`
- Restore the previous published revision without rerunning the solver
  `[N8 V7 F9]`
- Fault-inject every solve, proposal, repair, and distribution boundary
  `[N8 V6 F9]`
- Put a synthetic scheduler canary cohort in production `[N9 V4 F7]`

### Authorization, privacy, and operational evidence

- Revoke an administrator and inspect logs, caches, downloads, and history for
  residual candidate data `[N8 V7 F8]`
- Exercise logout, demotion, account switching, and cross-tab stale authority
  `[N9 V8 F9]`
- Make dangerous blockers persistent, focusable, and tied to the affected
  candidate `[N9 V8 F8]`
- Deliberately remove and then rebuild the audit trail `[N8 V5 F8]`
- Record a privacy-safe replay bundle with versions, hashes, locks, and actor
  `[N8 V7 F9]`
- Build a complete immutable publication event ledger `[N8 V5 F9]`
- Inventory retention and deletion across every candidate-data sink
  `[N9 V4 F8]`

### Canonical temporal semantics

- Run Oslo DST boundaries in browsers configured to hostile time zones
  `[N6 V9 F9]`
- Round-trip DST, midnight, leap-day, and browser/server time-zone edges
  `[N7 V9 F9]`
- Specify canonical time-zone, clock, and locale serialization rules
  `[N7 V9 F9]`

## Converge

1. **Lost publication response and retry** — the highest-scoring idea and a
   narrow ambiguity at a real state-transition boundary. The database remained
   safe, but the UI could previously report failure after a successful commit.
   This is now implemented and covered by
   `distributed_plan_transition_spec.cy.tsx`.
2. **★ Revision agreement at publication** — non-obvious but viable because it
   asks which artifacts are actually authoritative. In the current design,
   `SavedSchedule` is canonical; unaccepted proposals do not vote. The existing
   server revision check, schedule canonicalization, review/deviation gates,
   published-draft apply rejection, and worker baseline guards provide the
   relevant agreement without adding a second source of truth.
3. **Stale authority across tabs and identity changes** — current 401/403,
   server-confirmed actor scope, authority epochs, cross-tab actor
   announcements, and focus-refetch protections close detected authority loss.
   Server-side demotion while every tab is hidden still requires a later
   request to become observable and remains a defense-in-depth concern, not a
   substitute for backend authorization.

### Traps

- **Deployment “phenotype” without a concrete contract** — too broad until
  narrowed to explicit version fields and compatibility assertions.
- **Delete and rebuild the audit trail** — destructive experimentation adds
  risk; test known evidence gaps instead.
- **Continuous quarantine subsystem** — premature operational machinery that
  can create false-positive outages.
- **Full fault-injection matrix before release** — target the load-bearing
  boundaries first.
- **Synthetic candidates in production** — can contaminate real workflows and
  accidentally enter outreach paths.
- **Complete immutable event ledger** — risks turning a release hardening task
  into event sourcing.
- **Full retention/deletion program in this patch** — broader than the scheduler
  release gate; inspect the highest-risk runtime sinks first.

## Focus

### Lost publication response

A publication request can commit the canonical schedule and still lose its
response. Retrying with the original revision correctly returns `409`, but the
old UI could retain a failure message while a refetch rendered the published
plan. Publication currently has no automatic outreach side effect, so an
outbox would solve a problem the product does not yet have. The implemented
fix performs a fresh canonical read after a network/server/`409` ambiguity and
accepts success only when `is_distributed` and the requested name visibility
match. A different state remains a conflict; a failed reconciliation is
reported as unknown rather than definite failure.

Load-bearing risk: contradictory success-state and error-state feedback can
prompt unsafe operator retries even though optimistic concurrency protected
the database.

First concrete step: completed—component-level browser coverage now proves
lost-response recovery, matching retry recovery, mismatch refusal, and
unknown-state copy; a backend test proves the retry does not advance the
revision or duplicate the review-close transition.

Child ideas:

- Reuse the postcondition-reconciliation pattern for unlock only if production
  evidence shows the same ambiguity matters there.
- Record privacy-safe counts of recovered versus unresolved ambiguous writes.
- Keep ordinary schedule edits under strict conflict handling.
- Add a transactional outbox only if publication later gains automatic
  external notifications.

### Publication revision agreement

Publication should operate on the locked canonical `SavedSchedule`, not accept
browser claims that a proposal or worker result is current. The request carries
the editor’s expected schedule revision. Under the existing transaction, the
server locks the admission, checks that revision, canonicalizes the current
schedule, and re-runs hard validation, candidate-review, and deviation gates
before setting `is_distributed`. Proposal application independently requires
the job baseline and editor revision to equal the canonical revision, and it is
rejected after publication. Worker auto-application repeats baseline,
empty-draft, lifecycle, authorization, and publication checks under locks.
Therefore adding proposal or job identifiers to publication would incorrectly
elevate noncanonical artifacts.

Load-bearing risk: weakening any one of those server checks could let a stale
proposal overwrite manual intent or make an invalid draft public.

First concrete step: keep the focused backend publication, proposal-apply, and
late-worker tests in the required release suite.

Child ideas:

- Add structured mismatch codes if operational diagnosis proves generic `409`
  copy insufficient.
- Persist a compact publication manifest only if audit requirements demand it.
- Test mixed web/worker versions before changing the worker request contract.
- Keep engine-version rollout separate from this release.

### Stale authority across tabs

Session cookies are shared across tabs while rendered state and React Query
caches are tab-local. Admission responses now carry a server-confirmed actor
identifier; the frontend includes it in the sensitive scope, announces
page-bootstrap identity changes through browser storage, purges other tabs
before reload, and binds deferred sensitive requests to monotonic global and
admission authority epochs. A late response from an earlier actor or role
cannot repopulate or roll back protected caches after purge or recovery.
Ordinary logout clicks first complete the real server logout request; only a
confirmed response purges the initiating tab, advances the epoch, announces
the anonymous actor, and navigates away. If that request cannot be confirmed,
the browser follows the server logout URL without sending a false cross-tab
signal. Modified clicks retain normal link behavior.
Server-side demotion while all tabs are hidden still requires a focus/request
round trip before the browser can observe it, although backend authorization
rejects actions immediately.

Load-bearing risk: remote authority changes have no server-push revocation
channel, so hidden rendered state can exist until the next verification.

First concrete step: add a two-page browser-context test when the repository
adopts a runner that can control two tabs deterministically; do not add a new
test-auth bypass to simulate it.

Child ideas:

- Add a true two-page browser test for the implemented cross-tab actor signal.
- Measure focus-triggered remote demotions without candidate data.
- Consider server-push revocation only if measured risk justifies its
  operational cost.

## Provocation

If a release can be rolled back at the application layer but candidates have
already acted on a published schedule, what is the canonical recovery action:
restore the old database state, or publish a new explicit revision that
acknowledges the external world?
