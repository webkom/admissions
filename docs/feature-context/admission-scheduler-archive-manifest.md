# Admissions Scheduler Archive Manifest

This manifest freezes the source tree that will be re-cut into a reviewable
stack. It is an archive and recovery point, not a PR-ready release claim.

## Revisions

- Base branch: `master`
- Base revision: `df51ca4d804bb1f3ef97aaee0c87286dab92503b`
- Source snapshot: `64f51eadd3b431fb0e5f8d6cc82d18a3dcb90ae5`
- Archive branch: `codex/archive-distribute-interviews-2026-07-24`
- Snapshot date: 2026-07-25, Europe/Oslo
- Snapshot diff: 323 files, 80,378 insertions, 5,815 deletions
- Cypress specs: 25

## Local toolchain

- Node.js: 24.11.0
- Yarn: 1.22.22
- Poetry: 2.4.1
- Python: 3.12.13

The repository and CI continue to define the supported versions. These values
only record the machine used to freeze the snapshot.

## Included

- All tracked and untracked source files, migrations, tests, and feature
  documentation present in the scheduler working tree.
- The newer conflict-collection migration and UI.
- The deterministic Cypress fixture loader and all acceptance specifications.
- Unrelated application/admin work so it can be recovered into a later,
  separate stack.

## Excluded generated state

- `.cypress-fixture-credentials.json`
- `cypress/screenshots/`
- `cypress/videos/`
- `admissions/settings/local.py`
- frontend and Python build/cache output

Generated Cypress screenshots were moved to the user's Trash before the
snapshot. No credential file was present.

## Evidence status at freeze

The validation recorded in `admission-scheduler.md` predates this exact archive
commit and is historical only. Every re-cut branch must be validated on its own
commit. The final top-of-stack commit must run the full backend, frontend, and
Cypress gates before the release ledger can mark it PR-ready.

