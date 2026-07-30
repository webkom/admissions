# Admissions scheduler release ledger

## Invariants

| ID | Invariant | Regression evidence | Status |
| --- | --- | --- | --- |
| AUTH-01 | An actor can hold admin, recruiter, and member workspaces across several committees without role precedence hiding access. Authority in a committee does not suppress that actor's personal availability entry for the same committee. | `test_public_userdata_preserves_each_group_context_and_scope`, `test_dual_role_context_uses_one_schedule_and_own_availability`, `admission_access_projection_model_spec.cy.ts` | Resolved |
| AUTH-02 | Admission-wide schedule writes and solver operations require admission-admin authority. | `test_recruiter_cannot_save_global_schedule`, `test_solve_job_operations_are_forbidden_for_committee_recruiters`, worker revocation tests | Resolved |
| AUTH-03 | Authority loss, logout, and actor changes purge scoped sensitive state and block stale writes. Canonical writes recheck and lock admission-relevant membership after the admission lock, while OAuth refreshes serialize on a non-key user-row lock that remains compatible with child audit writes. | `sensitive_access_model_spec.cy.ts`, `solver_async_race_spec.cy.tsx`, `ConcurrentScheduleAuthorityRevocationTestCase`, `ConcurrentInterviewStatusAuthorityRevocationTestCase`, `ConcurrentOAuthMembershipSyncTestCase` | Resolved |
| AUTH-04 | Committee-context schedule-admin entries select workspace and outreach context while sharing one canonical admission plan. | `admission_access_projection_model_spec.cy.ts`, `test_dual_role_context_uses_one_schedule_and_own_availability` | Resolved |
| PRIV-01 | Anonymous draft creation precedes name disclosure; recruiter projections reveal only represented candidates and committees. | conflict-collection and candidate-projection tests in `test_schedule_api_hardening.py` | Resolved |
| PLAN-01 | `SavedSchedule` is canonical; proposals and solver results are revision-bound and noncanonical until applied. | schedule API hardening, async-race, and distributed-transition tests | Resolved |
| PLAN-02 | First creation requires explicit `expected_updated_at: null`; later writes require the exact current revision. | expected-revision tests in `test_schedule_api_hardening.py` | Resolved |
| UX-01 | The workflow presents one canvas, one status, and one dominant next action with stable terminology. | `workflow_steps_model_spec.cy.ts`, `solver_setup_panel_spec.cy.ts` | Resolved |
| DATA-01 | Legacy admission questions and answers survive the move to committee-scoped storage without overwriting committee-specific or concurrently written data. | `GroupScopedApplicationAnswersMigrationTestCase` | Resolved |
| DATA-02 | Admission mutations lock the admission before dependent application and scheduler rows. | `test_locks_admission_before_application_rows` and scheduler concurrency tests | Resolved |
| DATA-03 | Omitting optional `group_answers` preserves stored committee answers; an explicit empty answer object clears them. | `test_omitted_group_answers_preserve_existing_committee_answers`, `test_explicit_empty_group_answers_clear_existing_committee_answers` | Resolved |
| DATA-04 | Concurrent deletion of a candidate's final committee applications cannot leave an orphan admission application or stale schedule row. | `ConcurrentGroupApplicationDeletionTestCase` | Resolved |
| CI-01 | Static/backend checks run for pushes and pull requests; Cypress records only trusted pushes; build and deploy remain push-only for staging/prod. | `.drone.yml` event and command guards; exact Drone-image tox compatibility run | Resolved locally; remote rerun pending |

## Findings

| Finding | Severity | Classification | Evidence | Resolution | Status |
| --- | --- | --- | --- | --- | --- |
| SCH-001 | P1 | Data compatibility | Legacy admission-level answers could disappear after the committee-scoped contract became canonical. | `9b1e023`: migration `0006` backfills at scoped-column introduction plus preservation test | Closed |
| SCH-002 | P2 | Concurrency | Committee-application termination locked dependent rows before the admission, opposite the public write path. | `e3bd758`: admission-first lock order plus query-order test | Closed |
| SCH-003 | P1 | Authority/workspace | A single inferred role could hide valid committee workspaces for dual- and multi-role actors. | `d8cd597`, `b2143d0`: backend and Cypress projection coverage | Closed |
| SCH-004 | P1 | Workflow/privacy | Conflict collection behaved as a prerequisite for creating a draft and surfaced raw internal-state copy. | `d8cd597`, `28bc678`: anonymous-first draft, explicit conflict phase, user-facing copy | Closed |
| SCH-005 | P2 | UI clarity | Solver setup repeated “Eksempel” and “Klar til å generere” next to already explicit content/actions and carried dead props. | `760971b`: redundant copy and unused interfaces removed | Closed |
| SCH-006 | P2 | Stack reviewability | UI branches consumed draft, solver-v2, and conflict contracts before their providers. | Reordered stack documented in `admission-scheduler-pr-stack.md` | Closed |
| SCH-007 | P1 | Authority/concurrency | Schedule and availability writes could trust authority calculated before waiting for the admission lock. | `b5a2652`: membership-row locks and post-lock authority checks; deterministic demotion-race regressions | Closed |
| SCH-008 | P2 | Data compatibility | Omitting optional `group_answers` could normalize the field to `{}` and erase existing committee answers. | `8188b36`: distinguish omission from explicit replacement and cover both behaviors | Closed |
| SCH-009 | P1 | Data integrity/concurrency | Two committee representatives could concurrently delete the final child applications while both retained the parent candidate. | `8188b36`: atomic admission-first parent/child locking and PostgreSQL concurrency regression | Closed |
| SCH-010 | P2 | Requirement clarification | A review interpreted committee-context schedule-admin entries as duplicate plan authorities. The explicit multi-committee requirement needs those entries, but only one canonical plan. | Product model clarified; context routes retain committee outreach context and share the admission-scoped `SavedSchedule` | Closed |
| SCH-011 | P1 | Authority/concurrency | Interview-status writes could outlive recruiter demotion after passing a pre-lock scope check. | `0513c37`, `a2cf9b0`: admission and membership locks, post-lock scope validation, and deterministic demotion-race regression | Closed |
| SCH-012 | P1 | Authority/concurrency | Concurrent OAuth refreshes could preserve a stale leader membership after a newer demotion payload. | `8a9632b`: serialize complete membership replacement on the stable `LegoUser` row and verify the final authority set under PostgreSQL concurrency | Closed |
| SCH-013 | P2 | Authority/concurrency | A full OAuth user-row lock could deadlock with an authority write holding Membership while committing a deferred actor foreign key. | `a9a32d4`: use `FOR NO KEY UPDATE` for OAuth serialization and cover the real OAuth/interview-status interleaving | Closed |
| SCH-014 | P1 | CI/dependency compatibility | The refreshed lock selected `virtualenv 21.6.1`, which breaks `tox 4.24.1` while Poetry installs the project inside Drone's test environments. | `1334dc1`: pin patched, tox-compatible `virtualenv 20.36.1`; reproduce and pass the exact Drone-image tox gate | Closed |
| SCH-015 | P3 | Dependency security | The initial compatibility pin, `virtualenv 20.29.1`, remained in the affected range for [CVE-2026-22702](https://nvd.nist.gov/vuln/detail/CVE-2026-22702). | `1334dc1`: use patched `20.36.1`, refresh the Poetry lock, and rerun the exact Drone-image tox gate and production Docker build | Closed |
| SCH-016 | P3 | Stack reviewability | The patched dependency pin originally began in PR 3, leaving independently reviewable PRs 1 and 2 on the affected lock. | `1334dc1`: move the pin and Poetry-1.8-compatible lock refresh into CI foundation, then rebase every descendant | Closed |
| SCH-017 | P2 | Test reliability | The solver-v2 model-shape gate used a one-second solve budget and could exhaust it during preprocessing on a loaded runner, yielding no phase metrics. | `0c36b74`: give the non-timeout assertion five seconds of CI headroom; pass all 24 solver-v2 tests and the loaded full suite | Closed |
| SCH-018 | P1 | Stack runtime/CI | PR 3 replaced executable global bootstrap scripts with JSON-safe embedded authority/config data, but the frontend reader was delayed until PR 11. Intermediate branches fell back to a container-local API URL and could not mount the admissions flow. | `bcd3105`: consume the embedded JSON in the same authority layer; exact-branch landing Cypress passes and issues real API requests | Closed |
| SCH-019 | P1 | CI reliability | The in-process Vite development server passed its readiness probe but disappeared during the headless run, leaving every source-backed fixture visit with `ECONNREFUSED`. | `025fe38`: prebuild the fixture HTML/module graph before Chrome starts, serve the compact output with Vite preview, and pass all five affected specs (67 tests) | Closed |
| SCH-020 | P1 | Test portability | The outreach acceptance test tried to stub `navigator.clipboard.writeText` even when the Clipboard API was absent on Drone's non-secure container hostname. | `eeb6018`: install an explicit Clipboard API test double and pass the authenticated outreach spec (10 tests) against an isolated fresh database | Closed |
| SCH-021 | P3 | Build hygiene | Fixture-mode output cleanup accidentally disabled Vite's normal production-output cleanup, allowing stale bundles to survive in reused workspaces. | `5b9eddc`: clean both production and fixture output directories; pass the sentinel cleanup check, fixture build/preview, complete Cypress suite, and production Docker build | Closed |
| SCH-022 | P1 | Stack runtime/CI | The first Cypress-enabled layer exposed two assertions for behavior not present at that layer: single-committee selection used a non-normalized key, and the smoke test expected the acceptance layer's accessible modal. | `986fd73`, `c388285`, `aca2efd`: normalize the selection key, keep the foundation smoke coverage layer-local, restore the accessible-dialog assertion with its implementation, and pass PR 5's three tests plus the final 216-test Cypress gate | Closed |
| SCH-023 | P1 | Stack runtime/CI | PR 4's application smoke selected the deterministic `webkom-open` admission one layer before PR 5 introduced that fixture, so the otherwise-green PR 4 push failed in Cypress. | `c388285`, `982f434`: restore PR 4's legacy-fixture journey, introduce the deterministic journey with PR 5's generated credentials, and pass both layers' complete three-test Cypress surfaces | Closed |
| SCH-024 | P2 | CI reliability | An exact push run exhausted Yarn's built-in retries while downloading `lucide-react` from the public registry, failing before any frontend gate despite the frozen lockfile. | `601de98`: retry the unchanged frozen-lock install at most three times with a bounded delay; validate YAML, shell syntax, recovery after two failures, and failure after the third attempt | Closed |
| SCH-025 | P1 | Stack runtime/CI | Backend tests could render the Vite-backed index before the parallel frontend build created `assets/vite-manifest.json`, so the PR 3 exact push failed nondeterministically despite valid application code. | `b72d508`: make `tests` depend on `build-frontend`; preserve the inherited `coverage` dependency; pass the formerly failing four-test privacy surface and the complete 419-test suite after an exact frontend build | Closed |
| SCH-026 | P1 | Stack runtime/CI | The solver-v2 layer overwrote the PR 5 settings modules and removed the inherited fail-closed Cypress fixture declarations. Its detached backend therefore rejected `load_fixtures --cypress` and never became ready. | `e9a675c`: restore the base default plus development/testing opt-ins in PR 7; verify real settings imports in both modes, production hard-disable, all five fixture lifecycle tests, and credential cleanup | Closed |
| SCH-027 | P3 | Settings maintainability | The acceptance layer reintroduced a second base assignment for `ALLOW_CYPRESS_FIXTURES`, making later trust-boundary changes susceptible to silent shadowing even though both current values were fail-closed. | `b0cd810`: remove the duplicate, retain one canonical base declaration, and rerun the real settings-import matrix and complete 419-test suite | Closed |
| SCH-028 | P2 | CI reliability | The production Docker build performed a second frozen Yarn install outside Drone's bounded retry and exhausted the registry's built-in retries on the same `lucide-react` artifact. | `e552525`: apply the same three-attempt bounded, fail-closed loop inside the frontend image stage; build exact image `sha256:c125e8369339ad04a827d08eced2c1d19c2ea5d969f90f788843dba6845018df` | Closed |
| SCH-029 | P2 | Test reliability | One acceptance run sampled a 500 ms transition only after Cypress command retries had allowed it to finish, while a forced click could race viewport scrolling before a slot-editor layout assertion. Product behavior and the exact push suite remained green, but the PR context failed two timing-sensitive assertions. | `ad52e28`: start and sample the animation in one browser task, exercise popover layout through deterministic keyboard activation, and pass the affected 40 tests three times in Electron plus once in headless Chrome | Closed |
| SCH-030 | P2 | CI reliability | Exact-code Drone build 5484 failed during Poetry setup because uWSGI's internal parallel compiler linked before `core/legion.o` existed. No application test had started. | `19f76b2`, `afcb299`: set uWSGI's documented `CPUCOUNT=1` serial-build override in every Drone Python dependency-installing step and the production Poetry install, explicitly pass it into all nested tox installs, then pass an exact linux/amd64 Drone-image tox/Poetry install and the production Docker build | Closed |
| SCH-031 | P2 | Test reliability | Exact PR build 5532 could send Escape before the advanced solver setup's request-animation-frame focus transfer completed, so the key reached the opener outside the section and the test left the setup open. The exact push and an earlier exact PR run passed, but the test did not wait for the documented focus handoff. | `ac96b6b`: wait until the advanced-settings heading owns focus before sending Escape, then pass the complete 20-test spec five times in Electron and once in headless Chrome | Closed |
| SCH-032 | P1 | Data integrity/concurrency | The scoped-answer backfill checked for an empty target in Python and then updated by primary key only, so a concurrent committee-specific write between the read and update could be lost. | `9b1e023`: require the target JSON value to remain empty in the SQL update; deterministic stale-read regression covers both question and answer rows at column introduction | Closed |
| SCH-033 | P1 | Authority/workspace | Committee authority suppressed the same actor's member-workspace entry, leaving no discoverable route to submit that actor's own availability for the committee. | `b8686b3`: retain every `open_member_workspace` context and cover mixed-role and multi-authority landing links | Closed |
| SCH-034 | P2 | Migration reviewability | Thirty never-deployed scheduler migrations obscured the final schema and repeated intermediate transitions that no shared environment could contain. | Read-only production/staging migration and schema inventory returned empty; compacted to six ordered, independently buildable migrations (`0004`–`0009`) | Closed |
| SCH-035 | P1 | Authority/navigation | Authority from a separate admission-admin group was rendered as a committee-scoped applications and schedule route, but the application page correctly rejects non-committee group scopes. | `dd87fb2`: scope per-committee buttons only to authority contexts that are also admission committees; cover the admin-group-only fallback to unscoped routes | Closed |
| SCH-036 | P2 | Authority/navigation | A bookmarked or manually entered admin-group query could still be accepted and labelled as a committee-scoped schedule workspace even though the landing page no longer generated it. | `ca1285a`: reject scoped admin contexts that are not admission committees while keeping the unscoped admission-admin workspace valid | Closed |
| SCH-037 | P1 | Migration rollback | Reversing the scoped question/answer migration used a no-op reverse and would drop divergent committee values that the legacy admission-wide fields cannot represent. | `7b581fc`: copy identical scoped values back to legacy storage, reject divergent values with `IrreversibleError` before column removal, and cover identical, divergent-question, and divergent-answer cases | Closed |

There are zero open confirmed P0/P1 defects in the frozen local source.
Cosmetic preferences and file-size observations are not release findings unless
they correspond to a concrete usability, accessibility, correctness, privacy,
or maintainability failure.

## PR readiness

PR-ready requires:

- zero open P0/P1 findings;
- every P2 resolved or explicitly accepted;
- green local gates and green remote push-event CI for each exact branch SHA;
- two independent read-only closure audits of the same final SHA.

The local source can satisfy the first two conditions before publication. Remote
CI and PR check evidence can only be obtained after the authorized push.

## External proof gaps

Staging readiness additionally requires:

- a write-quiesced migration cutover: the current ESAS playbooks run migrations
  before replacing the old web service, so deployment remains blocked until
  old-service writes are stopped for the complete migration/web replacement
  window and failure recovery is rehearsed;
- migration execution and rollback rehearsal;
- real worker queue restart and mixed-version testing;
- admin-role inventory;
- a production-shaped end-to-end scheduler smoke test.

Production readiness additionally requires:

- native screen-reader and browser-zoom checks;
- target-scale solver and request-latency evidence;
- monitoring and alerts;
- live authority-revocation verification;
- a tested deployment rollback procedure.

These gaps are tracked separately and do not masquerade as completed local
evidence.
