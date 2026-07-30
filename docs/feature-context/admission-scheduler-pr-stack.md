# Admissions scheduler PR stack

The stack is a clean linear re-cut from `master`.
Each PR targets the preceding branch and includes the providers and focused tests needed for its own contract.

| PR | Branch | Target | Scope |
| --- | --- | --- | --- |
| #1877 | `codex/admissions-ci-foundation` | `master` | Yarn, Vite, Tailwind, Docker, and Drone foundations |
| #1878 | `codex/admissions-scheduler-domain` | #1877 | Canonical configuration, availability, normalization, initial `SavedSchedule`, and runnable v1 bootstrap |
| #1879 | `codex/admissions-scheduler-authority` | #1878 | Admission-scoped authorization, projections, disclosure, audit, authority epochs, and logout or demotion behavior |
| #1880 | `codex/admissions-scheduler-workflow-v1` | #1879 | Hardened v1 solve lifecycle, cancellation, retry, recovery, conflict review, and revision-checked apply |
| #1881 | `codex/admissions-cypress-foundation` | #1880 | Deterministic fail-closed fixtures, transactional reset, generated credentials, cleanup, and smoke coverage |
| #1882 | `codex/admissions-scheduler-draft-lifecycle` | #1881 | Versioned drafts, locks, autosave reconciliation, proposals, repair, publication, and participation |
| #1883 | `codex/admissions-solver-v2` | #1882 | Sparse CP-SAT v2, normalized results, engine metadata, metrics, worker integration, and rollout gating |
| #1884 | `codex/admissions-scheduler-conflict-collection` | #1883 | Anonymous-first draft, scoped disclosure, conflict collection, multi-committee authority, and re-solve boundaries |
| #1885 | `codex/admissions-scheduler-authority-hardening` | #1884 | Post-lock authority validation, serialized OAuth authority refresh, and canonical-write membership locking |
| #1886 | `codex/admissions-data-integrity` | #1885 | Legacy answer backfill, omission-safe updates, atomic final-committee deletion, and admission-first locking |
| #1887 | `codex/admissions-scheduler-foundation-ui` | #1886 | Shared calendar, popover, grid, dialog, status, and scheduling primitives |
| #1892 | `codex/admissions-scheduler-configuration-ui` | #1887 | Interview period, schedule settings, pattern grid, standard blocks, and manual blocks |
| #1893 | `codex/admissions-scheduler-availability-ui` | #1892 | Availability editor, heatmap, filters, coverage, participation, and two-member fixture contract |
| #1894 | `codex/admissions-solver-setup-ui` | #1893 | Solve lifecycle and storage hooks, setup, advanced settings, progress, and request orchestration |
| #1895 | `codex/admissions-scheduler-draft-ui` | #1894 | Solver canvas, proposal comparison, persistence, repair, selectors, and draft projections |
| #1896 | `codex/admissions-scheduler-plan-ui` | #1895 | Schedule-page composition, publication, distributed plan, exports, outreach, and static navigation fixture |
| #1888 | `codex/admissions-scheduler-workspace-ui` | #1896 | Multi-committee landing, workspace selection, scoped application administration, and sensitive-state boundaries |
| #1889 | `codex/admissions-scheduler-release-acceptance` | #1888 | Cross-layer acceptance, final fixture smoke, architecture notes, and release evidence |
| #1891 | `codex/admissions-manage-admission-datetime` | #1889 | Oslo-aware admission date-time controls, shared-calendar adaptation, form wiring, and serialization regressions |

Relationship:

`master <- CI <- domain <- authority <- workflow v1 <- Cypress <- draft lifecycle <- solver v2 <- conflict collection <- authority hardening <- data integrity <- shared UI <- configuration UI <- availability UI <- solver setup UI <- draft UI <- plan UI <- workspace UI <- acceptance <- admission date-time`

The compact migration chain follows the same independent-build boundary.
PRs #1878, #1879, #1880, #1882, #1883, and #1884 own migrations `0004` through `0009` respectively.
PR #1880 performs the legacy-answer backfill when it introduces the scoped columns, so #1886 needs no late data migration.
Non-migration PRs do not add empty schema files.

The domain PR includes the smallest runnable v1 `SolveJob` and worker bootstrap because later domain tests require an executable contract.
The workflow-v1 PR owns lifecycle hardening.
The UI layers follow all draft, solver-v2, conflict, and compatibility providers, so every branch builds against interfaces already present in its target.

Static component fixtures remain separate from authenticated page and API tests.
Each UI layer owns a typed fixture entrypoint or an application route that makes its source graph independently reachable to Knip.
The release-acceptance layer contains only scenarios that genuinely cross several preceding layers.

Broad application-management redesign, general admin redesign, application-form redesign beyond the admission date-time controls, receipt redesign, and unrelated visual migration work remain outside this stack.
Shared UI changes are included only when the scheduler or admission date-time controls consume them.

After any lower PR changes or merges, rebase every descendant and rerun its gates on the new SHA.
Do not expose the archived overlapping history as PRs.
