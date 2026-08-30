import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Lock } from "lucide-react";

import type {
  Candidate,
  EnabledWindow,
  ExperienceLevel,
  Interviewer,
  ManualScheduleBlock,
  RepairStrategy,
  ScheduleBlockMode,
  SlotOverride,
} from "../types";
import {
  buildLockedAssignments,
  buildPublishedDayLocks,
  buildSolveBlocks,
  formatAccessibleDate,
  manualBlocksToSolverBlocks,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import { actionButtonNeutral, actionButtonBase } from "../ui";
import cn from "../../../utils/cn";
import { deriveAssignmentConflictSummary } from "./assignmentConflicts";
import { hasSchedule } from "./solverHelpers";
import RepairScenarioPanel from "./RepairScenarioPanel";
import {
  buildRepairScenario,
  buildRepairSolveRequest,
  type RepairScenario,
} from "./repairScenarios";
import { buildProposalDiff } from "./proposalDiff";
import SolverResults from "./SolverResults";
import SolverSetupPanel from "./SolverSetupPanel";
import { useScheduleDraft } from "./useScheduleDraft";
import {
  useScheduleDraftPersistence,
  type DraftPersistenceStatus,
} from "./useScheduleDraftPersistence";
import { useSolverSession } from "./useSolverSession";
import { derivePlanDraftWorkflowState } from "./planDraftWorkflow";
import { useInterviewAvailability } from "src/query/hooks";
import PublishBoundaryTimeline from "src/routes/SchedulePage/PublishBoundaryTimeline";
import { iconSizes } from "src/styles/designTokens";
import DraftTaskLayout from "./DraftTaskLayout";
import ProposalDecisionPanel from "./ProposalDecisionPanel";
import PublishedPlanNotice from "./PublishedPlanNotice";
import UnplacedSlotPicker, {
  buildUnplacedSlotOptions,
  type UnplacedSlotOption,
} from "./UnplacedSlotPicker";
import { deriveEnabledTimeOptions } from "./solverSelectors";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  admissionTitle: string;
  admissionSlug: string;
  groupId: string;
  startDate: string;
  endDate: string;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  blockMode: ScheduleBlockMode;
  manualBlocks: ManualScheduleBlock[];
  slotOverrides: SlotOverride[];
  candidateScopeResolved: boolean;
  availabilityReady: boolean;
  syntheticInput?: boolean;
  editRequestKey: number;
  currentReviewRequired: boolean;
  currentReviewComplete: boolean;
  completeReviewerCount: number;
  requiredReviewerCount: number;
  pendingReviewerCount: number;
  missingReviewerNames: string[];
  publicationReady: boolean;
  backgroundMode?: boolean;
  currentUserName?: string;
  onDraftPersistenceChange: (status: DraftPersistenceStatus) => void;
  onExperienceLevelChange: (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => Promise<void>;
  onOpenAvailability: () => void;
  onOpenFramework: () => void;
  onOpenConflictReview: () => void;
  conflictReviewReachable: boolean;
  onOpenPlan: () => void;
  /** Delete the unpublished part of the plan. Undefined disables the
   *  action (simulated plans, or a viewer who cannot edit). */
  onClearDraft?: () => Promise<boolean>;
  clearableDraftCount?: number;
  publishedDraftCount?: number;
}

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionSlug,
  groupId,
  startDate,
  endDate,
  enabledWindows,
  enabledSlots,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  blockMode,
  manualBlocks,
  slotOverrides,
  candidateScopeResolved,
  availabilityReady,
  syntheticInput = false,
  editRequestKey,
  currentReviewRequired,
  currentReviewComplete,
  completeReviewerCount,
  requiredReviewerCount,
  pendingReviewerCount,
  missingReviewerNames,
  publicationReady,
  backgroundMode = false,
  currentUserName,
  onDraftPersistenceChange,
  onExperienceLevelChange,
  onOpenAvailability,
  onOpenFramework,
  onOpenConflictReview,
  conflictReviewReachable,
  onOpenPlan,
  onClearDraft,
  clearableDraftCount,
  publishedDraftCount,
}: Props) {
  const [regenerationOpen, setRegenerationOpen] = useState(false);
  const [savedTouchSignal, setSavedTouchSignal] = useState<{
    key: number;
    scheduleIndexes: number[];
  } | null>(null);
  const [repairScenarios, setRepairScenarios] = useState<RepairScenario[]>([]);
  const [selectedRepairStrategy, setSelectedRepairStrategy] =
    useState<RepairStrategy>("minimum_change");
  const [selectedScenarioStrategy, setSelectedScenarioStrategy] =
    useState<RepairStrategy>();
  const [runningRepairStrategy, setRunningRepairStrategy] =
    useState<RepairStrategy>();
  const [repairError, setRepairError] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairFocusRequest, setRepairFocusRequest] = useState(0);
  const [draftFocusRequestKey, setDraftFocusRequestKey] = useState(0);
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const [unplacedPickerTarget, setUnplacedPickerTarget] = useState<{
    candidate_id?: string;
    candidate: string;
    reason?: string;
  } | null>(null);
  const proposalHeadingRef = useRef<HTMLHeadingElement>(null);
  const proposalComparisonTriggerRef = useRef<HTMLButtonElement>(null);
  const proposalComparisonHeadingRef = useRef<HTMLHeadingElement>(null);
  const canonicalBlocks = useMemo(
    () =>
      blockMode === "manual"
        ? manualBlocksToSolverBlocks(manualBlocks, dates, sessionDuration)
        : buildSolveBlocks({
            dates,
            dayStartMinute,
            dayEndMinute,
            sessionDuration,
            chunkSize,
            chunkBreakMinutes,
          }),
    [
      blockMode,
      chunkBreakMinutes,
      chunkSize,
      dates,
      dayEndMinute,
      dayStartMinute,
      manualBlocks,
      slotOverrides,
      sessionDuration,
    ],
  );
  const session = useSolverSession({
    admissionSlug,
    groupId,
    candidates,
    interviewers,
    dates,
    sessionDuration,
    enabledSlots,
    canonicalBlocks,
    candidateScopeResolved,
    syntheticInput,
  });
  const draft = useScheduleDraft({
    result: session.scopedResult,
    setResult: session.setResult,
    candidates,
    interviewers,
    dates,
    enabledSlots,
    sessionDuration,
    canonicalBlocks,
    savedSchedule: session.savedSchedule ?? null,
    panelSize: session.panelSize,
    onModify: session.markDraftModified,
  });
  const persistenceConfig = useMemo(
    () => ({
      admissionSlug,
      groupId,
      startDate,
      endDate,
      sessionDuration,
      enabledWindows,
      enabledSlots,
      dayStartMinute,
      dayEndMinute,
      chunkSize,
      chunkBreakMinutes,
      blockMode,
      manualBlocks,
      slotOverrides,
      panelSize: session.panelSize,
      solverOptions: session.solverOptions,
    }),
    [
      admissionSlug,
      groupId,
      blockMode,
      chunkBreakMinutes,
      chunkSize,
      dayEndMinute,
      dayStartMinute,
      enabledSlots,
      enabledWindows,
      endDate,
      manualBlocks,
      session.panelSize,
      session.solverOptions,
      sessionDuration,
      startDate,
    ],
  );
  const persistence = useScheduleDraftPersistence({
    result: session.scopedResult,
    savedSchedule: session.savedSchedule,
    hasLocalDraft: session.hasLocalDraft,
    loading: session.loading,
    solveTick: session.solveTick,
    draftBaseRevision: session.draftBaseRevision,
    remoteRevisionChanged: session.remoteRevisionChanged,
    config: persistenceConfig,
    syntheticInput,
    onConflict: session.markDraftConflict,
    onRevisionSaved: session.markDraftRevisionSaved,
    getTouchedScheduleIndexes: draft.consumeTouchedScheduleIndexes,
    onSaved: (revision, touchedScheduleIndexes) => {
      session.markDraftSaved(revision);
      setSavedTouchSignal(
        touchedScheduleIndexes.length > 0
          ? { key: Date.now(), scheduleIndexes: touchedScheduleIndexes }
          : null,
      );
    },
  });
  useEffect(() => {
    onDraftPersistenceChange({
      state: persistence.state,
      error: persistence.error,
      hasLocalDraft: persistence.hasLocalDraft,
      isSaving: persistence.isSaving,
      hasConflict: persistence.hasConflict,
      isSaved: persistence.isSaved,
    });
  }, [
    onDraftPersistenceChange,
    persistence.error,
    persistence.hasConflict,
    persistence.hasLocalDraft,
    persistence.isSaved,
    persistence.isSaving,
    persistence.state,
  ]);

  useEffect(() => {
    if (
      editRequestKey > 0 &&
      !session.savedSchedule?.is_distributed &&
      !session.scopedResult
    ) {
      session.restoreSavedProposal();
    }
  }, [
    editRequestKey,
    session.restoreSavedProposal,
    session.savedSchedule?.is_distributed,
    session.scopedResult,
  ]);

  const assignmentConflicts = useMemo(
    () =>
      deriveAssignmentConflictSummary(
        session.scopedResult?.schedule ?? [],
        candidates,
        interviewers,
      ),
    [candidates, interviewers, session.scopedResult?.schedule],
  );

  const solveBlocks = useMemo(() => {
    const openSlots = new Set(
      slotsToSolverAvailability(enabledSlots, dates, sessionDuration),
    );
    return canonicalBlocks.map((block) =>
      block.filter((slot) => openSlots.has(slot)),
    );
  }, [canonicalBlocks, enabledSlots, sessionDuration]);
  const savedScheduleIsDistributed = Boolean(
    session.savedSchedule?.is_distributed,
  );
  const distributedThroughDate =
    session.savedSchedule?.distributed_through ?? null;
  const isPartiallyDistributed = Boolean(
    distributedThroughDate &&
      dates.some((date) => date > distributedThroughDate),
  );
  const publishedDayLocks = useMemo(() => {
    if (
      !isPartiallyDistributed ||
      !distributedThroughDate ||
      !session.savedSchedule
    ) {
      return null;
    }
    return buildPublishedDayLocks({
      schedule: session.savedSchedule.schedule,
      startDate: session.savedSchedule.start_date,
      throughDate: distributedThroughDate,
      candidates,
      interviewers,
    });
  }, [
    candidates,
    distributedThroughDate,
    interviewers,
    isPartiallyDistributed,
    session.savedSchedule,
  ]);
  const unplannedCandidateCount = useMemo(() => {
    if (!isPartiallyDistributed || !session.scopedResult) return null;
    const placedKeys = new Set(
      session.scopedResult.schedule.map(
        (item) => item.candidate_id ?? item.candidate,
      ),
    );
    return candidates.filter(
      (candidate) =>
        !placedKeys.has(candidate.id) && !placedKeys.has(candidate.name),
    ).length;
  }, [candidates, isPartiallyDistributed, session.scopedResult]);
  const repairBaseline = session.scopedResult?.schedule ?? [];
  const repairInputFingerprint = useMemo(
    () =>
      JSON.stringify({
        interviewers: interviewers.map((interviewer) => ({
          id: interviewer.id,
          availability: [...interviewer.availability].sort((a, b) => a - b),
          biased: [...interviewer.biased].sort(),
        })),
        enabledSlots: Array.from(enabledSlots).sort(),
        panelSize: session.panelSize,
      }),
    [enabledSlots, interviewers, session.panelSize],
  );
  const repairBaselineKey = useMemo(
    () =>
      `${session.savedSchedule?.updated_at ?? "local"}:${JSON.stringify(
        repairBaseline,
      )}:${repairInputFingerprint}`,
    [repairBaseline, repairInputFingerprint, session.savedSchedule?.updated_at],
  );
  const repairBaselineKeyRef = useRef(repairBaselineKey);
  useEffect(() => {
    repairBaselineKeyRef.current = repairBaselineKey;
    setRepairScenarios([]);
    setSelectedRepairStrategy("minimum_change");
    setSelectedScenarioStrategy(undefined);
    setRepairError("");
  }, [repairBaselineKey]);

  const solvePlan = async () => {
    // While part of the plan is already released, every placement up to the
    // published boundary replaces the draft's own lock marks: released days
    // stay exactly as published, everything else is free to reschedule.
    const outcome = await session.solvePlan(
      publishedDayLocks ?? draft.explicitLockedAssignments,
    );
    // A fully-solved re-plan auto-applies inside useSolverSession — it has
    // already replaced the current draft, so leave the regeneration setup
    // and drop back to the plan view. A partial result (its proposal
    // decision panel takes over) or a solver error (shown in the setup
    // panel) deliberately keeps the setup panel open.
    if (
      regenerationOpen &&
      hasSchedule(outcome?.status) &&
      (outcome?.unplaceable?.length ?? 0) === 0
    ) {
      setRegenerationOpen(false);
      setDraftFocusRequestKey((request) => request + 1);
    }
  };
  // Extending the scope pins every saved placement: the partial plan is the
  // committed example everyone already works from, so a re-solve only fills
  // the newly added day(s) around it.
  const savedScheduleLocks = useMemo(() => {
    const saved = session.savedSchedule;
    if (!saved || saved.schedule.length === 0) return null;
    return buildLockedAssignments(saved.schedule, candidates, interviewers, {
      includeUnlockedItems: true,
    });
  }, [candidates, interviewers, session.savedSchedule]);
  // The published prefix is a hard floor (see deriveDayScopeBounds); an
  // unpublished draft is not, so a from-scratch plan stays fully rescopable
  // for staged planning. draftDayExtent drives the "these draft days get
  // replaced" warning in the setup panel. Both are derived in the session,
  // which also needs them to gate auto-apply on a narrowing solve.
  const { minDayCount, draftDayExtent } = session;
  // The scope is seeded from the last drafted day, which can sit below a
  // later publication boundary (published days with no interview yet). A
  // re-solve must always cover every published day, so lift it to the floor.
  const { effectiveDayCount, setDayCount } = session;
  useEffect(() => {
    if (effectiveDayCount < minDayCount) setDayCount(minDayCount);
  }, [effectiveDayCount, minDayCount, setDayCount]);
  const canExtendDay =
    session.effectiveDayCount < session.plannableDates.length;
  const nextScopeDate = canExtendDay
    ? session.plannableDates[session.effectiveDayCount]
    : null;
  const extendDay = () => {
    const next = Math.min(
      session.effectiveDayCount + 1,
      session.plannableDates.length,
    );
    if (next === session.effectiveDayCount) return;
    session.setDayCount(next);
    void session.solvePlan(
      savedScheduleLocks ??
        publishedDayLocks ??
        draft.explicitLockedAssignments,
      { dayCount: next },
    );
  };
  // Extend the scope to every remaining enabled day at once, instead
  // of clicking "Planlegg neste dag" once per day. The published
  // prefix stays locked; the solver fills the still-draft tail in a
  // single pass so the user lands on a complete draft rather than
  // clicking through 5+ days individually. Disabled when there's
  // nothing left to extend into.
  const fillRemainingDays = () => {
    const total = session.plannableDates.length;
    if (total <= session.effectiveDayCount) return;
    session.setDayCount(total);
    void session.solvePlan(
      savedScheduleLocks ??
        publishedDayLocks ??
        draft.explicitLockedAssignments,
      { dayCount: total },
    );
  };
  const retryWithAvailabilityDeviation = () => {
    void session.solvePlan(
      publishedDayLocks ?? draft.explicitLockedAssignments,
      {
        availabilityFallback: "propose",
      },
    );
  };
  const previewRepairStrategy = async (strategy: RepairStrategy) => {
    if (!persistence.isSaved || persistence.isSaving) {
      setRepairError(
        "Vent til det gjeldende utkastet er lagret før du beregner løsninger.",
      );
      return null;
    }
    if (persistence.hasConflict) {
      setRepairError(
        "Planen er endret av noen andre. Last inn siden på nytt før du beregner løsninger.",
      );
      return null;
    }
    const baselineKey = repairBaselineKey;
    const baseline = repairBaseline;
    setRepairError("");
    setRunningRepairStrategy(strategy);
    const repairRequest = buildRepairSolveRequest(
      draft.lockedAssignments,
      strategy,
    );
    const outcome = await session.solvePlan(
      repairRequest.lockedAssignments,
      repairRequest.options,
    );
    setRunningRepairStrategy(undefined);
    if (repairBaselineKeyRef.current !== baselineKey) {
      setRepairError("Planen ble endret. Beregn løsningene på nytt.");
      return null;
    }
    if (!outcome || !hasSchedule(outcome.status)) {
      return null;
    }
    const scenario = buildRepairScenario({
      baselineKey,
      strategy,
      baseline,
      result: outcome,
      blocks: solveBlocks,
      interviewers,
      sessionDuration,
    });
    setRepairScenarios((current) => [
      ...current.filter((item) => item.strategy !== strategy),
      scenario,
    ]);
    setSelectedScenarioStrategy(scenario.applicable ? strategy : undefined);
    return scenario;
  };
  const compareRepairStrategies = async () => {
    const strategies: RepairStrategy[] = [
      "minimum_change",
      "preserve_panels",
      "balanced",
    ];
    setRepairScenarios([]);
    setSelectedScenarioStrategy(undefined);
    for (const strategy of strategies) {
      const scenario = await previewRepairStrategy(strategy);
      if (!scenario) break;
    }
  };
  const applyRepairScenario = (scenario: RepairScenario) => {
    if (scenario.baselineKey !== repairBaselineKeyRef.current) {
      setRepairError("Planen ble endret. Beregn løsningen på nytt.");
      return;
    }
    if (!scenario.applicable) {
      setRepairError(
        "Løsningen kan ikke brukes fordi én eller flere kandidater står uten intervju.",
      );
      return;
    }
    setRepairOpen(false);
    session.applyRepairPreview(scenario.result, scenario.strategy);
  };
  const selectRepairScenario = (strategy: RepairStrategy) => {
    const scenario = repairScenarios.find(
      (candidate) => candidate.strategy === strategy,
    );
    if (!scenario?.applicable) return;
    setSelectedScenarioStrategy(strategy);
  };
  const selectRepairStrategy = (strategy: RepairStrategy) => {
    setSelectedRepairStrategy(strategy);
    setSelectedScenarioStrategy(
      repairScenarios.some(
        (scenario) => scenario.strategy === strategy && scenario.applicable,
      )
        ? strategy
        : undefined,
    );
    session.setSolverOptions((current) => ({
      ...current,
      repair_strategy: strategy,
    }));
  };
  const selectedRepairScenario = repairScenarios.find(
    (scenario) => scenario.strategy === selectedScenarioStrategy,
  );
  const hasProposal = hasSchedule(session.scopedResult?.status);
  const repairAvailable =
    hasProposal &&
    requiredReviewerCount > 0 &&
    completeReviewerCount === requiredReviewerCount &&
    assignmentConflicts.assignmentCount > 0;

  useEffect(() => {
    if (!repairAvailable) setRepairOpen(false);
  }, [repairAvailable]);

  const pendingProposal = session.pendingProposal;
  const pendingOutsideAvailability =
    pendingProposal?.result.schedule.reduce(
      (count, item) =>
        count + item.panel.filter((member) => member.is_overtime).length,
      0,
    ) ?? 0;
  const pendingUnplaced = pendingProposal?.result.unplaceable?.length ?? 0;
  const unplaceableCandidates = draft.presentation.unplaceableCandidates;
  const currentUnplaced = draft.presentation.unplaceableCandidates.length;
  const unplacedPickerOptions = useMemo<UnplacedSlotOption[]>(() => {
    if (!unplacedPickerTarget) return [];
    const enabledTimeOptions = deriveEnabledTimeOptions(
      enabledSlots,
      dates,
      sessionDuration,
    );
    const occupiedTimes = new Set(
      (session.scopedResult?.schedule ?? []).map((item) => item.time),
    );
    return buildUnplacedSlotOptions({
      enabledTimeOptions,
      occupiedTimes,
      candidateId: unplacedPickerTarget.candidate_id,
      candidateName: unplacedPickerTarget.candidate,
      panelSize: session.panelSize,
      interviewers,
      candidates,
    });
  }, [
    candidates,
    dates,
    enabledSlots,
    interviewers,
    session.panelSize,
    session.scopedResult?.schedule,
    sessionDuration,
    unplacedPickerTarget,
  ]);
  const openUnplacedPicker = useCallback(
    (candidate: {
      candidate_id?: string;
      candidate: string;
      reason?: string;
    }) => {
      setUnplacedPickerTarget(candidate);
    },
    [],
  );
  const closeUnplacedPicker = useCallback(() => {
    setUnplacedPickerTarget(null);
  }, []);
  const handleUnplacedSlotPick = useCallback(
    (time: number) => {
      if (!unplacedPickerTarget) return;
      const outcome = draft.assignUnplacedCandidate({
        candidateId: unplacedPickerTarget.candidate_id,
        candidateName: unplacedPickerTarget.candidate,
        time,
      });
      if (outcome.ok) {
        setUnplacedPickerTarget(null);
        window.requestAnimationFrame(() => {
          window.document
            .querySelector<HTMLElement>("[data-stage] h2")
            ?.focus({ preventScroll: true });
        });
      }
    },
    [draft, unplacedPickerTarget],
  );
  const placementCount = draft.presentation.sortedSchedule.length;
  const totalCandidateCount = placementCount + currentUnplaced;
  const currentOutsideAvailability =
    draft.presentation.availabilitySummary.outsideAvailabilityAssignments;
  const pendingProposalIsStale = Boolean(
    pendingProposal &&
      (session.savedSchedule?.updated_at !== pendingProposal.baseRevision ||
        session.pendingProposalRejected),
  );
  const pendingProposalExpiry = pendingProposal?.job.proposal_expires_at
    ? new Intl.DateTimeFormat("nb-NO", {
        day: "numeric",
        month: "long",
      }).format(new Date(pendingProposal.job.proposal_expires_at))
    : null;
  const pendingProposalHasExpired = Boolean(
    pendingProposal?.job.proposal_expires_at &&
      Date.parse(pendingProposal.job.proposal_expires_at) <= Date.now(),
  );
  // Diff-first review: the decision panel leads with what the proposal would
  // change, so a re-solve is reviewed by its delta rather than as a second
  // full plan. Null while there is no current draft to diff against.
  const pendingProposalDiff = useMemo(() => {
    if (!pendingProposal) return null;
    const baseline = session.scopedResult?.schedule ?? [];
    if (baseline.length === 0) return null;
    return buildProposalDiff({
      baseline,
      result: pendingProposal.result,
      interviewers,
    });
  }, [interviewers, pendingProposal, session.scopedResult]);
  useEffect(() => {
    if (!pendingProposal) return;
    window.requestAnimationFrame(() =>
      proposalHeadingRef.current?.focus({ preventScroll: true }),
    );
  }, [pendingProposal?.job.job_id]);
  useEffect(() => {
    if (pendingProposal) return;
    setProposalDetailsOpen(false);
  }, [pendingProposal]);
  const closeProposalComparison = useCallback(() => {
    setProposalDetailsOpen(false);
    window.requestAnimationFrame(() => {
      proposalComparisonTriggerRef.current?.focus();
    });
  }, []);
  useEffect(() => {
    if (!proposalDetailsOpen) return;
    window.requestAnimationFrame(() => {
      proposalComparisonHeadingRef.current?.focus({ preventScroll: true });
    });
  }, [proposalDetailsOpen]);
  // D3: the deciding inhabilitet review is submitted in another person's
  // browser, so local cache invalidation can never observe it. While
  // reviewers are outstanding the roster is polled; when it flips to
  // complete, the re-solve is enqueued once with the current locks.
  const reviewsOutstanding =
    requiredReviewerCount > 0 && completeReviewerCount < requiredReviewerCount;
  const autoResolvePolling =
    !backgroundMode &&
    !syntheticInput &&
    hasProposal &&
    reviewsOutstanding &&
    !session.loading &&
    !pendingProposal &&
    !session.hasLocalDraft &&
    persistence.isSaved &&
    !persistence.hasConflict;
  useInterviewAvailability(admissionSlug, groupId, {
    refetchInterval: autoResolvePolling ? 3000 : false,
  });
  const autoResolveArmedRef = useRef(false);
  useEffect(() => {
    if (!hasProposal || backgroundMode || syntheticInput) return;
    if (requiredReviewerCount === 0) return;
    if (reviewsOutstanding) {
      autoResolveArmedRef.current = true;
      return;
    }
    if (!autoResolveArmedRef.current) return;
    autoResolveArmedRef.current = false;
    if (
      session.loading ||
      pendingProposal ||
      session.hasLocalDraft ||
      !persistence.isSaved ||
      persistence.hasConflict
    ) {
      return;
    }
    solvePlan();
    // solvePlan closes over the lock sets; re-running it on identity change
    // is inert because the armed flag has already been consumed.
  }, [
    backgroundMode,
    completeReviewerCount,
    hasProposal,
    pendingProposal,
    persistence.hasConflict,
    persistence.isSaved,
    requiredReviewerCount,
    reviewsOutstanding,
    session.hasLocalDraft,
    session.loading,
    solvePlan,
    syntheticInput,
  ]);
  const planDraftStage = derivePlanDraftWorkflowState({
    isPublished: savedScheduleIsDistributed && !isPartiallyDistributed,
    hasPendingProposal: Boolean(pendingProposal),
    loading: session.loading,
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
    solverError: session.error,
    unplaceableCount: unplaceableCandidates.length,
    filledDayCount: session.scopedResult?.filled_day_count,
    extendDayAvailable: canExtendDay,
    currentReviewRequired,
    currentReviewComplete,
    completeReviewerCount,
    requiredReviewerCount,
    pendingReviewerCount,
    missingReviewerNames,
    assignmentConflictCount: assignmentConflicts.assignmentCount,
    publicationReady,
  });
  const focusDraftHeading = useCallback(
    () => setDraftFocusRequestKey((request) => request + 1),
    [],
  );
  const closeRegeneration = () => {
    setRegenerationOpen(false);
    focusDraftHeading();
  };
  const applyPendingProposal = async () => {
    await session.applyPendingProposal();
    setRegenerationOpen(false);
    focusDraftHeading();
  };
  const keepCurrentDraft = async () => {
    await session.discardPendingProposal();
    setRegenerationOpen(false);
    focusDraftHeading();
  };
  const adjustPendingProposal = async () => {
    await session.discardPendingProposal();
    setRegenerationOpen(true);
  };
  const renderDraftCanvas = (backgroundMode = false) => (
    <SolverResults
      result={session.scopedResult}
      planRevealed={session.planRevealed}
      solveTick={session.solveTick}
      savedSchedule={session.savedSchedule}
      draft={draft}
      persistence={persistence}
      hasLocalDraft={session.hasLocalDraft}
      candidates={candidates}
      interviewers={interviewers}
      currentUserName={currentUserName}
      dates={dates}
      sessionDuration={sessionDuration}
      editRequestKey={editRequestKey}
      focusRequestKey={draftFocusRequestKey}
      assignmentConflicts={assignmentConflicts}
      panelSize={session.panelSize}
      canonicalBlocks={canonicalBlocks}
      currentReviewRequired={currentReviewRequired}
      currentReviewComplete={currentReviewComplete}
      completeReviewerCount={completeReviewerCount}
      requiredReviewerCount={requiredReviewerCount}
      pendingReviewerCount={pendingReviewerCount}
      missingReviewerNames={missingReviewerNames}
      publicationReady={publicationReady}
      solverError={session.error}
      failedResult={session.failedResult}
      onOpenSettings={() => setRegenerationOpen(true)}
      onExtendDay={canExtendDay ? extendDay : undefined}
      onFillRemainingDays={
        canExtendDay &&
        session.plannableDates.length > session.effectiveDayCount + 1
          ? fillRemainingDays
          : undefined
      }
      onOpenConflictReview={onOpenConflictReview}
      onOpenRepair={() => {
        setRepairOpen(true);
        setRepairFocusRequest((request) => request + 1);
      }}
      onRetrySolve={solvePlan}
      onDiscardSuggestion={session.discardCurrentSuggestion}
      onClearDraft={onClearDraft}
      clearableDraftCount={clearableDraftCount}
      publishedDraftCount={publishedDraftCount}
      onOpenPlan={onOpenPlan}
      onPreviewWithAvailabilityDeviation={retryWithAvailabilityDeviation}
      previewLoading={session.loading}
      backgroundMode={backgroundMode}
      savedTouchSignal={savedTouchSignal}
      onPickUnplacedSlot={openUnplacedPicker}
    />
  );

  if (savedScheduleIsDistributed && !isPartiallyDistributed) {
    return (
      <PublishedPlanNotice
        stage={planDraftStage.kind}
        title={planDraftStage.title}
        description={planDraftStage.description}
        onOpenPlan={onOpenPlan}
      />
    );
  }

  // A partially published plan keeps the full planning workspace available:
  // the released days are locked (see publishedDayLocks) and the rest can be
  // planned and released later without touching them.
  const renderWorkspace = () => {
    if (backgroundMode) {
      return hasProposal ? renderDraftCanvas(true) : null;
    }

    if (pendingProposal) {
      return (
        <DraftTaskLayout
          stage={planDraftStage.kind}
          draft={renderDraftCanvas(true)}
        >
          <ProposalDecisionPanel
            proposal={pendingProposal}
            stage={planDraftStage.kind}
            title={planDraftStage.title}
            description={planDraftStage.description}
            dates={dates}
            sessionDuration={sessionDuration}
            currentScheduleCount={draft.presentation.sortedSchedule.length}
            currentUnplacedCount={currentUnplaced}
            currentOutsideAvailabilityCount={currentOutsideAvailability}
            proposedUnplacedCount={pendingUnplaced}
            proposedOutsideAvailabilityCount={pendingOutsideAvailability}
            diff={pendingProposalDiff}
            expiryLabel={pendingProposalExpiry}
            isStale={pendingProposalIsStale}
            hasExpired={pendingProposalHasExpired}
            detailsOpen={proposalDetailsOpen}
            actionLoading={session.proposalActionLoading}
            headingRef={proposalHeadingRef}
            comparisonTriggerRef={proposalComparisonTriggerRef}
            comparisonHeadingRef={proposalComparisonHeadingRef}
            onToggleDetails={() => setProposalDetailsOpen((open) => !open)}
            onCloseComparison={closeProposalComparison}
            onKeepCurrent={() => void keepCurrentDraft()}
            onAdjust={() => void adjustPendingProposal()}
            onApply={() => void applyPendingProposal()}
          />
        </DraftTaskLayout>
      );
    }

    if (repairAvailable && repairOpen) {
      return (
        <DraftTaskLayout draft={renderDraftCanvas(true)}>
          <RepairScenarioPanel
            open
            openRequestKey={repairFocusRequest}
            onClose={() => setRepairOpen(false)}
            conflictCount={assignmentConflicts.assignmentCount}
            selectedStrategy={selectedRepairStrategy}
            onSelectedStrategyChange={selectRepairStrategy}
            scenarios={repairScenarios}
            selectedScenario={selectedRepairScenario}
            onSelectScenario={selectRepairScenario}
            onPreview={(strategy) => void previewRepairStrategy(strategy)}
            onCompare={() => void compareRepairStrategies()}
            onApply={applyRepairScenario}
            loading={session.loading}
            runningStrategy={runningRepairStrategy}
            error={repairError || session.error}
            dates={dates}
            sessionDuration={sessionDuration}
          />
        </DraftTaskLayout>
      );
    }

    if (!hasProposal || regenerationOpen) {
      const setupPanel = (
        <SolverSetupPanel
          interviewerCount={interviewers.length}
          experiencedInterviewerCount={
            interviewers.filter(
              (interviewer) => interviewer.experience_level === "experienced",
            ).length
          }
          interviewers={interviewers}
          solverOptions={session.solverOptions}
          onSolverOptionsChange={session.setSolverOptions}
          onExperienceLevelChange={onExperienceLevelChange}
          panelSize={session.panelSize}
          onPanelSizeChange={session.setPanelSize}
          openBlockCount={solveBlocks.length}
          interviewSlotCount={session.readiness.enabledSlotCount}
          readiness={session.readiness}
          availabilityReady={availabilityReady}
          plannableDates={session.plannableDates}
          effectiveDayCount={session.effectiveDayCount}
          onDayCountChange={session.setDayCount}
          minDayCount={minDayCount}
          draftDayExtent={draftDayExtent}
          loading={session.loading}
          error={session.error}
          elapsedMs={session.elapsedMs}
          startedAt={session.startedAt}
          jobStatus={session.jobStatus}
          estimatedSeconds={session.estimatedSeconds}
          lockedCount={draft.presentation.lockedCount}
          hasProposal={hasProposal}
          changeableInterviewCount={Math.max(
            (session.scopedResult?.schedule.length ?? 0) -
              draft.presentation.lockedCount,
            0,
          )}
          currentDraftReady={
            // Simulated plans can never be persisted (their interviewers do
            // not exist in the backend), so their draft's save status is
            // meaningless: counting "ready" on it would deadlock every
            // further action behind a save that can never happen.
            syntheticInput ||
            !hasProposal ||
            (persistence.isSaved &&
              !persistence.isSaving &&
              !persistence.hasConflict)
          }
          draftSaveConflict={persistence.hasConflict}
          draftSaveError={
            persistence.state === "error" ? persistence.error : ""
          }
          onAdoptRemoteDraft={() => {
            // Same recovery as the editor's "Last inn siste versjon", but
            // in place: drop the conflicted local draft, reveal the remote
            // schedule, and reset the save bookkeeping so the panel is no
            // longer blocked.
            session.discardCurrentSuggestion();
            persistence.adoptRemote();
          }}
          onRetryDraftSave={() => persistence.retry()}
          candidateScopeResolved={candidateScopeResolved}
          regenerationOpen={regenerationOpen}
          onCloseRegeneration={closeRegeneration}
          onSolve={solvePlan}
          onCancel={() => void session.cancel()}
          onOpenAvailability={onOpenAvailability}
          onOpenFramework={onOpenFramework}
          onOpenConflictReview={onOpenConflictReview}
          conflictReviewReachable={conflictReviewReachable}
        />
      );

      if (!hasProposal) {
        return setupPanel;
      }

      return (
        <DraftTaskLayout draft={renderDraftCanvas(true)}>
          {setupPanel}
        </DraftTaskLayout>
      );
    }

    return renderDraftCanvas();
  };

  const partialPublishBanner =
    isPartiallyDistributed && distributedThroughDate ? (
      <div
        data-cy="partial-publish-banner"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <PublishBoundaryTimeline
            dates={dates}
            distributedThrough={distributedThroughDate}
            onExtendDay={canExtendDay ? extendDay : undefined}
            onFillRemainingDays={
              canExtendDay &&
              session.plannableDates.length > session.effectiveDayCount + 1
                ? fillRemainingDays
                : undefined
            }
            loading={session.loading}
          />
          {unplannedCandidateCount !== null && (
            <p className="m-0 mt-2 text-detail leading-relaxed text-text-muted">
              {unplannedCandidateCount === 1
                ? "1 kandidat venter på intervju."
                : `${unplannedCandidateCount} kandidater venter på intervju.`}{" "}
              De publiserte dagene holdes uendret.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenPlan}
          className={cn(actionButtonBase, actionButtonNeutral)}
        >
          Se publisert plan
        </button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {partialPublishBanner}
      {renderWorkspace()}
      {unplacedPickerTarget && (
        <UnplacedSlotPicker
          candidateName={unplacedPickerTarget.candidate}
          candidateReason={unplacedPickerTarget.reason}
          panelSize={session.panelSize}
          options={unplacedPickerOptions}
          dates={dates}
          sessionDuration={sessionDuration}
          loading={session.loading}
          onPick={handleUnplacedSlotPick}
          onClose={closeUnplacedPicker}
        />
      )}
    </div>
  );
}
