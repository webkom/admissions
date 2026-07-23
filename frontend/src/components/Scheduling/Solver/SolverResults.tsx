import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  GripVertical,
  List,
  Lock,
  LockKeyhole,
  MoreHorizontal,
  RotateCcw,
  Unlock,
  Wrench,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

import cn from "../../../utils/cn";
import GridCalendarView from "../Calendar/GridCalendarView";
import { assignmentAvailabilityLabel } from "../assignmentAvailability";
import {
  CustomSelect,
  EditablePanelChip,
  SegmentedControl,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelHeader,
  SchedulingActionBar,
  SchedulingButton,
  SchedulingModeControl,
  type SchedulingWorkspaceMode,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";
import type { InitialPlanningStrategy, SavedSchedule } from "../types";
import {
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  formatSlotLabel,
} from "../scheduleUtils";
import InterviewerLoadView from "./InterviewerLoadView";
import { hasSchedule, type SolveResponse } from "./solverHelpers";
import type { ScheduleDraftController } from "./useScheduleDraft";
import type { ScheduleDraftPersistence } from "./useScheduleDraftPersistence";
import {
  assignmentPanelMemberKey,
  type AssignmentConflictSummary,
} from "./assignmentConflicts";
import { derivePlanDraftWorkflowState } from "./planDraftWorkflow";

interface SolverResultsProps {
  result: SolveResponse | null;
  planRevealed: boolean;
  solveTick: number;
  savedSchedule?: SavedSchedule;
  draft: ScheduleDraftController;
  persistence: ScheduleDraftPersistence;
  hasLocalDraft: boolean;
  dates: string[];
  sessionDuration: number;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: Set<string>;
  editRequestKey: number;
  assignmentConflicts: AssignmentConflictSummary;
  blockRestPreferenceEnabled: boolean | null;
  panelSize: number;
  proposalStrategy: InitialPlanningStrategy;
  canonicalBlocks: number[][];
  currentReviewRequired: boolean;
  currentReviewComplete: boolean;
  completeReviewerCount: number;
  requiredReviewerCount: number;
  pendingReviewerCount: number;
  missingReviewerNames: string[];
  publicationReady: boolean;
  solverError: string;
  onOpenSettings: () => void;
  onOpenConflictReview: () => void;
  onOpenRepair: () => void;
  onRetrySolve: () => void;
  onOpenPlan: () => void;
  onPreviewWithAvailabilityDeviation: () => void;
  previewLoading: boolean;
}

const strategyLabel = (strategy: InitialPlanningStrategy) =>
  strategy === "minimize_overtime"
    ? "Følg tilgjengeligheten"
    : strategy === "compact_days"
      ? "Kompakte intervjudager"
      : strategy === "balance_workload"
        ? "Jevn arbeidsmengde"
        : "Balansert";

const SolverResults = ({
  result,
  planRevealed,
  solveTick,
  savedSchedule,
  draft,
  persistence,
  hasLocalDraft,
  dates,
  sessionDuration,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  enabledSlots,
  editRequestKey,
  assignmentConflicts,
  blockRestPreferenceEnabled,
  panelSize,
  proposalStrategy,
  canonicalBlocks,
  currentReviewRequired,
  currentReviewComplete,
  completeReviewerCount,
  requiredReviewerCount,
  pendingReviewerCount,
  missingReviewerNames,
  publicationReady,
  solverError,
  onOpenSettings,
  onOpenConflictReview,
  onOpenRepair,
  onRetrySolve,
  onOpenPlan,
  onPreviewWithAvailabilityDeviation,
  previewLoading,
}: SolverResultsProps) => {
  const [viewType, setViewType] = useState<"list" | "calendar" | "person">(
    "list",
  );
  const [workspaceMode, setWorkspaceMode] =
    useState<SchedulingWorkspaceMode>("preview");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [selectedListScheduleIndex, setSelectedListScheduleIndex] = useState<
    number | null
  >(null);
  const [draggedListScheduleIndex, setDraggedListScheduleIndex] = useState<
    number | null
  >(null);
  const [listDropTargetIndex, setListDropTargetIndex] = useState<number | null>(
    null,
  );
  const { presentation } = draft;
  const isEditing = workspaceMode === "editing";
  const canEditDraft = isEditing && !savedSchedule?.is_distributed;
  const occupiedTimes = useMemo(
    () => new Set(presentation.sortedSchedule.map((item) => item.time)),
    [presentation.sortedSchedule],
  );
  const formatSlotTime = (time: number) =>
    formatSlotLabel(time, dates, sessionDuration);
  const blockSummaryByScheduleIndex = useMemo(() => {
    const summary = new Map<number, string>();
    const blocks = canonicalBlocks
      .filter((block) => block.length > 0)
      .map((block) => [...block].sort((left, right) => left - right))
      .sort((left, right) => left[0] - right[0]);

    blocks.forEach((block) => {
      const blockTimes = new Set(block);
      const entries = presentation.sortedEntries.filter(({ item }) =>
        blockTimes.has(item.time),
      );
      if (entries.length === 0) return;

      const { dayIndex, minute: startMinute } = decodeScheduleTime(
        block[0],
        sessionDuration,
      );
      const endMinute =
        decodeScheduleTime(block[block.length - 1], sessionDuration).minute +
        sessionDuration;
      const date = dates[dayIndex];
      const dateLabel = date
        ? Object.values(formatDateHeader(date)).join(" ")
        : `Dag ${dayIndex + 1}`;
      summary.set(
        entries[0].scheduleIndex,
        `${dateLabel} · Blokk ${formatMinutes(startMinute)}–${formatMinutes(
          endMinute,
        )} · ${entries.length} intervju${entries.length === 1 ? "" : "er"}`,
      );
    });

    return summary;
  }, [canonicalBlocks, dates, presentation.sortedEntries, sessionDuration]);

  useEffect(() => {
    setSelectedInterviewer("");
    setSelectedListScheduleIndex(null);
    setDraggedListScheduleIndex(null);
    setListDropTargetIndex(null);
    setWorkspaceMode("preview");
    draft.finishEditSession();
  }, [draft.finishEditSession, solveTick]);

  useEffect(() => {
    if (editRequestKey > 0 && !savedSchedule?.is_distributed) {
      draft.beginEditSession();
      setWorkspaceMode("editing");
    }
  }, [draft.beginEditSession, editRequestKey, savedSchedule?.is_distributed]);

  useEffect(() => {
    if (
      workspaceMode !== "preview" ||
      !persistence.isSaved ||
      persistence.isSaving ||
      hasLocalDraft ||
      persistence.hasConflict ||
      persistence.state === "error"
    ) {
      return;
    }
    draft.finishEditSession();
  }, [
    draft.finishEditSession,
    hasLocalDraft,
    persistence.hasConflict,
    persistence.isSaved,
    persistence.isSaving,
    persistence.state,
    workspaceMode,
  ]);

  const clearListMove = () => {
    setDraggedListScheduleIndex(null);
    setListDropTargetIndex(null);
  };

  const selectOrSwapListInterview = (scheduleIndex: number) => {
    if (selectedListScheduleIndex === null) {
      setSelectedListScheduleIndex(scheduleIndex);
      return;
    }
    if (selectedListScheduleIndex !== scheduleIndex) {
      draft.swapTimes(selectedListScheduleIndex, scheduleIndex);
    }
    setSelectedListScheduleIndex(null);
  };
  const unplaceableCount = presentation.unplaceableCandidates.length;
  const overviewStats = presentation.overviewStats;
  const totalCandidateCount =
    presentation.sortedSchedule.length + unplaceableCount;
  const usedBlockCount = blockSummaryByScheduleIndex.size;
  const saveStatusLabel = persistence.hasConflict
    ? "Lagring stoppet"
    : persistence.state === "error"
      ? "Kunne ikke lagre"
      : persistence.isSaving || hasLocalDraft
        ? "Lagrer utkast…"
        : "Utkast lagret";
  const workflowState = derivePlanDraftWorkflowState({
    saveState:
      persistence.hasConflict || persistence.state === "conflict"
        ? "conflict"
        : persistence.state === "error"
          ? "error"
          : persistence.isSaving || hasLocalDraft
            ? "saving"
            : persistence.state,
    hasSaveConflict: persistence.hasConflict,
    saveError: persistence.error,
    solverError,
    unplaceableCount,
    currentReviewRequired,
    currentReviewComplete,
    completeReviewerCount,
    requiredReviewerCount,
    pendingReviewerCount,
    missingReviewerNames,
    assignmentConflictCount: assignmentConflicts.assignmentCount,
    publicationReady,
  });
  const healthExceptions = [
    unplaceableCount > 0 ? `${unplaceableCount} mangler plass` : undefined,
    presentation.availabilitySummary.outsideAvailabilityAssignments > 0
      ? `${presentation.availabilitySummary.outsideAvailabilityAssignments} utenfor tilgjengelighet`
      : undefined,
    assignmentConflicts.assignmentCount > 0
      ? `${assignmentConflicts.assignmentCount} inhabilitet${assignmentConflicts.assignmentCount === 1 ? "" : "er"}`
      : undefined,
    presentation.blockRestSummary.exceptionCount > 0
      ? `${presentation.blockRestSummary.exceptionCount} hvileavvik`
      : undefined,
  ].filter((value): value is string => Boolean(value));
  const startEditing = () => {
    if (workspaceMode === "editing") return;
    if (!draft.canRestoreEditSession) draft.beginEditSession();
    setWorkspaceMode("editing");
  };
  const changeWorkspaceMode = (nextMode: SchedulingWorkspaceMode) => {
    if (nextMode === "editing") {
      startEditing();
      return;
    }
    setWorkspaceMode("preview");
  };
  const hasConflictFor = (
    scheduleIndex: number,
    member: Parameters<typeof assignmentPanelMemberKey>[1],
  ) =>
    assignmentConflicts.affectedPanelMemberKeys.has(
      assignmentPanelMemberKey(scheduleIndex, member),
    );

  const lockLabel = (
    item: (typeof presentation.sortedEntries)[number]["item"],
  ) => (item.locked ? "Lås opp intervju" : "Lås intervju");

  const lockDescription = (
    item: (typeof presentation.sortedEntries)[number]["item"],
  ) =>
    item.locked
      ? "Intervjuet beholdes når forslaget genereres på nytt."
      : "Behold tid og panel når forslaget genereres på nytt.";

  return (
    <>
      {hasSchedule(result?.status) && planRevealed && (
        <SchedulePanel dataCy="proposal-review" className="animate-fade-in">
          <SchedulePanelHeader
            title="Planutkast"
            description={`${presentation.sortedSchedule.length} intervjuer · ${panelSize} per intervju · Generert med ${strategyLabel(
              proposalStrategy,
            )}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {viewType === "person" ? (
                  <button
                    type="button"
                    onClick={() => setViewType("list")}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Tilbake til planen
                  </button>
                ) : (
                  <div data-cy="view-switcher" data-view={viewType}>
                    <SegmentedControl<"list" | "calendar">
                      value={viewType}
                      onChange={setViewType}
                      items={[
                        {
                          key: "list",
                          label: "Liste",
                          icon: <List size={iconSizes.small} />,
                        },
                        {
                          key: "calendar",
                          label: "Kalender",
                          icon: <CalendarDays size={iconSizes.small} />,
                        },
                      ]}
                      aria-label="Visning av planutkastet"
                    />
                  </div>
                )}
                {viewType !== "person" && (
                  <SchedulingModeControl
                    mode={workspaceMode}
                    onChange={changeWorkspaceMode}
                  />
                )}
                {!isEditing && (
                  <details className="group relative">
                    <summary
                      className={cn(
                        actionButtonBase,
                        actionButtonNeutral,
                        "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                      )}
                    >
                      <MoreHorizontal
                        size={iconSizes.small}
                        aria-hidden="true"
                      />
                      Flere
                      <ChevronDown
                        size={iconSizes.small}
                        aria-hidden="true"
                        className="transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="absolute right-0 top-full z-30 mt-2 min-w-56 overflow-hidden rounded-lg border border-border bg-surface-base p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={(event) => {
                          setViewType("person");
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        className="flex w-full rounded-md px-3 py-2 text-left text-ui font-semibold text-text-primary hover:bg-surface-subtle"
                      >
                        Vis belastning
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          setDetailsOpen(true);
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        className="flex w-full rounded-md px-3 py-2 text-left text-ui font-semibold text-text-primary hover:bg-surface-subtle"
                      >
                        Vis genereringsdetaljer
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          onOpenSettings();
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                        }}
                        data-cy="proposal-rerun"
                        className="flex w-full rounded-md px-3 py-2 text-left text-ui font-semibold text-text-primary hover:bg-surface-subtle"
                      >
                        Generer nytt forslag
                      </button>
                    </div>
                  </details>
                )}
              </div>
            }
          />
          <SchedulePanelBody>
            {overviewStats && (
              <section
                aria-label="Resultat fra planleggingen"
                data-cy="plan-health-summary"
                className="mb-4 border-b border-border-soft pb-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-ui text-text-muted">
                    <strong className="font-semibold tabular-nums text-text-primary">
                      {overviewStats.totalInterviews} av {totalCandidateCount}{" "}
                      planlagt
                    </strong>
                    {healthExceptions.map((exception) => (
                      <span key={exception}> · {exception}</span>
                    ))}
                  </p>
                  <button
                    type="button"
                    aria-expanded={detailsOpen}
                    aria-controls="plan-draft-details"
                    onClick={() => setDetailsOpen((open) => !open)}
                    className="inline-flex items-center gap-1 text-detail font-semibold text-brand hover:underline"
                  >
                    {detailsOpen ? "Skjul detaljer" : "Vis detaljer"}
                    <ChevronDown
                      size={15}
                      aria-hidden="true"
                      className={cn(
                        "transition-transform",
                        detailsOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>
                {detailsOpen && (
                  <div
                    id="plan-draft-details"
                    className="mt-4 grid gap-3 rounded-lg bg-surface-subtle px-4 py-3 text-detail text-text-muted"
                  >
                    <dl className="m-0 grid gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-text-subtle">
                          Fordeling
                        </dt>
                        <dd className="m-0 mt-0.5 font-semibold tabular-nums text-text-primary">
                          {overviewStats.minLoad}–{overviewStats.maxLoad}{" "}
                          intervjuer
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-text-subtle">
                          Arbeidsblokker
                        </dt>
                        <dd className="m-0 mt-0.5 font-semibold tabular-nums text-text-primary">
                          {usedBlockCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-text-subtle">
                          Generering
                        </dt>
                        <dd className="m-0 mt-0.5 font-semibold text-text-primary">
                          {strategyLabel(proposalStrategy)}
                        </dd>
                      </div>
                    </dl>
                    <p data-cy="block-rest-summary" className="m-0">
                      {blockRestPreferenceEnabled === null
                        ? "Innstillingen for hvile mellom blokker er ukjent for dette utkastet."
                        : !blockRestPreferenceEnabled
                          ? "Hvile mellom arbeidsblokker var ikke prioritert."
                          : presentation.blockRestSummary.honored
                            ? "Hvile mellom arbeidsblokker er oppfylt."
                            : `${presentation.blockRestSummary.exceptionCount} unntak fra hvile mellom arbeidsblokker.`}
                    </p>
                    {presentation.blockRestSummary.isNonOptimal && (
                      <p className="m-0 font-semibold text-amber-800">
                        Søket ble avsluttet før optimalitet var bevist.
                      </p>
                    )}
                    {presentation.blockRestSummary.optimalityUnknown && (
                      <p className="m-0">
                        Optimalitet er ikke kjent for dette gjenopprettede
                        utkastet.
                      </p>
                    )}
                    {unplaceableCount > 0 && (
                      <button
                        type="button"
                        disabled={previewLoading}
                        onClick={onPreviewWithAvailabilityDeviation}
                        className="justify-self-start font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        {previewLoading
                          ? "Beregner forslag…"
                          : "Forhåndsvis komplett forslag med avvik"}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {canEditDraft && (
              <div
                data-cy="manual-schedule-editing"
                role="status"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-brand-border bg-brand-soft px-4 py-3 text-ui"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Wrench
                    size={iconSizes.small}
                    className="flex-none text-brand"
                    aria-hidden="true"
                  />
                  <p className="m-0 text-detail text-text-muted">
                    Du redigerer planen. Endringer lagres automatisk.
                  </p>
                </div>
                {draft.canRestoreEditSession && !persistence.hasConflict && (
                  <SchedulingButton
                    onClick={draft.restoreEditSession}
                    variant="quiet"
                  >
                    <RotateCcw size={iconSizes.small} aria-hidden="true" />
                    Angre redigeringen
                  </SchedulingButton>
                )}
              </div>
            )}
            {workflowState.kind !== "ready_to_publish" &&
              workflowState.kind !== "saving" &&
              (!isEditing ||
                workflowState.kind === "save_error" ||
                workflowState.kind === "save_conflict") && (
                <div
                  data-cy="proposal-workflow-notice"
                  role={workflowState.tone === "danger" ? "alert" : "status"}
                  className={cn(
                    "mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-ui",
                    workflowState.tone === "danger"
                      ? "border-danger-border bg-danger-bg text-danger"
                      : workflowState.tone === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-950"
                        : "border-border-soft bg-surface-subtle text-text-primary",
                  )}
                >
                  <AlertTriangle
                    size={iconSizes.small}
                    className="mt-0.5 flex-none"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="m-0 font-semibold">{workflowState.title}</p>
                    <p className="m-0 mt-1 text-detail leading-relaxed opacity-80">
                      {workflowState.description}
                    </p>
                  </div>
                </div>
              )}
            {viewType === "person" ? (
              <InterviewerLoadView
                entries={presentation.sortedEntries}
                distribution={presentation.interviewerDistribution}
                totalAssignments={presentation.totalAssignments}
                selectedInterviewer={selectedInterviewer}
                onSelectInterviewer={setSelectedInterviewer}
                canEditDraft={canEditDraft}
                interviewerOptions={presentation.interviewerOptions}
                onSwapPanelMember={draft.swapPanelMember}
                displayCandidate={presentation.displayCandidate}
                formatSlotTime={formatSlotTime}
                availabilityStatusFor={presentation.availabilityStatusFor}
                hasConflictFor={hasConflictFor}
              />
            ) : viewType === "list" ? (
              <>
                <div className="overflow-x-auto rounded-lg border border-border-soft">
                  <table className="w-full min-w-schedule-table border-collapse">
                    <thead>
                      <tr>
                        <th className="first:!rounded-tl-lg !rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Tidspunkt
                        </th>
                        <th className="!rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Kandidat
                        </th>
                        <th className="!rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Intervjupanel
                        </th>
                        {canEditDraft && (
                          <th className="last:!rounded-tr-lg !rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                            Behold
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {presentation.sortedEntries.map(
                        ({ item, scheduleIndex }) => {
                          const timeOptions = draft
                            .timeOptionsFor(scheduleIndex)
                            .map((time) => ({
                              value: String(time),
                              label: formatSlotTime(time),
                            }));
                          const blockSummary =
                            blockSummaryByScheduleIndex.get(scheduleIndex);
                          return (
                            <React.Fragment
                              key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                            >
                              {blockSummary && (
                                <tr>
                                  <th
                                    colSpan={canEditDraft ? 4 : 3}
                                    scope="rowgroup"
                                    className="border-y border-border-soft bg-surface-neutral px-4 py-2.5 text-left text-detail font-bold text-text-primary"
                                  >
                                    {blockSummary}
                                  </th>
                                </tr>
                              )}
                              <tr
                                title={
                                  item.locked
                                    ? "Manuell endring, beholdes når planen genereres på nytt"
                                    : undefined
                                }
                                onDragOver={(event) => {
                                  if (
                                    !canEditDraft ||
                                    draggedListScheduleIndex === null ||
                                    draggedListScheduleIndex === scheduleIndex
                                  ) {
                                    return;
                                  }
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                  setListDropTargetIndex(scheduleIndex);
                                }}
                                onDragLeave={(event) => {
                                  if (
                                    event.currentTarget.contains(
                                      event.relatedTarget as Node | null,
                                    )
                                  ) {
                                    return;
                                  }
                                  if (listDropTargetIndex === scheduleIndex) {
                                    setListDropTargetIndex(null);
                                  }
                                }}
                                onDrop={(event) => {
                                  if (!canEditDraft) return;
                                  event.preventDefault();
                                  const parsedIndex = Number(
                                    event.dataTransfer.getData("text/plain"),
                                  );
                                  const sourceIndex = Number.isInteger(
                                    parsedIndex,
                                  )
                                    ? parsedIndex
                                    : draggedListScheduleIndex;
                                  clearListMove();
                                  if (
                                    sourceIndex === null ||
                                    sourceIndex === scheduleIndex
                                  ) {
                                    return;
                                  }
                                  draft.swapTimes(sourceIndex, scheduleIndex);
                                }}
                                className={cn(
                                  "group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft",
                                  listDropTargetIndex === scheduleIndex &&
                                    "[&>td]:bg-surface-subtle [&>td]:ring-2 [&>td]:ring-inset [&>td]:ring-brand-ring",
                                  draggedListScheduleIndex === scheduleIndex &&
                                    "opacity-50",
                                )}
                              >
                                <td className="w-schedule-name whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                                  {canEditDraft ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        draggable
                                        aria-pressed={
                                          selectedListScheduleIndex ===
                                          scheduleIndex
                                        }
                                        aria-label={`Flytt intervjuet for ${presentation.displayCandidate(item)}`}
                                        title="Dra til en annen rad, eller klikk to grep for å bytte tid"
                                        onClick={() =>
                                          selectOrSwapListInterview(
                                            scheduleIndex,
                                          )
                                        }
                                        onDragStart={(event) => {
                                          event.dataTransfer.effectAllowed =
                                            "move";
                                          event.dataTransfer.setData(
                                            "text/plain",
                                            String(scheduleIndex),
                                          );
                                          setDraggedListScheduleIndex(
                                            scheduleIndex,
                                          );
                                          setSelectedListScheduleIndex(null);
                                        }}
                                        onDragEnd={clearListMove}
                                        className={cn(
                                          "flex h-8 w-6 flex-none cursor-grab items-center justify-center rounded border border-border-soft bg-surface-base text-text-faded hover:border-border-quiet hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50",
                                          selectedListScheduleIndex ===
                                            scheduleIndex &&
                                            "border-brand-strongBorder text-brand ring-2 ring-brand-ring",
                                        )}
                                      >
                                        <GripVertical
                                          size={iconSizes.detail}
                                          aria-hidden="true"
                                        />
                                      </button>
                                      <CustomSelect
                                        className="w-56"
                                        value={String(item.time)}
                                        onChange={(nextTime) =>
                                          draft.changeTime(
                                            scheduleIndex,
                                            nextTime,
                                          )
                                        }
                                        options={timeOptions}
                                        aria-label={`Endre tidspunkt for ${presentation.displayCandidate(item)}`}
                                      />
                                    </div>
                                  ) : (
                                    <span>{formatSlotTime(item.time)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                                  {presentation.displayCandidate(item)}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex flex-wrap gap-1.5">
                                    {item.panel.map((member, memberIndex) => {
                                      const availabilityStatus =
                                        presentation.availabilityStatusFor(
                                          item,
                                          member,
                                        );
                                      const availabilityLabel =
                                        assignmentAvailabilityLabel(
                                          availabilityStatus,
                                        );
                                      const hasConflict = hasConflictFor(
                                        scheduleIndex,
                                        member,
                                      );
                                      const optedOut =
                                        assignmentConflicts.optedOutPanelMemberKeys.has(
                                          assignmentPanelMemberKey(
                                            scheduleIndex,
                                            member,
                                          ),
                                        );
                                      const statusLabel = hasConflict
                                        ? optedOut
                                          ? "Deltar ikke lenger"
                                          : "Registrert inhabilitet"
                                        : availabilityLabel;
                                      return (
                                        <EditablePanelChip
                                          key={memberIndex}
                                          label={member.name}
                                          tone={
                                            availabilityStatus !== "verified"
                                              ? "overtime"
                                              : "neutral"
                                          }
                                          conflict={hasConflict}
                                          timeIssue={
                                            !hasConflict &&
                                            availabilityStatus !== "verified"
                                          }
                                          statusLabel={statusLabel ?? undefined}
                                          options={
                                            canEditDraft
                                              ? presentation.interviewerOptions.map(
                                                  (interviewer) => ({
                                                    id: interviewer.id,
                                                    name: interviewer.name,
                                                    disabled:
                                                      interviewer.name !==
                                                        member.name &&
                                                      item.panel.some(
                                                        (panelMember) =>
                                                          panelMember.name ===
                                                          interviewer.name,
                                                      ),
                                                  }),
                                                )
                                              : undefined
                                          }
                                          onSelect={
                                            canEditDraft
                                              ? (newName, newId) =>
                                                  draft.swapPanelMember(
                                                    scheduleIndex,
                                                    memberIndex,
                                                    newName,
                                                    newId,
                                                  )
                                              : undefined
                                          }
                                          title={
                                            canEditDraft
                                              ? `Bytt intervjuer${
                                                  statusLabel
                                                    ? ` — ${statusLabel.toLowerCase()}`
                                                    : ""
                                                }`
                                              : (statusLabel ?? undefined)
                                          }
                                        />
                                      );
                                    })}
                                  </div>
                                </td>
                                {canEditDraft && (
                                  <td className="w-40 whitespace-nowrap px-4 py-3 text-sm">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        draft.toggleLock(scheduleIndex)
                                      }
                                      aria-label={`${lockLabel(item)} for ${presentation.displayCandidate(item)}`}
                                      title={lockDescription(item)}
                                      className={cn(
                                        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-detail font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                                        item.locked
                                          ? "border-brand-activeBorder bg-brand-soft text-brand hover:bg-brand-panel"
                                          : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle",
                                      )}
                                    >
                                      {item.locked ? (
                                        <Lock
                                          size={iconSizes.tiny}
                                          aria-hidden="true"
                                        />
                                      ) : (
                                        <Unlock
                                          size={iconSizes.tiny}
                                          aria-hidden="true"
                                        />
                                      )}
                                      {lockLabel(item)}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            </React.Fragment>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <GridCalendarView
                schedule={presentation.displaySchedule}
                dates={dates}
                sessionDuration={sessionDuration}
                dayStartMinute={dayStartMinute}
                dayEndMinute={dayEndMinute}
                chunkSize={chunkSize}
                chunkBreakMinutes={chunkBreakMinutes}
                availableSlots={enabledSlots}
                occupiedTimes={occupiedTimes}
                showAvailabilityLegend={canEditDraft}
                compactSchedule
                onMoveItem={
                  canEditDraft
                    ? (sortedIndex, nextTime) => {
                        const entry = presentation.sortedEntries[sortedIndex];
                        if (!entry) return;
                        draft.changeTime(entry.scheduleIndex, String(nextTime));
                      }
                    : undefined
                }
                renderItem={(displayItem, sortedIndex) => {
                  const entry = presentation.sortedEntries[sortedIndex];
                  if (!entry) return null;
                  const { item, scheduleIndex } = entry;
                  const timeOptions = draft
                    .timeOptionsFor(scheduleIndex)
                    .map((time) => ({
                      value: String(time),
                      label: formatSlotTime(time),
                    }));
                  // The calendar column already names the weekday, so the
                  // compact picker only needs the date and time.
                  const calendarTimeOptions = timeOptions.map((option) => ({
                    ...option,
                    label: option.label.replace(/^\S+\s+/, ""),
                  }));
                  return (
                    <div
                      key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border-soft bg-surface-base px-2.5 py-2 shadow-sm"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex min-w-0 items-center gap-1 text-xs font-bold text-text-primary">
                          {item.locked && (
                            <Lock
                              size={iconSizes.tiny}
                              aria-label="Låst"
                              className="flex-none text-brand"
                            />
                          )}
                          <span className="truncate">
                            {displayItem.candidate}
                          </span>
                        </div>
                      </div>
                      {canEditDraft && (
                        <CustomSelect
                          className="w-full min-w-0"
                          compact
                          value={String(item.time)}
                          onChange={(nextTime) =>
                            draft.changeTime(scheduleIndex, nextTime)
                          }
                          options={calendarTimeOptions}
                          aria-label={`Endre tidspunkt for ${displayItem.candidate}`}
                        />
                      )}
                      {canEditDraft ? (
                        <button
                          type="button"
                          onClick={() => draft.toggleLock(scheduleIndex)}
                          aria-label={`${lockLabel(item)} for ${displayItem.candidate}`}
                          title={lockDescription(item)}
                          className={cn(
                            "inline-flex h-7 items-center self-start gap-1.5 rounded-md border px-2 text-detail font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                            item.locked
                              ? "border-brand-activeBorder bg-brand-soft text-brand hover:bg-brand-panel"
                              : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle",
                          )}
                        >
                          {item.locked ? (
                            <Lock size={iconSizes.tiny} aria-hidden="true" />
                          ) : (
                            <LockKeyhole
                              size={iconSizes.tiny}
                              aria-hidden="true"
                            />
                          )}
                          {item.locked ? "Lås opp intervju" : "Lås intervju"}
                        </button>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {item.panel.map((member, memberIndex) => {
                          const availabilityStatus =
                            presentation.availabilityStatusFor(item, member);
                          const availabilityLabel =
                            assignmentAvailabilityLabel(availabilityStatus);
                          const hasConflict = hasConflictFor(
                            scheduleIndex,
                            member,
                          );
                          const statusLabel = hasConflict
                            ? "Registrert inhabilitet"
                            : availabilityLabel;
                          return (
                            <EditablePanelChip
                              key={`${member.name}-${memberIndex}`}
                              label={member.name}
                              tone={
                                availabilityStatus !== "verified"
                                  ? "overtime"
                                  : "neutral"
                              }
                              conflict={hasConflict}
                              timeIssue={
                                !hasConflict &&
                                availabilityStatus !== "verified"
                              }
                              statusLabel={statusLabel ?? undefined}
                              options={
                                canEditDraft
                                  ? presentation.interviewerOptions.map(
                                      (interviewer) => ({
                                        id: interviewer.id,
                                        name: interviewer.name,
                                        disabled:
                                          interviewer.name !== member.name &&
                                          item.panel.some(
                                            (panelMember) =>
                                              panelMember.name ===
                                              interviewer.name,
                                          ),
                                      }),
                                    )
                                  : undefined
                              }
                              onSelect={
                                canEditDraft
                                  ? (newName, newId) =>
                                      draft.swapPanelMember(
                                        scheduleIndex,
                                        memberIndex,
                                        newName,
                                        newId,
                                      )
                                  : undefined
                              }
                              title={
                                canEditDraft
                                  ? `Bytt intervjuer${
                                      statusLabel
                                        ? ` — ${statusLabel.toLowerCase()}`
                                        : ""
                                    }`
                                  : (statusLabel ?? undefined)
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
            )}
          </SchedulePanelBody>
          <SchedulingActionBar
            className="sticky bottom-0 z-10 bg-surface-base"
            status={
              <span
                className={cn(
                  "font-semibold",
                  persistence.state === "error" || persistence.hasConflict
                    ? "text-danger"
                    : persistence.isSaving || hasLocalDraft
                      ? "text-text-muted"
                      : "text-text-faded",
                )}
              >
                {saveStatusLabel}
              </span>
            }
            actions={
              workflowState.kind === "save_conflict" ? (
                <SchedulingButton
                  onClick={() => window.location.reload()}
                  data-cy="proposal-primary-action"
                  variant="primary"
                >
                  Last inn siste versjon
                </SchedulingButton>
              ) : workflowState.kind === "save_error" ? (
                <SchedulingButton
                  onClick={persistence.retry}
                  data-cy="proposal-primary-action"
                  variant="primary"
                >
                  Prøv igjen
                </SchedulingButton>
              ) : isEditing ? (
                <SchedulingButton
                  onClick={() => changeWorkspaceMode("preview")}
                  data-cy="proposal-primary-action"
                  variant="primary"
                >
                  <Check size={iconSizes.small} aria-hidden="true" />
                  Gå til forhåndsvisning
                </SchedulingButton>
              ) : workflowState.kind ===
                "saving" ? null : workflowState.kind === "solver_error" ? (
                <button
                  type="button"
                  onClick={onRetrySolve}
                  data-cy="proposal-primary-action"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  Prøv igjen
                </button>
              ) : workflowState.kind === "placements_missing" ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  data-cy="proposal-rerun-unplaceable"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  Juster og generer på nytt
                  <ArrowRight size={iconSizes.small} aria-hidden="true" />
                </button>
              ) : workflowState.kind === "candidate_check_pending" ? (
                <button
                  type="button"
                  onClick={onOpenConflictReview}
                  data-cy="proposal-primary-action"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  Kontroller kandidater
                  <ArrowRight size={iconSizes.small} aria-hidden="true" />
                </button>
              ) : workflowState.kind === "repair_required" ? (
                <button
                  type="button"
                  onClick={onOpenRepair}
                  data-cy="proposal-primary-action"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  Finn løsning
                  <ArrowRight size={iconSizes.small} aria-hidden="true" />
                </button>
              ) : workflowState.kind === "ready_to_publish" ? (
                <button
                  type="button"
                  onClick={onOpenPlan}
                  data-cy="proposal-primary-action"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                >
                  Gå til publisering
                  <ArrowRight size={iconSizes.small} aria-hidden="true" />
                </button>
              ) : null
            }
          />
        </SchedulePanel>
      )}
    </>
  );
};

export default SolverResults;
