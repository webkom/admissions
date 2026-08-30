import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ChevronDown,
  Grid3x3,
  Layers,
  LayoutPanelTop,
  Loader2,
  LockKeyhole,
  RotateCcw,
  User,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

import cn from "../../../utils/cn";
import {
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
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "../ui";
import ConfirmDialog from "../ConfirmDialog";
import type {
  Candidate,
  Interviewer,
  SchedulePanelMember,
  SavedSchedule,
} from "../types";
import { decodeScheduleTime, formatSlotLabel } from "../scheduleUtils";
import {
  createAssignmentAvailabilityResolver,
  worstAvailabilityStatus,
} from "../assignmentAvailability";
import { toPanelSwapOption } from "../panelSwapEligibility";
import InterviewerLoadView from "./InterviewerLoadView";
import BlockTable from "./BlockTable";
import DayTabs from "./DayTabs";
import InterviewerMatrixView from "./InterviewerMatrixView";
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
import PlanHealthSummary, {
  type PlanHealthException,
} from "./PlanHealthSummary";
import PlanHealthModal, { type PlanHealthModalEntry } from "./PlanHealthModal";
import {
  collectAvailabilityExceptions,
  collectConflictExceptions,
  findRestViolations,
  suggestPanelSubstitution,
} from "./planHealthFixes";

interface SolverResultsProps {
  result: SolveResponse | null;
  planRevealed: boolean;
  solveTick: number;
  savedSchedule?: SavedSchedule;
  draft: ScheduleDraftController;
  persistence: ScheduleDraftPersistence;
  hasLocalDraft: boolean;
  candidates: Candidate[];
  interviewers: Interviewer[];
  currentUserName?: string;
  dates: string[];
  sessionDuration: number;
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
  /** The status of the last failed solve, kept separate from `result`
   *  because `result` may have been restored to the previous good plan.
   *  Lets the next-step menu distinguish a true timeout (no incumbent found)
   *  from a validation rejection. */
  failedResult?: { status: string; timeout_reason?: string } | null;
  onOpenSettings: () => void;
  /** One-click incremental extend: solve the next framework day with the
   *  saved plan locked. Undefined when every plannable day is in scope. */
  onExtendDay?: () => void;
  /** Extend the scope to every remaining enabled day in one go, instead
   *  of one day at a time. The published prefix stays locked; the
   *  solver fills the still-draft tail in a single pass. */
  onFillRemainingDays?: () => void;
  onOpenConflictReview: () => void;
  onOpenRepair: () => void;
  onRetrySolve: () => void;
  onDiscardSuggestion: () => void;
  /** Throw away the unpublished part of the plan and start over. Resolves
   *  false when the write failed, so the dialog can stay open. Undefined
   *  where deleting makes no sense (simulated plans, member view). */
  onClearDraft?: () => Promise<boolean>;
  /** Interviews `onClearDraft` would remove. Zero hides the action. */
  clearableDraftCount?: number;
  /** Interviews that would survive because they are already published. */
  publishedDraftCount?: number;
  onOpenPlan: () => void;
  onPreviewWithAvailabilityDeviation: () => void;
  previewLoading: boolean;
  backgroundMode?: boolean;
  /** Rows the user just hand-edited, once their debounced save completed:
   *  the plan scrolls back to them and highlights them briefly. */
  savedTouchSignal?: { key: number; scheduleIndexes: number[] } | null;
  /** Open the slot picker for an unplaced candidate. Called from the
   *  persistent unplaced tray that stays visible in both preview and
   *  editing modes. */
  onPickUnplacedSlot?: (candidate: {
    candidate_id?: string;
    candidate: string;
    reason?: string;
  }) => void;
}

const SolverResults = ({
  result,
  planRevealed,
  solveTick,
  savedSchedule,
  draft,
  persistence,
  hasLocalDraft,
  candidates,
  interviewers,
  currentUserName,
  dates,
  sessionDuration,
  editRequestKey,
  focusRequestKey = 0,
  assignmentConflicts,
  panelSize,
  canonicalBlocks,
  currentReviewRequired,
  currentReviewComplete,
  completeReviewerCount,
  requiredReviewerCount,
  pendingReviewerCount,
  missingReviewerNames,
  publicationReady,
  solverError,
  failedResult,
  onOpenSettings,
  onExtendDay,
  onFillRemainingDays,
  onOpenConflictReview,
  onOpenRepair,
  onRetrySolve,
  onDiscardSuggestion,
  onClearDraft,
  clearableDraftCount = 0,
  publishedDraftCount = 0,
  onOpenPlan,
  onPreviewWithAvailabilityDeviation,
  previewLoading,
  backgroundMode = false,
  savedTouchSignal = null,
  onPickUnplacedSlot,
}: SolverResultsProps) => {
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
  const [listDropTargetTime, setListDropTargetTime] = useState<number | null>(
    null,
  );
  const [moveScope, setMoveScope] = useState<"interview" | "group">(
    "interview",
  );
  const [viewType, setViewType] = useState<"kort" | "matrise">("kort");
  const [clearDraftOpen, setClearDraftOpen] = useState(false);
  const [clearingDraft, setClearingDraft] = useState(false);
  const draftHeadingRef = useRef<HTMLHeadingElement>(null);
  const { presentation } = draft;
  useEffect(() => {
    if (backgroundMode || focusRequestKey <= 0) return;
    const frame = window.requestAnimationFrame(() => {
      draftHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [backgroundMode, focusRequestKey]);
  const canEditDraft = !backgroundMode && !savedSchedule?.is_distributed;
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

  const resolveAvailabilityAtTime = useMemo(
    () => createAssignmentAvailabilityResolver(interviewers),
    [interviewers],
  );

  // Options for one panel seat, greyed out (with a reason) when the interviewer
  // may not take it: already seated, inhabil against a candidate in the block,
  // or outside their submitted availability. `slotTimes` is the one slot for a
  // per-slot override, or every occupied slot in the block for a block swap.
  const buildPanelSwapOptions = useCallback(
    (
      currentMember: SchedulePanelMember,
      seatedPanel: SchedulePanelMember[],
      candidateIds: string[],
      slotTimes: number[],
    ) => {
      const blockCandidateIds = new Set(candidateIds);
      return presentation.interviewerOptions.map((interviewer) =>
        toPanelSwapOption(interviewer, {
          replacing: currentMember,
          seatedPanel,
          blockCandidateIds,
          availabilityStatusFor: (candidate) =>
            worstAvailabilityStatus(
              slotTimes.map((time) =>
                resolveAvailabilityAtTime(
                  { id: candidate.id, name: candidate.name },
                  time,
                ),
              ),
            ),
        }),
      );
    },
    [presentation.interviewerOptions, resolveAvailabilityAtTime],
  );

  const getBlockInterviewerOptions = useCallback(
    (
      currentMember: SchedulePanelMember,
      blockPanel: SchedulePanelMember[],
      candidateIds: string[],
      blockSlotTimes: number[],
    ) =>
      buildPanelSwapOptions(
        currentMember,
        blockPanel,
        candidateIds,
        blockSlotTimes,
      ),
    [buildPanelSwapOptions],
  );

  const getSlotInterviewerOptions = useCallback(
    (
      currentMember: SchedulePanelMember,
      slotPanel: SchedulePanelMember[],
      slotTime: number,
      blockCandidateIds: string[],
    ) =>
      buildPanelSwapOptions(currentMember, slotPanel, blockCandidateIds, [
        slotTime,
      ]),
    [buildPanelSwapOptions],
  );
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

  const [selectedDayFilter, setSelectedDayFilter] = useState<number | null>(
    null,
  );
  const [
    selectedSwapGroupFirstScheduleIndex,
    setSelectedSwapGroupFirstScheduleIndex,
  ] = useState<number | null>(null);

  const countsByDay = useMemo(() => {
    const counts = new Array<number>(dates.length).fill(0);
    presentation.sortedEntries.forEach((entry) => {
      const { dayIndex } = decodeScheduleTime(entry.item.time, sessionDuration);
      if (dayIndex >= 0 && dayIndex < counts.length) {
        counts[dayIndex] += 1;
      }
    });
    return counts;
  }, [dates.length, presentation.sortedEntries, sessionDuration]);

  // Selecting a cell in the matrix focuses the corresponding row in the
  // (hidden) Kort view via the existing highlight-and-scroll helper, and
  // primes the list-move state so the same row is pre-selected for any
  // subsequent drag/swap action.
  const handleMatrixSelectSlot = (scheduleIndex: number) => {
    setSelectedListScheduleIndex(scheduleIndex);
    focusScheduleRows([scheduleIndex]);
  };

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
    setListDropTargetTime(null);
  };

  const selectOrSwapListInterview = (scheduleIndex: number) => {
    if (moveScope === "group") {
      const thisGroup = groupIndexesByScheduleIndex.get(scheduleIndex) ?? [
        scheduleIndex,
      ];
      const thisGroupFirstIndex = thisGroup[0];
      if (selectedSwapGroupFirstScheduleIndex === null) {
        setSelectedSwapGroupFirstScheduleIndex(thisGroupFirstIndex);
        return;
      }
      if (selectedSwapGroupFirstScheduleIndex !== thisGroupFirstIndex) {
        const sourceGroup = groupIndexesByScheduleIndex.get(
          selectedSwapGroupFirstScheduleIndex,
        ) ?? [selectedSwapGroupFirstScheduleIndex];
        draft.swapGroups(sourceGroup, thisGroup);
      }
      setSelectedSwapGroupFirstScheduleIndex(null);
      return;
    }

    if (selectedListScheduleIndex === null) {
      setSelectedListScheduleIndex(scheduleIndex);
      return;
    }
    if (selectedListScheduleIndex !== scheduleIndex) {
      draft.swapTimes(selectedListScheduleIndex, scheduleIndex);
    }
    setSelectedListScheduleIndex(null);
  };

  const handleRowDragStart = (
    scheduleIndex: number,
    event: React.DragEvent<HTMLButtonElement>,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(scheduleIndex));
    setDraggedListScheduleIndex(scheduleIndex);
    setSelectedListScheduleIndex(null);
  };

  const handleRowDragOver = (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
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
  };

  const handleRowDragLeave = (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (listDropTargetIndex === scheduleIndex) {
      setListDropTargetIndex(null);
    }
  };

  const handleRowDrop = (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
    if (!canEditDraft) return;
    event.preventDefault();
    const parsedIndex = Number(event.dataTransfer.getData("text/plain"));
    const sourceIndex = Number.isInteger(parsedIndex)
      ? parsedIndex
      : draggedListScheduleIndex;
    clearListMove();
    if (sourceIndex === null || sourceIndex === scheduleIndex) return;
    if (moveScope === "group") {
      const sourceGroup = groupIndexesByScheduleIndex.get(sourceIndex) ?? [
        sourceIndex,
      ];
      const targetGroup = groupIndexesByScheduleIndex.get(scheduleIndex) ?? [
        scheduleIndex,
      ];
      if (sourceGroup !== targetGroup) {
        draft.swapGroups(sourceGroup, targetGroup);
      }
    } else {
      draft.swapTimes(sourceIndex, scheduleIndex);
    }
  };

  const handleEmptySlotDragOver = (
    time: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
    if (!canEditDraft || draggedListScheduleIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setListDropTargetTime(time);
  };

  const handleEmptySlotDragLeave = (
    time: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    if (listDropTargetTime === time) setListDropTargetTime(null);
  };

  const handleEmptySlotDrop = (
    time: number,
    event: React.DragEvent<HTMLElement>,
  ) => {
    if (!canEditDraft) return;
    event.preventDefault();
    const parsedIndex = Number(event.dataTransfer.getData("text/plain"));
    const sourceIndex = Number.isInteger(parsedIndex)
      ? parsedIndex
      : draggedListScheduleIndex;
    clearListMove();
    if (sourceIndex === null) return;
    if (moveScope === "group") {
      draft.moveItems(
        groupIndexesByScheduleIndex.get(sourceIndex) ?? [sourceIndex],
        time,
      );
    } else {
      draft.changeTime(sourceIndex, String(time));
    }
  };

  const handleEmptySlotClick = (time: number) => {
    if (!canEditDraft || selectedListScheduleIndex === null) return;
    if (moveScope === "group") {
      draft.moveItems(
        groupIndexesByScheduleIndex.get(selectedListScheduleIndex) ?? [
          selectedListScheduleIndex,
        ],
        time,
      );
    } else {
      draft.changeTime(selectedListScheduleIndex, String(time));
    }
    setSelectedListScheduleIndex(null);
    setListDropTargetTime(null);
  };
  const handleUnassignCandidate = (scheduleIndex: number) => {
    if (!canEditDraft) return;
    // Row indexes shift when the schedule loses an entry, so any selection
    // pointing into the old positions has to go with it.
    setSelectedListScheduleIndex(null);
    setListDropTargetTime(null);
    draft.unassignCandidate(scheduleIndex);
  };

  const handleAssignUnplaced = (args: {
    candidateId?: string;
    candidateName: string;
    time: number;
  }) => {
    if (!canEditDraft) return;
    draft.assignUnplacedCandidate(args);
  };

  // Names what a click or drag will actually move, so "Flytt gruppe" vs
  // "Flytt intervju" is a visible fact rather than a guess.
  const moveScopeHint = (() => {
    if (!canEditDraft) return "";
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
  // The solve was deliberately limited to the first N framework days (the
  // day-scope stepper), so `onExtendDay` is wired. Candidates that fall on
  // the days still outside that scope are meant to be unplaced for now —
  // that is a delplan planned in stages, not a failure. In that state the
  // "venter på plassering" warning tray is replaced by a calm
  // publish-the-delplan action near the top.
  const isDayScoped = Boolean(onExtendDay);
  const showPartialDraftPublish =
    !backgroundMode && isDayScoped && unplaceableCount > 0;
  const saveStatusLabel = persistence.hasConflict
    ? "Lagring stoppet"
    : persistence.state === "error"
      ? "Kunne ikke lagre"
      : persistence.isSaving
        ? "Lagrer utkast…"
        : hasLocalDraft
          ? "Ulagrede endringer"
          : "Utkast lagret";
  const workflowState = derivePlanDraftWorkflowState({
    loading: previewLoading,
    filledDayCount: result?.filled_day_count,
    extendDayAvailable: Boolean(onExtendDay),
    saveState:
      persistence.hasConflict || persistence.state === "conflict"
        ? "conflict"
        : persistence.state === "error"
          ? "error"
          : persistence.isSaving
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
  const firstConflictScheduleIndex = useMemo(
    () => [...assignmentConflicts.affectedScheduleIndexes][0],
    [assignmentConflicts.affectedScheduleIndexes],
  );
  const healthExceptions: PlanHealthException[] = [
    ...(presentation.availabilitySummary.outsideAvailabilityAssignments > 0
      ? [
          {
            key: "availability",
            label: `${presentation.availabilitySummary.outsideAvailabilityAssignments} utenfor tilgjengelighet`,
            kind: "availability" as const,
          },
        ]
      : []),
    ...(assignmentConflicts.assignmentCount > 0
      ? [
          {
            key: "conflicts",
            label: `${assignmentConflicts.assignmentCount} inhabilitet${assignmentConflicts.assignmentCount === 1 ? "" : "er"}`,
            kind: "conflict" as const,
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
  // saved" and for deviation chips that point at a specific row. The
  // highlight timeout runs unconditionally; the scroll-to uses the
  // `schedule-row-${index}` anchors emitted by the block table.
  const focusScheduleRows = (scheduleIndexes: number[]) => {
    if (scheduleIndexes.length === 0) return;
    clearRowHighlightTimeout();
    setHighlightedScheduleIndexes(new Set(scheduleIndexes));
    highlightedRowTimeoutRef.current = window.setTimeout(() => {
      setHighlightedScheduleIndexes(new Set());
      highlightedRowTimeoutRef.current = null;
    }, 2000);
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
    // focusScheduleRows closes over no changing state besides savedTouchSignal,
    // so re-running on identity change would replay the highlight. The
    // effect is therefore keyed on the signal only.
  }, [backgroundMode, savedTouchSignal]);
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

  const editAndFocusRows = (scheduleIndexes: number[]) => {
    startEditing();
    focusDraftHeading();
    focusScheduleRows(scheduleIndexes);
  };
  // Health chips are calls to action: clicking one opens the matching
  // quick-fix surface instead of silently jumping somewhere in the plan.
  const [healthModalException, setHealthModalException] =
    useState<PlanHealthException | null>(null);
  const openHealthExceptionModal = (exception: PlanHealthException) => {
    setHealthModalException(exception);
  };
  const healthModalEntries = useMemo<PlanHealthModalEntry[]>(() => {
    if (!healthModalException) return [];
    const entries = presentation.sortedEntries;
    const substitutionParams = {
      entries,
      interviewers,
      candidates,
    };
    const panelIndexOf = (scheduleIndex: number, memberId?: string) => {
      const entry = entries.find(
        (candidate) => candidate.scheduleIndex === scheduleIndex,
      );
      if (!entry) return -1;
      return entry.item.panel.findIndex((member) =>
        memberId ? member.id === memberId : member.name === member.name,
      );
    };
    if (healthModalException.kind === "availability") {
      return collectAvailabilityExceptions(
        entries,
        (item, member) =>
          presentation.availabilityStatusFor(item, member) ===
          "outside_submitted_availability",
      ).map((exception) => {
        const entry = entries.find(
          (candidate) => candidate.scheduleIndex === exception.scheduleIndex,
        );
        return {
          key: `availability-${exception.scheduleIndex}`,
          scheduleIndex: exception.scheduleIndex,
          candidateName: exception.candidateName,
          time: exception.time,
          problem: `${exception.offenders
            .map((offender) => offender.name)
            .join(
              ", ",
            )} står utenfor tilgjengeligheten sin i dette intervjuet.`,
          offenderName: exception.offenders[0].name,
          offenderId: exception.offenders[0].id,
          offenderPanelIndex: panelIndexOf(
            exception.scheduleIndex,
            exception.offenders[0].id,
          ),
          suggestion:
            entry &&
            suggestPanelSubstitution({
              ...substitutionParams,
              item: entry.item,
            }),
        };
      });
    }
    if (healthModalException.kind === "conflict") {
      return collectConflictExceptions(entries, interviewers).map(
        (exception) => {
          const entry = entries.find(
            (candidate) => candidate.scheduleIndex === exception.scheduleIndex,
          );
          return {
            key: `conflict-${exception.scheduleIndex}`,
            scheduleIndex: exception.scheduleIndex,
            candidateName: exception.candidateName,
            time: exception.time,
            problem: `${exception.offenders
              .map((offender) => offender.name)
              .join(", ")} har meldt inhabilitet for denne kandidaten.`,
            offenderName: exception.offenders[0].name,
            offenderId: exception.offenders[0].id,
            offenderPanelIndex: panelIndexOf(
              exception.scheduleIndex,
              exception.offenders[0].id,
            ),
            suggestion:
              entry &&
              suggestPanelSubstitution({
                ...substitutionParams,
                item: entry.item,
              }),
          };
        },
      );
    }
    return findRestViolations(entries, canonicalBlocks).map((exception) => {
      const entry = entries.find(
        (candidate) => candidate.scheduleIndex === exception.scheduleIndex,
      );
      const avoidTimes = new Set(
        exception.blockIndexes.flatMap(
          (blockIndex) => canonicalBlocks[blockIndex] ?? [],
        ),
      );
      return {
        key: `rest-${exception.scheduleIndex}-${exception.offenders[0].name}`,
        scheduleIndex: exception.scheduleIndex,
        candidateName: exception.candidateName,
        time: exception.time,
        problem: `${exception.offenders[0].name} jobber i to naboblokker uten pause (${exception.blockStartTimes
          .map((start) => formatSlotTime(start))
          .join(" og ")}).`,
        offenderName: exception.offenders[0].name,
        offenderId: exception.offenders[0].id,
        offenderPanelIndex: panelIndexOf(
          exception.scheduleIndex,
          exception.offenders[0].id,
        ),
        suggestion:
          entry &&
          suggestPanelSubstitution({
            ...substitutionParams,
            item: entry.item,
            avoidTimes,
          }),
      };
    });
  }, [
    canonicalBlocks,
    candidates,
    healthModalException,
    formatSlotTime,
    interviewers,
    presentation.sortedEntries,
    presentation.availabilityStatusFor,
  ]);
  const applyHealthSubstitution = (entry: PlanHealthModalEntry) => {
    if (!entry.suggestion || entry.offenderPanelIndex < 0) return;
    draft.swapPanelMember(
      entry.scheduleIndex,
      entry.offenderPanelIndex,
      entry.suggestion.replacementName,
      entry.suggestion.replacementId,
    );
  };
  const editHealthRow = (scheduleIndex: number) => {
    setHealthModalException(null);
    editAndFocusRows([scheduleIndex]);
  };
  const nextStepActions: DeviationNextStepAction[] = (() => {
    switch (workflowState.kind) {
      case "solver_error": {
        // When the solver timed out finding *any* placement and the day-scope
        // stepper is available, suggest planning one day at a time first —
        // retrying the same full scope will likely time out again.
        const isNoIncumbentTimeout = failedResult?.status === "TIMEOUT";
        const actions: DeviationNextStepAction[] = [];
        if (isNoIncumbentTimeout && onExtendDay) {
          actions.push({
            key: "extend-day",
            label: "Planlegg én dag om gangen",
            onClick: onExtendDay,
            variant: "primary" as const,
            dataCy: "proposal-primary-action",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          });
          actions.push({
            key: "retry-solve",
            label: "Prøv igjen likevel",
            onClick: onRetrySolve,
            variant: "neutral" as const,
            dataCy: "proposal-retry-anyway",
          });
        } else {
          actions.push({
            key: "retry-solve",
            label: "Prøv igjen",
            onClick: onRetrySolve,
            variant: "primary" as const,
            dataCy: "proposal-primary-action",
          });
        }
        // A timeout or validation rejection often stems from a tight setup;
        // point at the settings surface so the user can widen it.
        actions.push({
          key: "settings",
          label: "Juster oppsett",
          onClick: onOpenSettings,
          variant: "neutral" as const,
        });
        return actions;
      }
      case "placements_missing":
        return [
          {
            key: "publish-delplan",
            label: `Publiser delplanen (${unplaceableCount} ${
              unplaceableCount === 1 ? "kandidat" : "kandidater"
            } senere)`,
            onClick: onOpenPlan,
            variant: "primary" as const,
            dataCy: "proposal-publish-delplan",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
          ...(onFillRemainingDays
            ? [
                {
                  key: "fill-remaining-days",
                  label: "Planlegg alle gjenstående dager",
                  onClick: onFillRemainingDays,
                  variant: "primary" as const,
                  dataCy: "proposal-fill-remaining-days",
                  icon: (
                    <ArrowRight size={iconSizes.small} aria-hidden="true" />
                  ),
                },
              ]
            : onExtendDay
              ? [
                  {
                    key: "extend-day",
                    label: "Planlegg neste dag",
                    onClick: onExtendDay,
                    variant: "neutral" as const,
                    dataCy: "proposal-extend-day",
                    icon: (
                      <ArrowRight size={iconSizes.small} aria-hidden="true" />
                    ),
                  },
                ]
              : []),
          {
            key: "place-manually",
            label: `Plasser de siste ${unplaceableCount} ${
              unplaceableCount === 1 ? "kandidaten" : "kandidatene"
            } manuelt`,
            onClick: () => {
              const first = presentation.unplaceableCandidates[0];
              if (onPickUnplacedSlot && first) {
                onPickUnplacedSlot(first);
                return;
              }
              startEditing();
              focusDraftHeading();
            },
            variant: "neutral" as const,
            dataCy: "proposal-place-manually",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
        ];
      case "candidate_check_pending":
        return [
          {
            key: "review",
            label: "Sjekk inhabilitet",
            onClick: onOpenConflictReview,
            variant: "primary",
            dataCy: "proposal-primary-action",
            icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
          },
        ];
      case "waiting_for_reviews":
        return currentReviewRequired
          ? [
              {
                key: "review",
                label: "Endre inhabilitetssvar",
                onClick: onOpenConflictReview,
                variant: "neutral",
                dataCy: "reopen-candidate-review",
                icon: <ArrowRight size={iconSizes.small} aria-hidden="true" />,
              },
            ]
          : [];
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
                      className={cn(actionButtonBase, actionButtonNeutral)}
                    >
                      Lag nytt forslag
                    </button>
                  )}
                  {!backgroundMode &&
                    onClearDraft &&
                    clearableDraftCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setClearDraftOpen(true)}
                        // An unsaved local edit would be racing the delete,
                        // and the delete rewrites the same rows - wait for
                        // the draft to settle first.
                        disabled={persistence.isSaving}
                        data-cy="clear-draft"
                        className={cn(actionButtonBase, actionButtonDanger)}
                      >
                        Slett utkast
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
              {showPartialDraftPublish && (
                <div
                  data-cy="partial-draft-publish"
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-soft bg-surface-subtle px-4 py-3"
                >
                  <p className="m-0 text-detail text-text-muted">
                    Delplan for de valgte dagene er klar.{" "}
                    <span className="font-semibold text-text-primary">
                      {unplaceableCount}{" "}
                      {unplaceableCount === 1 ? "kandidat" : "kandidater"}
                    </span>{" "}
                    planlegges når du tar med flere dager — de publiserte dagene
                    røres ikke.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenPlan}
                    data-cy="publish-partial-draft"
                    className={cn(actionButtonBase, actionButtonPrimary)}
                  >
                    Publiser delplan
                    <ArrowRight size={iconSizes.small} aria-hidden="true" />
                  </button>
                </div>
              )}
              {overviewStats && (
                <PlanHealthSummary
                  overviewStats={overviewStats}
                  totalCandidateCount={totalCandidateCount}
                  healthExceptions={healthExceptions}
                  onJumpToException={openHealthExceptionModal}
                  unplaceableCount={unplaceableCount}
                  plannedInStages={isDayScoped}
                  previewLoading={previewLoading}
                  onPreviewWithAvailabilityDeviation={
                    onPreviewWithAvailabilityDeviation
                  }
                />
              )}
              {unplaceableCount > 0 && !isDayScoped && onPickUnplacedSlot && (
                <section
                  data-cy="unplaced-tray"
                  role="status"
                  aria-label={`${unplaceableCount} kandidater venter på plassering`}
                  className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-ui"
                >
                  <p className="m-0 text-detail font-bold uppercase tracking-wide text-amber-900">
                    {unplaceableCount}{" "}
                    {unplaceableCount === 1
                      ? "kandidat venter"
                      : "kandidater venter"}{" "}
                    på plassering
                  </p>
                  <ul className="m-0 mt-2 grid gap-2 p-0">
                    {presentation.unplaceableCandidates.map((candidate) => (
                      <li
                        key={candidate.candidate_id ?? candidate.candidate}
                        className="flex flex-wrap items-center justify-between gap-2 list-none"
                      >
                        <span className="text-ui font-semibold text-text-primary">
                          {candidate.candidate}
                          {candidate.reason && (
                            <span className="ml-2 text-detail font-normal text-text-muted">
                              – {candidate.reason}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => onPickUnplacedSlot(candidate)}
                          data-cy="unplaced-tray-place"
                          className={cn(
                            actionButtonBase,
                            actionButtonNeutral,
                            "border-amber-400 bg-surface-base text-amber-900 hover:bg-amber-100",
                          )}
                        >
                          Plasser i ledig luke
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {canEditDraft && hasLocalDraft && (
                <div
                  data-cy="manual-schedule-editing"
                  role="status"
                  className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-brand-border bg-brand-soft px-4 py-3 text-ui animate-fade-in"
                >
                  <div className="flex min-w-0 items-center">
                    <p className="m-0 text-detail font-bold text-text-primary">
                      Du har ulagrede endringer i planen.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <SchedulingButton
                      onClick={() => {
                        if (draft.canRestoreEditSession) {
                          draft.restoreEditSession();
                        }
                        onDiscardSuggestion();
                      }}
                      disabled={persistence.isSaving}
                      variant="quiet"
                    >
                      <RotateCcw size={iconSizes.small} aria-hidden="true" />
                      Forkast endringer
                    </SchedulingButton>
                    <SchedulingButton
                      onClick={() => persistence.saveNow?.()}
                      disabled={persistence.isSaving}
                      variant="primary"
                    >
                      {persistence.isSaving ? (
                        <>
                          <Loader2
                            size={iconSizes.small}
                            className="animate-spin"
                            aria-hidden="true"
                          />
                          Lagrer…
                        </>
                      ) : (
                        "Lagre endringer"
                      )}
                    </SchedulingButton>
                  </div>
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
                        onChange={(next) => {
                          setMoveScope(next);
                          setSelectedListScheduleIndex(null);
                          setSelectedSwapGroupFirstScheduleIndex(null);
                        }}
                        items={[
                          {
                            key: "interview",
                            label: "Flytt intervju",
                            icon: <User size={iconSizes.small} />,
                          },
                          {
                            key: "group",
                            label: "Flytt gruppe",
                            icon: <Layers size={iconSizes.small} />,
                          },
                        ]}
                        aria-label="Velg hva som skal flyttes"
                      />
                    )}
                    <div data-cy="view-switcher" data-view={viewType}>
                      <SegmentedControl<"kort" | "matrise">
                        value={viewType}
                        onChange={(next) => {
                          if (next === viewType) return;
                          // Clear any drag/select state set by the other
                          // view so we don't carry selection across views.
                          clearListMove();
                          setViewType(next);
                        }}
                        items={[
                          {
                            key: "kort",
                            label: "Kort",
                            icon: <LayoutPanelTop size={iconSizes.small} />,
                          },
                          {
                            key: "matrise",
                            label: "Matrise",
                            icon: <Grid3x3 size={iconSizes.small} />,
                          },
                        ]}
                        aria-label="Visning av planutkastet"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (presentation.lockedCount === 0) return;
                        draft.unlockAll();
                      }}
                      disabled={
                        previewLoading ||
                        persistence.isSaving ||
                        presentation.lockedCount === 0
                      }
                      title={
                        presentation.lockedCount === 0
                          ? "Ingen låste intervjuer å frigjøre"
                          : `Frigjør alle ${presentation.lockedCount} låste intervjuer slik at en ny kjøring av planleggingen kan flytte dem`
                      }
                      className={cn(
                        actionButtonBase,
                        actionButtonNeutral,
                        "inline-flex items-center gap-1.5",
                      )}
                    >
                      <LockKeyhole size={iconSizes.small} aria-hidden="true" />
                      <span>
                        Frigjør alle intervjuer
                        {presentation.lockedCount > 0
                          ? ` (${presentation.lockedCount})`
                          : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const unlockable =
                          presentation.totalAssignments -
                          presentation.lockedCount;
                        if (unlockable === 0) return;
                        draft.lockAll();
                      }}
                      disabled={
                        previewLoading ||
                        persistence.isSaving ||
                        presentation.totalAssignments -
                          presentation.lockedCount ===
                          0
                      }
                      title={
                        presentation.totalAssignments -
                          presentation.lockedCount ===
                        0
                          ? "Alle intervjuer er allerede låst"
                          : `Lås alle ${presentation.totalAssignments - presentation.lockedCount} ulåste intervjuer slik at en ny kjøring av planleggingen beholder dem og fyller ut resten rundt dem`
                      }
                      className={cn(
                        actionButtonBase,
                        actionButtonNeutral,
                        "inline-flex items-center gap-1.5",
                      )}
                    >
                      <LockKeyhole size={iconSizes.small} aria-hidden="true" />
                      <span>
                        Lås alle intervjuer
                        {presentation.totalAssignments -
                          presentation.lockedCount >
                        0
                          ? ` (${presentation.totalAssignments - presentation.lockedCount})`
                          : ""}
                      </span>
                    </button>
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
              {dates.length > 1 && (
                <div className="mb-3">
                  <DayTabs
                    dates={dates}
                    countsByDay={countsByDay}
                    selectedDayIndex={selectedDayFilter}
                    onSelectDay={setSelectedDayFilter}
                  />
                </div>
              )}
              {viewType === "kort" ? (
                <BlockTable
                  entries={presentation.sortedEntries}
                  canonicalBlocks={canonicalBlocks}
                  candidates={candidates}
                  interviewers={interviewers}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  panelSize={panelSize}
                  canEditDraft={canEditDraft}
                  currentUserName={currentUserName}
                  jointTimes={jointTimes}
                  selectedDayFilter={selectedDayFilter}
                  formatSlotTime={formatSlotTime}
                  getBlockInterviewerOptions={getBlockInterviewerOptions}
                  getSlotInterviewerOptions={getSlotInterviewerOptions}
                  onReplaceBlockPanelMember={draft.replaceBlockPanelMember}
                  onSwapPanelMember={draft.swapPanelMember}
                  onSwapCandidates={draft.swapTimes}
                  availabilityStatusFor={presentation.availabilityStatusFor}
                  hasConflictFor={hasConflictFor}
                  onToggleLock={draft.toggleLock}
                  moveScope={moveScope}
                  groupIndexesByScheduleIndex={groupIndexesByScheduleIndex}
                  selectedListScheduleIndex={
                    moveScope === "group"
                      ? selectedSwapGroupFirstScheduleIndex
                      : selectedListScheduleIndex
                  }
                  draggedListScheduleIndex={draggedListScheduleIndex}
                  listDropTargetIndex={listDropTargetIndex}
                  listDropTargetTime={listDropTargetTime}
                  highlightedScheduleIndexes={highlightedScheduleIndexes}
                  onSelectRow={selectOrSwapListInterview}
                  onDragStartRow={handleRowDragStart}
                  onDragEndRow={clearListMove}
                  onRowDragOver={handleRowDragOver}
                  onRowDragLeave={handleRowDragLeave}
                  onRowDrop={handleRowDrop}
                  onEmptySlotDragOver={handleEmptySlotDragOver}
                  onEmptySlotDragLeave={handleEmptySlotDragLeave}
                  onEmptySlotDrop={handleEmptySlotDrop}
                  onEmptySlotClick={handleEmptySlotClick}
                  onUnassignCandidate={
                    canEditDraft ? handleUnassignCandidate : undefined
                  }
                  unplacedCandidates={presentation.unplaceableCandidates}
                  onAssignUnplacedCandidate={
                    canEditDraft ? handleAssignUnplaced : undefined
                  }
                />
              ) : (
                <InterviewerMatrixView
                  entries={presentation.sortedEntries.map((entry) => ({
                    item: entry.item,
                    scheduleIndex: entry.scheduleIndex,
                  }))}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  dayIndex={selectedDayFilter}
                  canonicalBlocks={canonicalBlocks}
                  panelSize={panelSize}
                  hasConflictFor={hasConflictFor}
                  highlightedScheduleIndex={
                    highlightedScheduleIndexes.size > 0
                      ? ([...highlightedScheduleIndexes][0] ?? null)
                      : null
                  }
                  onSelectSlot={handleMatrixSelectSlot}
                />
              )}
            </SchedulePanelBody>
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
                      {hasLocalDraft && (
                        <>
                          <SchedulingButton
                            onClick={() => {
                              if (draft.canRestoreEditSession) {
                                draft.restoreEditSession();
                              }
                              onDiscardSuggestion();
                            }}
                            disabled={persistence.isSaving}
                            variant="quiet"
                          >
                            <RotateCcw
                              size={iconSizes.small}
                              aria-hidden="true"
                            />
                            Forkast endringer
                          </SchedulingButton>
                          <SchedulingButton
                            onClick={() => persistence.saveNow?.()}
                            disabled={persistence.isSaving}
                            variant="primary"
                          >
                            {persistence.isSaving ? (
                              <>
                                <Loader2
                                  size={iconSizes.small}
                                  className="animate-spin"
                                  aria-hidden="true"
                                />
                                Lagrer…
                              </>
                            ) : (
                              "Lagre endringer"
                            )}
                          </SchedulingButton>
                        </>
                      )}
                      {nextStepActions.length > 0 && (
                        <DeviationNextStepMenu actions={nextStepActions} />
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
                      displayCandidate={(item) => item.candidate}
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
      {!backgroundMode && healthModalException && (
        <PlanHealthModal
          title={
            healthModalException.kind === "availability"
              ? "Utenfor tilgjengelighet"
              : healthModalException.kind === "conflict"
                ? "Inhabilitet i panelet"
                : "Hvileavvik"
          }
          intro={
            healthModalException.kind === "availability"
              ? "Disse intervjuene har paneledlemmer som ikke har åpnet tidsluken. Bytt medlemmet, eller åpne raden og rediger selv."
              : healthModalException.kind === "conflict"
                ? "Disse tildelingene bruker en intervjuer som har meldt inhabilitet for kandidaten. Bytt medlemmet, eller rediger raden."
                : "Disse pannelederne jobber i naboblokker uten pause imellom. Bytt én ut av blokken, eller rediger raden."
          }
          entries={healthModalEntries}
          formatTime={formatSlotTime}
          onApplySubstitution={applyHealthSubstitution}
          onEditRow={editHealthRow}
          onClose={() => setHealthModalException(null)}
        />
      )}
      {clearDraftOpen && onClearDraft && (
        <ConfirmDialog
          title="Slette planutkastet?"
          confirmLabel={clearingDraft ? "Sletter…" : "Slett utkast"}
          tone="danger"
          busy={clearingDraft}
          onConfirm={async () => {
            setClearingDraft(true);
            const cleared = await onClearDraft();
            setClearingDraft(false);
            // Keep the dialog open on failure - the toast explains why,
            // and closing would look like the delete had gone through.
            if (cleared) setClearDraftOpen(false);
          }}
          onClose={() => setClearDraftOpen(false)}
        >
          <p className="m-0">
            {clearableDraftCount} intervju
            {clearableDraftCount === 1 ? "" : "er"} blir fjernet, og kandidatene
            går tilbake til å være uplanlagte.
            {publishedDraftCount > 0
              ? ` De ${publishedDraftCount} publiserte intervjuene beholdes.`
              : ""}
          </p>
          <p className="m-0 mt-2 font-semibold">Dette kan ikke angres.</p>
        </ConfirmDialog>
      )}
    </div>
  );
};

export default SolverResults;
