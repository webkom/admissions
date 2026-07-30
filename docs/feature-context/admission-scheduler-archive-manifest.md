# Admissions scheduler archive manifest

## Source freeze

- Base: `master` at `df51ca4d804bb1f3ef97aaee0c87286dab92503b`
- Original local source archive:
  `codex/archive-distribute-interviews-2026-07-24` at
  `0a9fe95373d0`
- Post-review working-state archive:
  `codex/archive-post-review-working-state-2026-07-25` at
  `7922f679954a`
- Reviewed rebuild archive:
  `codex/archive-reviewed-rebuild-before-stack-fix-2026-07-25` at
  `d84283ab88f9`
- Pre-final-reorder archive:
  `codex/archive-pre-final-stack-rewrite-2026-07-25` at
  `7da53adbd754`
- Pre-CI-compatibility archive:
  `codex/archive-pre-ci-virtualenv-recut-2026-07-25` at
  `51c80a15a04e`
- Pre-virtualenv-security-recut archive:
  `codex/archive-pre-virtualenv-security-recut-2026-07-25` at
  `7cf6e571a903`
- Pre-CI-security-placement-recut archive:
  `codex/archive-pre-ci-security-placement-recut-2026-07-25` at
  `6fd75895feee`
- Pre-solver-metrics-flake-recut archive:
  `codex/archive-pre-solver-metrics-flake-recut-2026-07-25` at
  `7cefc6a6d92e`
- Pre-embedded-config-recut archive:
  `codex/archive-pre-embedded-config-recut-2026-07-25` at
  `e2f4b4e785b2`
- Pre-Cypress-CI-fix archive:
  `codex/archive-pre-cypress-ci-fix-2026-07-25` at
  `3311cfd78737`
- Pre-Vite-cleanup-fix archive:
  `codex/archive-pre-vite-cleanup-fix-2026-07-26` at
  `6c8c4815af35`
- Pre-PR5-layer-fix archive:
  `codex/archive-pre-pr5-layer-fix-2026-07-26` at
  `b0dab3d32926`
- Pre-PR4-layer-fix archive:
  `codex/archive-pre-pr4-layer-fix-2026-07-26` at
  `50b57b9e3299`
- Pre-CI-registry-retry archive:
  `codex/archive-pre-ci-registry-retry-2026-07-26` at
  `30c638eaea26`
- Pre-CI-manifest-ordering archive:
  `codex/archive-pre-ci-manifest-ordering-2026-07-26` at
  `5904884c4e9f`
- Pre-PR7-fixture-gate-fix archive:
  `codex/archive-pre-pr7-fixture-gate-fix-2026-07-26` at
  `989b8279c0dd`
- Pre-Docker-Yarn-retry archive:
  `codex/archive-pre-docker-yarn-retry-2026-07-26` at
  `4d82fc91c1b8`
- Pre-uWSGI-serial-build archive:
  `codex/archive-pre-uwsgi-serial-build-2026-07-26` at
  `4f3ce490c77b`
- Pre-tox-CPUCOUNT-pass-through archive:
  `codex/archive-pre-tox-cpucount-passenv-2026-07-26` at
  `d77def4114c6`
- Pre-solver-focus-fix archive:
  `codex/archive-pre-solver-focus-fix-2026-07-26` at
  `eaacd28f0d25`

All archive branches are local-only. They must not be pushed as product
branches. The original archive contains 325 paths changed from the base
(80,490 insertions and 5,815 deletions). The post-review archive contains 347
paths changed from the base (84,070 insertions and 6,083 deletions).

The archives contain intended tracked source, tests, and documentation. The
inventory excludes generated Cypress credentials, Cypress screenshots and
videos, dependency directories, and generated frontend bundles. Repository
image assets are source assets and remain included.

## Re-cut source

The clean final source was rebuilt from `master`, using the archives only as a
source snapshot. The pre-remediation runtime and acceptance source was
`ac96b6bf1ee`. The current reviewable stack changes 256 paths from the base; the
old overlapping commit history is not part of it.

## Package managers and tools

JavaScript uses Yarn only. The repository contains `yarn.lock` and no
`pnpm-lock.yaml` or `pnpm-workspace.yaml`. Python continues to use Poetry.

Frozen local tool versions:

- Git 2.50.1
- Node.js 26.4.0
- Yarn 1.22.22
- Vite 4.5.3
- Cypress 13.13.3
- Python 3.12.13
- Django 5.2.16
- Local Poetry 2.4.1
- Drone and lock-generation Poetry 1.8.5
- Virtualenv 20.36.1
- Docker 29.6.2

## Migration policy

The shared-environment inventory was completed read-only on 2026-07-27:

- production database `opptak`: no applied `admissions` migration at or after
  `0004`, and no scheduler tables, columns, or named constraints;
- staging database `opptak-staging`: the same empty migration and schema
  result;
- CI databases are ephemeral, and no persistent preview database exists in the
  checked deployment topology.

Because every persistent shared environment conclusively reported zero applied
scheduler migrations, the undeployed development chain was compacted from 30
files (`0004` through `0033`) to six independently reviewable files (`0004`
through `0009`). Each migration-bearing PR owns one migration so every stacked
branch still builds and migrates independently.

Migration `0006_scheduler_workflow` copies non-empty legacy admission questions
and application answers when the committee-scoped columns are introduced. Its
conditional SQL updates write only to rows that remain empty, preserving a
concurrent scoped write. Keeping this transition at column introduction means
every later PR is independently data-compatible; no temporary compatibility
gap or second backfill migration remains. Reverse migration copies values back
only when every committee value for a parent is identical; divergence raises
`IrreversibleError` before the scoped columns can be dropped.

## Validation evidence

The application, frontend, and test tree at `ac96b6bf1ee` historically passed
the gates below before the migration compaction and authority-member
availability remediation. Those results remain provenance, not proof for the
rewritten PR heads. The current exact-SHA results are recorded by the PR checks
and final handoff.

The historical source included the final
fail-closed Cypress fixture default, bounded Drone and Docker Yarn-install
retries, the Vite-manifest dependency for backend tests, and deterministic
acceptance-test timing. Every Python dependency-installing Drone step and the
production image use uWSGI's documented `CPUCOUNT=1` serial-build override to
avoid its internal parallel compiler linking incomplete objects. Tox explicitly
passes the override into every nested Poetry install. Together, the exact source
has passed:

- `git diff --check`
- `yarn lint`
- `yarn types`
- `yarn knip`
- `yarn build`
- migration graph and dry-run checks
- isort, Black, and Flake8 checks
- the exact Drone Python image's tox install and formatting gate
- an exact linux/amd64 Drone-image tox/Poetry install of uWSGI 2.0.28 with
  `CPUCOUNT=1`, after verifying all five tox environments expose the variable
- the complete 419-test Django suite
- all 26 Cypress specs (216 tests)
- the two previously timing-sensitive acceptance specs four consecutive times
  (three Electron runs and one headless-Chrome run; 40 tests per run)
- the solver-setup focus-restoration spec six consecutive times after its
  focus-handoff repair (five Electron and one headless-Chrome run; 20 tests per
  run)
- the independently runnable PR 4 and PR 5 Cypress surfaces (three tests each)
- the prebuilt Vite fixture-preview gate (five specs, 67 tests)
- the authenticated Clipboard-API portability gate (10 tests, isolated database)
- Drone YAML parsing and retry success/fail-closed shell-path checks
- Drone dependency-graph validation, the formerly failing privacy/render surface
  (four tests), and the complete 419-test suite after an exact Vite build
- real testing/development settings imports with fixture preparation both
  disabled and explicitly enabled, production hard-disable, and all five
  fixture lifecycle tests with credential cleanup
- production Docker build
  `admissions-scheduler-pr-gate:ac96b6b`
  (manifest list
  `sha256:cf18b9f76cd93d094d89b19b92e0e024fd6ac3f58c45ca2b71e3a9ce01bea2a0`)

These local results are evidence for the stated source, not a substitute for
remote push-event CI, shared-environment migration rehearsal, or production
proof. Final exact-SHA reruns and audit results belong to the immutable PR check
runs and final handoff.
