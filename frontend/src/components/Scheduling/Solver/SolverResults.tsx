import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  GripVertical,
  List,
  Lock,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Unlock,
  Wrench,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

import cn from "../../../utils/cn";
import GridCalendarView from "../Calendar/GridCalendarView";
import {
  CustomSelect,
  SegmentedControl,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelHeader,
  SchedulingActionBar,
  SchedulingButton,
  type SchedulingWorkspaceMode,
  actionButtonBase,
  actionButtonDanger,
  actionButtonNeutral,
  keyboardFocusRingClass,
} from "../ui";
import type { SavedSchedule } from "../types";
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
import DeviationNextStepMenu, {
  type DeviationNextStepAction,
} from "./DeviationNextStepMenu";
import PanelMemberChips from "./PanelMemberChips";
import PlanHealthSummary, {
  type PlanHealthException,
} from "./PlanHealthSummary";

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
  focusRequestKey?: number;
  assignmentConflicts: AssignmentConflictSummary;
  panelSize: number;
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
  onWidenDays: () => void;
  /** One-click incremental extend: solve the next framework day with the
   *  saved plan locked. Undefined when every plannable day is in scope. */
  onExtendDay?: () => void;
  onOpenConflictReview: () => void;
  onOpenRepair: () => void;
  onRetrySolve: () => void;
  onDiscardSuggestion: () => void;
  onOpenPlan: () => void;
  onPreviewWithAvailabilityDeviation: () => void;
  previewLoading: boolean;
  backgroundMode?: boolean;
  /** Rows the user just hand-edited, once their debounced save completed:
   *  the plan scrolls back to them and highlights them briefly. */
  savedTouchSignal?: { key: number; scheduleIndexes: number[] } | null;
}

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
  focusRequestKey = 0,
  assignmentConflicts,
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
  onWidenDays,
  onExtendDay,
  onOpenConflictReview,
  onOpenRepair,
  onRetrySolve,
  onDiscardSuggestion,
  onOpenPlan,
  onPreviewWithAvailabilityDeviation,
  previewLoading,
  backgroundMode = false,
  savedTouchSignal = null,
}: SolverResultsProps) => {
  const [viewType, setViewType] = useState<"list" | "calendar">("list");
  const [workspaceMode, setWorkspaceMode] =
    useState<SchedulingWorkspaceMode>("preview");
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
  const [moveScope, setMoveScope] = useState<"interview" | "group">(
    "interview",
  );
  const draftHeadingRef = useRef<HTMLHeadingElement>(null);
  const { presentation } = draft;
  useEffect(() => {
    if (backgroundMode || focusRequestKey <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      draftHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [backgroundMode, focusRequestKey]);
  const isEditing = workspaceMode === "editing";
  const canEditDraft =
    !backgroundMode && isEditing && !savedSchedule?.is_distributed;
  const occupiedTimes = useMemo(
    () => new Set(presentation.sortedSchedule.map((item) => item.time)),
    [presentation.sortedSchedule],
  );
  // Times hosting more than one candidate are joint interviews (one shared
  // panel meeting two candidates).
  const jointTimes = useMemo(() => {
    const counts = new Map<number, number>();
    presentation.sortedSchedule.forEach((item) => {
      counts.set(item.time, (counts.get(item.time) ?? 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([time]) => time),
    );
  }, [presentation.sortedSchedule]);
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
        `${dateLabel}, Blokk ${formatMinutes(startMinute)}–${formatMinutes(
          endMinute,
        )}, ${entries.length} intervju${entries.length === 1 ? "" : "er"}`,
      );
    });

    return summary;
  }, [canonicalBlocks, dates, presentation.sortedEntries, sessionDuration]);
  const groupIndexesByScheduleIndex = useMemo(() => {
    const groups = new Map<number, number[]>();
    canonicalBlocks
      .filter((block) => block.length > 0)
      .forEach((block) => {
        const indexes = presentation.sortedEntries
          .filter(({ item }) => block.includes(item.time))
          .map(({ scheduleIndex }) => scheduleIndex);
        indexes.forEach((index) => groups.set(index, indexes));
      });
    return groups;
  }, [canonicalBlocks, presentation.sortedEntries]);

  useEffect(() => {
    setSelectedInterviewer("");
    setSelectedListScheduleIndex(null);
    setDraggedListScheduleIndex(null);
    setListDropTargetIndex(null);
    // The plan opens in read-only overview; editing is an explicit choice
    // ("Rediger"), so opening the draft never invites accidental changes.
    // startEditing baselines the edit session when the user opts in.
    setWorkspaceMode("preview");
    draft.finishEditSession();
  }, [
    backgroundMode,
    draft.finishEditSession,
    savedSchedule?.is_distributed,
    solveTick,
  ]);

  // Keep the enter-editing trigger in a ref: beginEditSession's identity
  // changes with every draft edit, and if the effect re-ran on it, each
  // edit would re-baseline the session and disarm "Angre redigeringen".
  const beginEditSessionRef = useRef(draft.beginEditSession);
  useEffect(() => {
    beginEditSessionRef.current = draft.beginEditSession;
  });
  useEffect(() => {
    if (
      !backgroundMode &&
      editRequestKey > 0 &&
      !savedSchedule?.is_distributed
    ) {
      beginEditSessionRef.current();
      setWorkspaceMode("editing");
    }
  }, [backgroundMode, editRequestKey, savedSchedule?.is_distributed]);

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
      if (moveScope === "group") {
        draft.moveItems(
          groupIndexesByScheduleIndex.get(selectedListScheduleIndex) ?? [
            selectedListScheduleIndex,
          ],
          presentation.sortedEntries[scheduleIndex]?.item.time ??
            presentation.sortedEntries[selectedListScheduleIndex]?.item.time ??
            0,
        );
      } else {
        draft.swapTimes(selectedListScheduleIndex, scheduleIndex);
      }
    }
    setSelectedListScheduleIndex(null);
  };
  // Names what a click or drag will actually move, so "Flytt gruppe" vs
  // "Flytt intervju" is a visible fact rather than a guess.
  const moveScopeHint = (() => {
    if (!canEditDraft || viewType !== "list") return "";
    const selectedEntry =
      selectedListScheduleIndex !== null
        ? presentation.sortedEntries[selectedListScheduleIndex]
        : undefined;
    if (moveScope === "group") {
      if (selectedListScheduleIndex === null || !selectedEntry) {
        return "Flytt gruppe: velg et intervju — hele blokken det tilhører flyttes sammen.";
      }
      const groupTimes = (
        groupIndexesByScheduleIndex.get(selectedListScheduleIndex) ?? []
      )
        .map((index) => presentation.sortedEntries[index]?.item.time)
        .filter((time) => Number.isFinite(time));
      if (groupTimes.length <= 1) {
        return `Flytt gruppe: ${selectedEntry.item.candidate} ligger alene i blokken og flyttes individuelt.`;
      }
      return `Flytt gruppe: ${groupTimes.length} intervjuer (${formatSlotTime(
        Math.min(...groupTimes),
      )}–${formatSlotTime(
        Math.max(...groupTimes) + sessionDuration,
      )}) flyttes sammen, inkludert ${selectedEntry.item.candidate}.`;
    }
    if (!selectedEntry) {
      return "Flytt intervju: velg to intervjuer for å bytte tidspunkt.";
    }
    return `Bytter ${selectedEntry.item.candidate} (${formatSlotTime(
      selectedEntry.item.time,
    )}) med intervjuet du velger neste.`;
  })();
  const unplaceableCount = presentation.unplaceableCandidates.length;
  const overviewStats = presentation.overviewStats;
  const totalCandidateCount =
    presentation.sortedSchedule.length + unplaceableCount;
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
  const firstAvailabilityIssueScheduleIndex = useMemo(() => {
    const entry = presentation.sortedEntries.find(({ item }) =>
      item.panel.some(
        (member) =>
          presentation.availabilityStatusFor(item, member) ===
          "outside_submitted_availability",
      ),
    );
    return entry?.scheduleIndex;
  }, [presentation]);
  const firstConflictScheduleIndex = useMemo(
    () => [...assignmentConflicts.affectedScheduleIndexes][0],
    [assignmentConflicts.affectedScheduleIndexes],
  );
  const healthExceptions: PlanHealthException[] = [
    ...(unplaceableCount > 0 && workflowState.kind !== "placements_missing"
      ? [
          {
            key: "unplaced",
            label: `${unplaceableCount} gjenstår`,
            kind: "unplaced" as const,
          },
        ]
      : []),
    ...(presentation.availabilitySummary.outsideAvailabilityAssignments > 0
      ? [
          {
            key: "availability",
            label: `${presentation.availabilitySummary.outsideAvailabilityAssignments} utenfor tilgjengelighet`,
            kind: "availability" as const,
            ...(firstAvailabilityIssueScheduleIndex !== undefined
              ? { scheduleIndex: firstAvailabilityIssueScheduleIndex }
              : {}),
          },
        ]
      : []),
    ...(assignmentConflicts.assignmentCount > 0
      ? [
          {
            key: "conflicts",
            label: `${assignmentConflicts.assignmentCount} inhabilitet${assignmentConflicts.assignmentCount === 1 ? "" : "er"}`,
            kind: "conflict" as const,
            ...(firstConflictScheduleIndex !== undefined
              ? { scheduleIndex: firstConflictScheduleIndex }
              : {}),
          },
        ]
      : []),
    ...(presentation.blockRestSummary.exceptionCount > 0
      ? [
          {
            key: "rest",
            label: `${presentation.blockRestSummary.exceptionCount} hvileavvik`,
            kind: "rest" as const,
          },
        ]
      : []),
  ];
  const highlightedRowTimeoutRef = useRef<number | null>(null);
  const [highlightedScheduleIndexes, setHighlightedScheduleIndexes] = useState<
    Set<number>
  >(() => new Set());
  const clearRowHighlightTimeout = () => {
    if (highlightedRowTimeoutRef.current !== null) {
      window.clearTimeout(highlightedRowTimeoutRef.current);
      highlightedRowTimeoutRef.current = null;
    }
  };
  useEffect(() => clearRowHighlightTimeout, []);
  // Scroll to the rows and mark them briefly, used both for "your edit was
  // saved" and for deviation chips that point at a specific row. Calendar
  // cards have no stable row anchors, so the scroll only applies to the
  // list view; the highlight timeout still runs there.
  const focusScheduleRows = (scheduleIndexes: number[]) => {
    if (scheduleIndexes.length === 0) return;
    clearRowHighlightTimeout();
    setHighlightedScheduleIndexes(new Set(scheduleIndexes));
    highlightedRowTimeoutRef.current = window.setTimeout(() => {
      setHighlightedScheduleIndexes(new Set());
      highlightedRowTimeoutRef.current = null;
    }, 2000);
    if (viewType !== "list") return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(`schedule-row-${scheduleIndexes[0]}`)
        ?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "nearest",
        });
    });
  };
  const handledTouchKeyRef = useRef(0);
  useEffect(() => {
    if (backgroundMode || !savedTouchSignal) return;
    if (savedTouchSignal.key === handledTouchKeyRef.current) return;
    handledTouchKeyRef.current = savedTouchSignal.key;
    focusScheduleRows(savedTouchSignal.scheduleIndexes);
    // focusScheduleRows closes over viewType only for the scroll target;
    // re-running it on a view switch would replay the highlight, so it is
    // deliberately not a dep.
  }, [backgroundMode, savedTouchSignal, viewType]);
  const startEditing = () => {
    if (workspaceMode === "editing") return;
    if (!draft.canRestoreEditSession) draft.beginEditSession();
    setWorkspaceMode("editing");
  };
  const focusDraftHeading = () => {
    window.requestAnimationFrame(() => {
      draftHeadingRef.current?.focus({ preventScroll: true });
    });
  };
  const changeWorkspaceMode = (nextMode: SchedulingWorkspaceMode) => {
    if (nextMode === "editing") {
      startEditing();
      return;
    }
    setWorkspaceMode("preview");
  };
  const editAndFocusRows = (scheduleIndexes: number[]) => {
    startEditing();
    focusDraftHeading();
    focusScheduleRows(scheduleIndexes);
  };
  const jumpToHealthException = (exception: PlanHealthException) => {
    // An unplaced candidate has no row to jump to - the fix is scope (more
    // enabled days), which lives in the framework section.
    if (exception.kind === "unplaced") {
      onWidenDays();
      return;
    }
    editAndFocusRows(
      exception.scheduleIndex !== undefined ? [exception.scheduleIndex] : [],
    );
  };
  const nextStepActions: DeviationNextStepAction[] = (() => {
    switch (workflowState.kind) {
      case "solver_error":
        return [
          {
            key: "retry-solve",
            label: "Prøv igjen",
            onClick: onRetrySolve,
            variant: "primary",
            dataCy: "proposal-primary-action",
          },
        ];
      case "placements_missing":
        return [
          {
            key: "hand-edit",
            label: "Rediger for hånd",
            onClick: () => {
              startEditing();
              focusDraftHeading();
            },
            dataCy: "proposal-hand-edit",
          },
          {
            key: "settings",
            label: "Juster oppsett",
            onClick: onOpenSettings,
            dataCy: "proposal-rerun-unplaceable",
          },
          onExtendDay
            ? {
                key: "extend-day",
                label: "Planlegg neste dag",
                onClick: onExtendDay,
                variant: "primary",
                dataCy: "proposal-widen-days",
                icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
              }
            : {
                key: "widen-days",
                label: "Utvid med flere dager",
                onClick: onWidenDays,
                variant: "primary",
                dataCy: "proposal-widen-days",
                icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
              },
        ];
      case "candidate_check_pending":
        return [
          {
            key: "review",
            label: "Kontroller kandidater",
            onClick: onOpenConflictReview,
            variant: "primary",
            dataCy: "proposal-primary-action",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
        ];
      case "repair_required":
        return [
          {
            key: "edit-conflicts",
            label: "Rediger berørte rader",
            onClick: () =>
              editAndFocusRows(
                firstConflictScheduleIndex !== undefined
                  ? [firstConflictScheduleIndex]
                  : [],
              ),
            dataCy: "proposal-edit-conflicts",
          },
          {
            key: "settings",
            label: "Juster oppsett",
            onClick: onOpenSettings,
          },
          {
            key: "repair",
            label: "Lag reparasjonsforslag",
            onClick: onOpenRepair,
            variant: "primary",
            dataCy: "proposal-primary-action",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
        ];
      case "ready_to_publish":
        return [
          {
            key: "publish",
            label: "Gå til publisering",
            onClick: onOpenPlan,
            variant: "primary",
            dataCy: "proposal-primary-action",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
        ];
      default:
        return [];
    }
  })();
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
    <div data-cy="schedule-stage" data-stage={workflowState.kind}>
      {hasSchedule(result?.status) && planRevealed && (
        <>
          <SchedulePanel
            dataCy="proposal-review"
            stage={workflowState.kind}
            className="animate-fade-in motion-reduce:animate-none"
          >
            <SchedulePanelHeader
              headingRef={draftHeadingRef}
              title="Planutkast"
              titleClassName="text-2xl font-bold"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {!backgroundMode && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      data-cy="proposal-rerun"
                      className={cn(actionButtonBase, actionButtonDanger)}
                    >
                      Generer nytt forslag
                    </button>
                  )}
                </div>
              }
            />
            <SchedulePanelBody>
              {!backgroundMode && (
                <section
                  data-cy="plan-draft-next-action"
                  role={workflowState.tone === "danger" ? "alert" : "status"}
                  className={cn(
                    "mb-4 border-b border-border-soft pb-4",
                    workflowState.tone === "danger"
                      ? "text-danger"
                      : workflowState.tone === "warning"
                        ? "text-amber-900"
                        : workflowState.tone === "success"
                          ? "text-success"
                          : "text-text-primary",
                  )}
                >
                  <h3 className="m-0 text-base font-bold">
                    {workflowState.title}
                  </h3>
                  <p className="m-0 mt-1 text-ui text-text-muted">
                    {workflowState.description}
                  </p>
                </section>
              )}
              {overviewStats && (
                <PlanHealthSummary
                  overviewStats={overviewStats}
                  totalCandidateCount={totalCandidateCount}
                  healthExceptions={healthExceptions}
                  onJumpToException={jumpToHealthException}
                  unplaceableCount={unplaceableCount}
                  previewLoading={previewLoading}
                  onPreviewWithAvailabilityDeviation={
                    onPreviewWithAvailabilityDeviation
                  }
                />
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
                  {(savedSchedule?.schedule?.length ?? 0) > 0 && (
                    <SchedulingButton
                      onClick={onDiscardSuggestion}
                      variant="quiet"
                    >
                      Forkast forslag
                    </SchedulingButton>
                  )}
                </div>
              )}
              {!backgroundMode && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="m-0 text-base font-bold text-text-primary">
                    Plan
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEditDraft && (
                      <SegmentedControl<"interview" | "group">
                        value={moveScope}
                        onChange={setMoveScope}
                        items={[
                          { key: "interview", label: "Flytt intervju" },
                          { key: "group", label: "Flytt gruppe" },
                        ]}
                        aria-label="Velg hva som skal flyttes"
                      />
                    )}
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          startEditing();
                          focusDraftHeading();
                        }}
                        className={cn(actionButtonBase, actionButtonNeutral)}
                      >
                        <Pencil size={iconSizes.small} aria-hidden="true" />
                        Rediger
                      </button>
                    )}
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
                  </div>
                </div>
              )}
              {moveScopeHint && (
                <p
                  data-cy="move-scope-hint"
                  aria-live="polite"
                  className="m-0 mb-4 text-detail text-text-muted"
                >
                  {moveScopeHint}
                </p>
              )}
              {viewType === "list" ? (
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
                                  id={`schedule-row-${scheduleIndex}`}
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
                                    if (moveScope === "group") {
                                      draft.moveItems(
                                        groupIndexesByScheduleIndex.get(
                                          sourceIndex,
                                        ) ?? [sourceIndex],
                                        item.time,
                                      );
                                    } else {
                                      draft.swapTimes(
                                        sourceIndex,
                                        scheduleIndex,
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft",
                                    listDropTargetIndex === scheduleIndex &&
                                      "[&>td]:bg-surface-subtle [&>td]:ring-2 [&>td]:ring-inset [&>td]:ring-brand-ring",
                                    draggedListScheduleIndex ===
                                      scheduleIndex && "opacity-50",
                                    highlightedScheduleIndexes.has(
                                      scheduleIndex,
                                    ) &&
                                      "[&>td]:bg-brand-soft [&>td]:ring-2 [&>td]:ring-inset [&>td]:ring-brand-ring",
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
                                          title={
                                            moveScope === "group"
                                              ? "Dra gruppen til en ledig rad"
                                              : "Dra til en annen rad, eller klikk to grep for å bytte tid"
                                          }
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
                                            moveScope === "group"
                                              ? draft.moveItems(
                                                  groupIndexesByScheduleIndex.get(
                                                    scheduleIndex,
                                                  ) ?? [scheduleIndex],
                                                  Number(nextTime),
                                                )
                                              : draft.changeTime(
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
                                    <div className="flex flex-wrap items-center gap-2">
                                      {presentation.displayCandidate(item)}
                                      {jointTimes.has(item.time) && (
                                        <span className="rounded bg-brand-soft px-1.5 py-0.5 text-label font-semibold text-brand">
                                          Fellesintervju
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <div className="flex flex-wrap gap-1.5">
                                      <PanelMemberChips
                                        item={item}
                                        scheduleIndex={scheduleIndex}
                                        canEditDraft={canEditDraft}
                                        interviewerOptions={
                                          presentation.interviewerOptions
                                        }
                                        availabilityStatusFor={
                                          presentation.availabilityStatusFor
                                        }
                                        assignmentConflicts={
                                          assignmentConflicts
                                        }
                                        onSwapPanelMember={
                                          draft.swapPanelMember
                                        }
                                      />
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
                          if (moveScope === "group") {
                            draft.moveItems(
                              groupIndexesByScheduleIndex.get(
                                entry.scheduleIndex,
                              ) ?? [entry.scheduleIndex],
                              nextTime,
                            );
                          } else {
                            draft.changeTime(
                              entry.scheduleIndex,
                              String(nextTime),
                            );
                          }
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
                            {jointTimes.has(item.time) && (
                              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-label font-semibold text-brand">
                                Felles
                              </span>
                            )}
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
                          <PanelMemberChips
                            item={item}
                            scheduleIndex={scheduleIndex}
                            canEditDraft={canEditDraft}
                            interviewerOptions={presentation.interviewerOptions}
                            availabilityStatusFor={
                              presentation.availabilityStatusFor
                            }
                            assignmentConflicts={assignmentConflicts}
                            onSwapPanelMember={draft.swapPanelMember}
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              )}
            </SchedulePanelBody>
            {!backgroundMode && (
              <section className="border-t border-border-soft bg-surface-subtle px-6">
                {currentReviewRequired && (
                  <div className="border-b border-border-soft py-5">
                    <h3 className="m-0 text-base font-bold text-text-primary">
                      Inhabilitetssjekk
                    </h3>
                    <p className="m-0 mt-1 text-detail text-text-muted">
                      Sjekk inhabilitet før planen går videre til publisering.
                    </p>
                    <button
                      type="button"
                      onClick={onOpenConflictReview}
                      data-cy="reopen-candidate-review"
                      className={cn(
                        actionButtonBase,
                        actionButtonNeutral,
                        "mt-4",
                      )}
                    >
                      Sjekk inhabilitet
                      <ArrowRight size={iconSizes.small} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </section>
            )}
            {!backgroundMode && (
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
                  ) : workflowState.kind === "saving" ? null : (
                    <div className="flex flex-wrap items-center gap-2">
                      {nextStepActions.length > 0 && (
                        <DeviationNextStepMenu actions={nextStepActions} />
                      )}
                      {isEditing && (
                        <SchedulingButton
                          onClick={() => changeWorkspaceMode("preview")}
                          data-cy="proposal-primary-action"
                          variant="primary"
                        >
                          <Check size={iconSizes.small} aria-hidden="true" />
                          Vis uten redigering
                        </SchedulingButton>
                      )}
                    </div>
                  )
                }
              />
            )}
          </SchedulePanel>
          {!backgroundMode && (
            <section className="mt-4 rounded-panel border border-border bg-surface-base shadow-sm">
              <details className="group">
                <summary
                  className={cn(
                    "flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 text-base font-bold text-text-primary [&::-webkit-details-marker]:hidden",
                    keyboardFocusRingClass,
                  )}
                >
                  Belastning
                  <ChevronDown
                    size={iconSizes.small}
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="border-t border-border-soft px-6 pb-5 pt-4">
                  <p className="m-0 text-detail text-text-muted">
                    Se arbeidsfordelingen og klikk på en intervjuer for å
                    undersøke eller endre panelet.
                  </p>
                  <div className="mt-4">
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
                  </div>
                </div>
              </details>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default SolverResults;
