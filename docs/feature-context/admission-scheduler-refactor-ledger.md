# Admission Scheduler Refactor Ledger

This ledger records the architecture review for the release-hardening working
tree. Approximate sizes are the `wc -l` values on 2026-07-24; they are review
triggers, not pass/fail limits. A file is split only where a responsibility
boundary is clear and the acceptance suite protects the move.

| File | Approx. size | Current responsibilities | Duplicated or coupled logic observed | Existing abstraction to reuse | Extraction or retain decision | Cohesion rationale | Protecting tests |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| `frontend/src/routes/SchedulePage/index.tsx` | 1,019 lines | Admission/bootstrap authority, role projection, sensitive-scope recovery, data-health orchestration, section navigation, and composition of foundation, draft, review, publication, and execution surfaces | Section visibility and focus restoration appear at each workspace boundary; the coupling is to route-owned navigation and server role state rather than duplicated domain rules | `useScheduleConfiguration`, `useScheduleParticipants`, `useAvailabilityEditor`, `useScheduleWorkflow`, `useDistributedPlanActions`, `workflowStages.ts`, and stage view components | **Retain as route composition root for this release.** If it grows again, extract a `SolverWorkspace` presentational component receiving already-authorized data and callbacks; do not move actor/scope recovery out of the route boundary | Access recovery must purge before protected content can paint, while child hooks already own the independent data and mutation concerns. An extra container now would mostly relay props and obscure that boundary | Authenticated workflow and release acceptance specs; sensitive-access model; backend admission-access and privacy tests |
| `frontend/src/components/Scheduling/Solver/useSolveJob.ts` | 680 lines | Active-job state, lifecycle coordination, last-good-result recovery, proposal persistence/actions, elapsed state, and restoration after navigation or refresh | Storage mechanics were separable from the hook's concurrency and authority decisions | `solveJobLifecycle.ts` owns HTTP/poll/cancel/apply; `solveJobStorage.ts` owns typed session-storage parsing and key operations | **Extracted storage mechanics; retained one orchestration owner.** React state, run IDs, restoration decisions, and stale-response guards remain in the hook | Storage is now a deterministic boundary without creating a second lifecycle owner | `solver_async_race_spec.cy.tsx`, API job hardening, worker resilience, proposal restoration and stale-baseline cases |
| `frontend/src/components/Scheduling/Solver/SolverView.tsx` | 787 lines | Connects the solver session, derived draft, autosave, proposal decision, regeneration, repair, missing-placement task, and permanent draft canvas | Temporary-task layout, proposal presentation, and published-plan notice were presentational boundaries | `DraftTaskLayout`, `ProposalDecisionPanel`, `PublishedPlanNotice`, `useSolverSession`, `useScheduleDraftPersistence`, and `SolverResults` | **Extracted presentational boundaries; retained state authority.** Proposal application, focus control, and stale-proposal guards remain in `SolverView` | The composition root still owns the state machine while repeated layout and decision rendering have explicit contracts | Solver setup/results specs, workflow-stage model, draft persistence and async race specs, TypeScript |
| `frontend/src/components/Scheduling/Solver/SolverSetupPanel.tsx` | 747 lines | First-solve readiness, strategy selection, regeneration mode, blockers, and solve/cancel actions | Advanced-option rendering and in-progress presentation were independent of mode ownership | `AdvancedSolverSettings`, `SolveProgress`, `SamplePlanPreview`, and pure readiness/option helpers | **Extracted advanced settings and progress presentation.** `SolverSetupPanel` still owns first-run versus regeneration mode and the validated option object | Both modes retain one source of option defaults, blockers, and the dominant action | `solver_setup_panel_spec.cy.ts`, workflow-stage model, 390/768/1280 viewport checks, solver request tests |
| `frontend/src/components/Scheduling/Solver/SolverResults.tsx` | 1,026 lines | Permanent draft canvas, list/calendar/person projections, preview/edit modes, assignment controls, persistence state, and the single next action | Panel-member status labels and plan-health presentation were repeated or self-contained | `PanelMemberChips`, `PlanHealthSummary`, `useScheduleDraft`, `solverSelectors.ts`, and `planDraftWorkflow.ts` | **Extracted shared status and health presentation; retained draft authority.** Projection state, save status, and action selection remain calculated once | The extracted components share semantics across projections without moving edit ownership out of the draft canvas | Planutkast interaction specs, schedule-draft model, selectable-grid keyboard/touch tests, async persistence races |
| `frontend/src/components/Scheduling/Calendar/AvailabilityHeatmap.tsx` | 878 lines | Aggregate coverage, selected-block detail, participation status, and response administration | Filters and the coverage legend were stateless, independently understandable presentation | `AvailabilityFilters`, `CoverageLegend`, `ScheduleGridFrame`, and the shared computed block model | **Extracted filters and legend; retained aggregate plus drill-down.** Coverage computation and response mutations remain in one owner | The heatmap and detail still share identical denominators and tier semantics while low-coupling controls no longer inflate the owner | Interview workflow coverage test, release viewport/zoom acceptance, heatmap model and semantic interaction checks |
| `frontend/src/components/Scheduling/Calendar/AdminScheduleConfig.tsx` | 824 lines | Period, duration, block strategy, enabled-window editing, validation, dirty state, and staged save/reset | Date/window validation is coordinated with grid editing, but visual editing is already delegated; no second domain state machine remains | `AdminSchedulePatternGrid`, `AdminScheduleSettingsPanel`, `AdminAvailabilityGrid`, `adminScheduleConfigModel.ts`, and `useScheduleGridDragToggle` | **Retain the state coordinator.** Do not add another wrapper. Any future extraction should be pure validation functions added to `adminScheduleConfigModel.ts`, never a second form store | One coordinator is necessary so grid, pattern, and settings edits produce one revision-checked save payload and one dirty baseline | Config model/toggle/popover specs, selectable-grid keyboard and drag tests, schedule API revision tests |
| `frontend/src/routes/SchedulePage/DistributedPlanView.tsx` | 515 lines | Published-plan filters, disclosure controls, export, outreach template, unlock flow, and table/calendar/person selection | View selection repeats only projection plumbing; mutations and export formatting are already outside the component | `useDistributedPlanActions`, export helpers, `DistributedPlanTable`, `DistributedPlanCalendar`, entry controls, and outreach components | **Retain as published-plan composition root.** No extraction is justified until another published-plan consumer needs the same filter/view shell | This is the single boundary where a server-scoped published projection becomes view/export/outreach UI; keeping it together makes disclosure state visible | Authenticated published-plan workflow, export/outreach model specs, release screenshots and overflow assertions |
| `frontend/src/routes/SchedulePage/DistributedPlanTable.tsx` | 506 lines | Semantic slot grouping, published rows, editable drag/click movement, panel/time controls, and interview workflow cells | Mouse and keyboard movement converge on the same callbacks; duplicating a separate mobile card layout would repeat row relationships and controls | `DistributedPlanEntryControls`, shared time/chunk helpers, interview workflow components, and contained horizontal scrolling | **Retain one semantic table.** Do not create responsive card duplication; extract `PlanBlockHeader`/row cells only if another projection consumes them | Column relationships matter for screen readers and auditability. The contained horizontal viewport preserves semantics and tested mobile behavior without two implementations | Native table semantics, schedule navigation/interactions, interview workflow acceptance, 390/768/1280 overflow checks |

## Completed responsibility-level refactors

- Centralized workflow facts in `workflowStages.ts` instead of duplicating
  state interpretation across stage components. Only the publication stage
  exposes action fields because it is the only renderer driven by that action
  contract; foundation and draft actions stay with their rendered task owners.
- Centralized pointer-drag toggle behavior in `useScheduleGridDragToggle.ts`.
  The shared selectable calendar now uses native table headers, one roving tab
  stop, row/column keyboard movement, and a standalone click path for
  assistive-technology activation without double-applying physical clicks.
  Secondary/Control-clicks are ignored, while touch activation waits until
  pointer-up and is cancelled by a pan threshold. Admin block, fine-slot,
  pause, and popover controls include their date in the accessible name.
- Kept solve HTTP, polling, cancellation, apply, and access-failure interruption in `solveJobLifecycle.ts`; `useSolveJob.ts` owns React state and stale-run coordination, while `solveJobStorage.ts` owns typed session-storage mechanics.
- Extracted `DraftTaskLayout`, `ProposalDecisionPanel`, and
  `PublishedPlanNotice` from `SolverView`; `AdvancedSolverSettings` and
  `SolveProgress` from `SolverSetupPanel`; `PanelMemberChips` and
  `PlanHealthSummary` from `SolverResults`; and `AvailabilityFilters` and
  `CoverageLegend` from `AvailabilityHeatmap`.
- Centralized keyboard focus styling in the shared scheduling/UI primitives so local controls do not depend on the global component library’s outline reset.
- Centralized native `details` action-menu focus, arrow/Home/End navigation,
  outside close, Escape handling, and opener restoration in
  `useDetailsMenu`; repair, candidate review, proposal comparison, export, and
  confirmation tasks each move focus to a meaningful heading and restore the
  initiating control.
- Kept schedule persistence conflict handling in
  `useScheduleDraftPersistence.ts`, with callback refs, pending/in-flight
  fingerprint guards, unmount cleanup, and revision-scoped durable
  fingerprints. Intermediate acknowledgements advance the session-owned
  baseline before the canonical query cache updates without marking a newer
  queued edit saved. Latest-intent coalescing covers edit, undo, and redo
  during an in-flight write; an uncertain failed write requires a confirmed
  compensating save. Publication requires an acknowledged saved state with no
  local draft, conflict, save, or error in progress.
- Reconciled worker-promoted first drafts from the terminal job state instead
  of issuing a second browser apply. Apply-time proposal conflicts keep the
  comparison visible but non-actionable, refetch schedule, availability, and
  candidate state, and replace adoption with discard-and-regenerate.
  State-dependent validation invalidation at apply time is a `409`, including
  a conflict recorded after proposal generation. The backend durably discards
  a state-invalidated proposal, so reload restoration cannot make the rejected
  proposal actionable again when the saved-schedule revision itself is
  unchanged.
- Kept a remote-revision proposal visible as an explicitly stale comparison
  instead of silently removing it; applying is replaced by the safe
  discard-and-regenerate action while the newly authoritative saved draft
  remains visible.
- Kept publication ambiguity recovery in `useDistributedPlanActions.ts`: a fresh canonical read may reconcile a lost response or matching retry conflict, while a different state remains a conflict and an unreadable state is reported as unknown.
- Bound every sensitive request and mutation to monotonic global/admission
  authority epochs. Logout now waits for a server-confirmed session transition
  before purging this tab, advancing the epoch, and notifying other tabs; a
  failed request falls back to direct server navigation without publishing a
  false anonymous-actor signal. Both logout links use the same shared handler.
- Suppressed the permanent canvas action/status footer while a temporary
  generation task is active, and restore focus to the current-draft heading
  when regeneration closes.
- Opt-out confirmations move focus into the inline decision and restore it to
  the resulting participation control after cancellation or a completed
  mutation. A rejected mutation leaves the confirmation open and restores
  focus to its cancel action instead of dropping focus to the document body.
- Clarified the v1/v2 differential oracle: validity, placement, and
  unplaceable-reason parity remain unconditional, while objective dominance is
  compared only for a v2 result that explicitly proved optimal within its
  budget.
- Added deterministic runtime screenshot checkpoints for block fine-tuning,
  first solve, regeneration, manual editing, candidate review, repair, stale
  proposal comparison, publication readiness, responsive published views, and
  the standard-block pause model.

The divergent release-risk pass and its converge/defer decisions are recorded in
`admission-scheduler-release-risk-adhd.md`. Its selected publication boundary is
protected by `distributed_plan_transition_spec.cy.tsx` and the backend
single-transition retry test.

## Deferred work must preserve

- one `SavedSchedule` authority and one active `SolveJob`;
- exact revision and baseline checks;
- last-good draft recovery during optional task failure;
- stale-response and role-scope guards;
- server-enforced row omission and identity disclosure;
- identical keyboard, touch, focus, reduced-motion, and responsive behavior after any presentational split.
