# Admissions Scheduler Release Ledger

This is the bounded findings and evidence ledger for the re-cut scheduler PR
stack. Findings are deduplicated by root cause. Presentation preferences and
file size alone do not block release.

## Release invariants

| ID | Invariant |
| --- | --- |
| `AUTH-01` | Only admission administrators can configure, solve, apply, publish, or unpublish a schedule. |
| `AUTH-02` | Candidate identity, contact data, conflicts, exports, and schedule rows are projected to the actor's authorized purpose. |
| `AUTH-03` | Logout, demotion, actor change, and admission change invalidate sensitive browser state before stale responses can repopulate it. |
| `STATE-01` | `SavedSchedule` is the only canonical persisted plan; a `SolveJob` result is not canonical until a revision-checked apply. |
| `STATE-02` | Stale, duplicate, cancelled, discarded, or late work cannot overwrite a newer draft. |
| `STATE-03` | Unknown write outcomes block publication until canonical state is reconciled. |
| `SCHED-01` | Locks and hard conflicts are preserved or reported with an actionable correction path. |
| `UX-01` | Current draft, proposal, repair, and published state remain unambiguous, with equivalent labels in every projection. |
| `UX-02` | Critical operations retain keyboard, touch, focus, reduced-motion, zoom-proxy, and narrow-layout behavior. |
| `OPS-01` | Claimed CI tests run from declared services without local credentials or undeclared frontend servers. |

## Findings

| Finding | Class | Severity | Invariant | Evidence | Regression test | Resolution | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CI-01` Cypress fixture specs required Vite but CI did not start it | Confirmed defect | P1 | `OPS-01` | `.drone.yml`, fixture URLs on port 5001 | Full Cypress run in CI-equivalent services | Archive snapshot contains Vite startup, readiness, cleanup, and fixture gating | Fixed; re-prove in stack |
| `UX-01` Opted-out/conflict panel state used inconsistent labels | Confirmed defect | P2 | `UX-01` | list/calendar panel projections | `planutkast_drawers_spec.cy.tsx` | Shared `PanelMemberChips` derivation | Fixed; re-prove in stack |
| `UX-02` Pending Foundation tab could unmount its only local navigation | Confirmed defect | P1 | `UX-02` | pending availability/coverage branches | navigation acceptance plus type/build gates | Pending panels retain `foundationNav` | Fixed; re-prove in stack |
| `HIST-01` Existing commits mix unrelated and repeatedly rewritten concerns | Credible risk | P1 | `OPS-01` | 323-file archive diff and overlapping checkpoint commits | Independent build/test at every re-cut boundary | Re-cut from `master`; do not expose archive history | In progress |
| `CI-02` Drone excludes pull-request events | Missing evidence/process gap | P1 | `OPS-01` | `.drone.yml` trigger and step filters | A real pull-request event or equivalent Drone config validation | First stack PR enables safe PR gates; deploy remains push-only | Open |

There are no other accepted open P0/P1 code defects at the archive point.
Independent closure audits may add findings only when they identify a concrete
failure mode and violated invariant.

## Evidence gaps outside PR readiness

### Staging

- Forward migration and supported rollback rehearsal on a staging-shaped
  database.
- Real worker queue claim, cancellation, restart, stale-running recovery, and
  mixed web/worker version behavior.
- Inventory of active-admission administrator role data.
- Production-shaped configure-to-publication smoke flow.

### Production

- Native screen-reader and browser-zoom traversal.
- Target-scale solve latency, memory, metrics, dashboards, and alerts.
- Live authority revocation and cross-session cache smoke test.
- Production migration, worker restart, and tested rollback procedure.

## Stop condition

The stack is PR-ready only when every branch is independently green, the final
top SHA has zero open P0/P1 findings, every P2 is fixed or explicitly accepted,
all invariants have named evidence, and two independent read-only closure
audits of that same SHA find no new P0/P1 root cause.

