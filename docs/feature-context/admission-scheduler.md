# Admissions scheduler

## Product model

The scheduler has one canonical admission-wide plan and committee-context
entries into that plan. A person can belong to several committees and can have
a different role in each. The landing page therefore exposes every action the
actor can actually use instead of redirecting them into one inferred role:

- an application-admin entry for each committee where the actor has that
  authority;
- a schedule-admin entry for each authority committee;
- a schedule-member or availability entry for each current committee
  membership;
- candidate and conflict workspaces for represented committees.

For example, an actor who is a member of committee 1 and an admin for committee
2 sees the committee 2 application-admin and schedule-admin entries alongside
the committee 1 schedule-member entry. The committee selected by a
schedule-admin entry supplies workspace and outreach context; it never creates
a second plan. Every entry reads and writes the same admission-scoped
`SavedSchedule`.

The same actor can see several kinds at once. Role precedence must never hide
another valid workspace.

## Workflow

The scheduler follows one canvas, one status, and one dominant task:

1. `Grunnlag`: configure interview windows and collect availability.
2. `Planutkast`: create and manually adjust an anonymous draft.
3. Open conflict-of-interest collection when the draft is ready for names to be
   disclosed to the relevant committees.
4. Review reported conflicts and repair or re-run the current draft with an
   explicit strategy.
5. Publish the revision-checked current draft.

Panel size, manual blocks, locks, proposals, conflict repair, and publication
belong to `Planutkast`. Conflict collection is not a prerequisite for creating
the first anonymous draft. Candidate identity and contact disclosure remain
separate from timetable visibility.

`SavedSchedule` is the only persisted plan authority. `SolveJob` records
asynchronous execution; solver output is a proposal until it is applied against
the expected schedule revision. First creation must send
`expected_updated_at: null`.

## Authority and disclosure

- Admission-wide schedule configuration, solving, applying, editing, and
  publication require admission-admin authority.
- Committee recruiter access is projected to represented committees and
  candidates. It does not grant admission-wide schedule mutation authority.
- Candidate names stay pseudonymous until the relevant conflict-collection
  boundary opens.
- Published timetable access does not imply candidate identity, phone, or
  contact disclosure.
- Server responses omit unauthorized rows and fields; the frontend is not the
  privacy boundary.
- Logout, demotion, admission removal, and account switching advance authority
  epochs and purge admission-scoped sensitive queries and browser state.

## Consistency model

All canonical writes are revision checked. A proposal records its baseline and
cannot be applied after the draft or participant scope changes. Ambiguous writes
reconcile against the server before the UI claims success or offers a retry.
Admission and dependent rows use a consistent admission-first lock order.

The interface uses the same labels and interaction patterns throughout:
`Grunnlag`, `Planutkast`, conflict review, and published plan. Explanatory copy
is shown only when it changes the next decision. A heading or status that merely
repeats the active stage or enabled primary action is redundant.

## Deliberate architecture boundaries

Large state-owning composition roots are retained when splitting them would
produce shallow, prop-heavy modules. Three deeper follow-up seams are recorded
without blocking this release:

1. a `useScheduleRepairWorkflow` module for repair baselines, stale-result
   rejection, comparison, and application;
2. an availability-inspection model beside `availabilityCoverage.ts`;
3. a dedicated `EditablePanelChip` module that preserves its current interface.

These are module-depth opportunities, not file-size defects.
