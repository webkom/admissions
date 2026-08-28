import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Lock, Sparkles } from "lucide-react";

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
  decodeScheduleTime,
  formatAccessibleDate,
  manualBlocksToSolverBlocks,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "../ui";
import cn from "../../../utils/cn";
import { deriveAssignmentConflictSummary } from "./assignmentConflicts";
import { hasSchedule } from "./solverHelpers";
import RepairScenarioPanel from "./RepairScenarioPanel";
import {
  buildRepairScenario,
  buildRepairSolveRequest,
  type RepairScenario,
} from "./repairScenarios";
import SolverResults from "./SolverResults";
import SolverSetupPanel from "./SolverSetupPanel";
import { useScheduleDraft } from "./useScheduleDraft";
import {
  useScheduleDraftPersistence,
  type DraftPersistenceStatus,
} from "./useScheduleDraftPersistence";
import { useSolverSession } from "./useSolverSession";
import { derivePlanDraftStage } from "src/routes/SchedulePage/workflowStages";
import { iconSizes } from "src/styles/designTokens";
import DraftTaskLayout from "./DraftTaskLayout";
import ProposalDecisionPanel from "./ProposalDecisionPanel";
import PublishedPlanNotice from "./PublishedPlanNotice";

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
  onDraftPersistenceChange: (status: DraftPersistenceStatus) => void;
  onExperienceLevelChange: (
    userId: string,
    experienceLevel: ExperienceLevel,
  ) => Promise<void>;
  onOpenAvailability: () => void;
  onOpenFramework: () => void;
  onWidenDays: () => void;
  /** Enter the plan's inline editing mode from outside the plan panel
   *  (the delplan stage's "Rediger for hånd" action). */
  onEditByHand: () => void;
  onOpenConflictReview: () => void;
  conflictReviewReachable: boolean;
  onOpenPlan: () => void;
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
  onDraftPersistenceChange,
  onExperienceLevelChange,
  onOpenAvailability,
  onOpenFramework,
  onWidenDays,
  onEditByHand,
  onOpenConflictReview,
  conflictReviewReachable,
  onOpenPlan,
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
  const [placementStageDismissed, setPlacementStageDismissed] = useState(false);
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const proposalHeadingRef = useRef<HTMLHeadingElement>(null);
  const proposalComparisonTriggerRef = useRef<HTMLButtonElement>(null);
  const proposalComparisonHeadingRef = useRef<HTMLHeadingElement>(null);
  const placementHeadingRef = useRef<HTMLHeadingElement>(null);
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

  const solvePlan = () => {
    // While part of the plan is already released, every placement up to the
    // published boundary replaces the draft's own lock marks: released days
    // stay exactly as published, everything else is free to reschedule.
    void session.solvePlan(
      publishedDayLocks ?? draft.explicitLockedAssignments,
    );
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
  // The scope can never shrink below the last day that already has a
  // planned candidate - applying a smaller solve would silently drop them.
  const minDayCount = useMemo(() => {
    const rows = session.savedSchedule?.schedule ?? [];
    let lastDate: string | null = null;
    rows.forEach((item) => {
      if (!Number.isFinite(item.time)) return;
      const { dayIndex } = decodeScheduleTime(item.time, sessionDuration);
      const date = dates[dayIndex];
      if (date && (lastDate === null || date > lastDate)) lastDate = date;
    });
    if (!lastDate) return 1;
    const index = session.plannableDates.indexOf(lastDate);
    return index === -1 ? 1 : index + 1;
  }, [dates, session.savedSchedule, session.plannableDates, sessionDuration]);
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
  useEffect(() => {
    setPlacementStageDismissed(false);
  }, [session.solveTick]);
  useEffect(() => {
    if (unplaceableCandidates.length === 0 || placementStageDismissed) return;
    window.requestAnimationFrame(() =>
      placementHeadingRef.current?.focus({ preventScroll: true }),
    );
  }, [
    placementStageDismissed,
    session.solveTick,
    unplaceableCandidates.length,
  ]);
  const planDraftStage = derivePlanDraftStage({
    isPublished: savedScheduleIsDistributed && !isPartiallyDistributed,
    currentReviewRequired,
    currentReviewComplete,
    hasPendingProposal: Boolean(pendingProposal),
    repairOpen,
    regenerationOpen,
    unplaceableCount: unplaceableCandidates.length,
    placementStageDismissed,
    loading: session.loading,
    hasProposal,
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
      dates={dates}
      sessionDuration={sessionDuration}
      dayStartMinute={dayStartMinute}
      dayEndMinute={dayEndMinute}
      chunkSize={chunkSize}
      chunkBreakMinutes={chunkBreakMinutes}
      enabledSlots={enabledSlots}
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
      onOpenSettings={() => setRegenerationOpen(true)}
      onWidenDays={onWidenDays}
      onExtendDay={canExtendDay ? extendDay : undefined}
      onOpenConflictReview={onOpenConflictReview}
      onOpenRepair={() => {
        setRepairOpen(true);
        setRepairFocusRequest((request) => request + 1);
      }}
      onRetrySolve={solvePlan}
      onDiscardSuggestion={session.discardCurrentSuggestion}
      onOpenPlan={onOpenPlan}
      onPreviewWithAvailabilityDeviation={retryWithAvailabilityDeviation}
      previewLoading={session.loading}
      backgroundMode={backgroundMode}
      savedTouchSignal={savedTouchSignal}
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
          loading={session.loading}
          error={session.error}
          elapsedMs={session.elapsedMs}
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

    if (unplaceableCandidates.length > 0 && !placementStageDismissed) {
      return (
        <DraftTaskLayout
          stage="missing_placements"
          draft={renderDraftCanvas(true)}
        >
          <SchedulePanel
            dataCy="missing-placements-stage"
            stage="missing_placements"
            className="mx-auto w-full max-w-3xl"
          >
            <SchedulePanelHeader
              icon={Sparkles}
              headingRef={placementHeadingRef}
              headingDataCy="schedule-stage-heading"
              title={planDraftStage.title}
              description={planDraftStage.description}
            />
            <SchedulePanelBody>
              <ul className="m-0 divide-y divide-border-soft p-0">
                {unplaceableCandidates.map((candidate) => (
                  <li
                    key={candidate.candidate_id ?? candidate.candidate}
                    className="list-none py-3 first:pt-0 last:pb-0"
                  >
                    <p className="m-0 text-ui font-semibold text-text-primary">
                      {candidate.candidate}
                    </p>
                    <p className="m-0 mt-1 text-detail text-text-muted">
                      {candidate.reason}
                    </p>
                    {candidate.reason ===
                      "For mange i komiteen har meldt inhabilitet." &&
                      (() => {
                        const conflictedInterviewers = interviewers
                          .filter((interviewer) =>
                            interviewer.biased.includes(candidate.candidate_id),
                          )
                          .map((interviewer) => interviewer.name);
                        if (conflictedInterviewers.length === 0) return null;
                        const label = `Se ${conflictedInterviewers.length} registrerte inhabilitet${
                          conflictedInterviewers.length === 1 ? "" : "er"
                        }`;
                        return (
                          <details className="group mt-2 text-detail">
                            <summary
                              title={conflictedInterviewers.join(", ")}
                              className={`w-fit cursor-pointer font-semibold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand ${keyboardFocusRingClass}`}
                            >
                              {label}
                            </summary>
                            <p className="m-0 mt-1 text-text-muted">
                              {conflictedInterviewers.join(", ")}
                            </p>
                          </details>
                        );
                      })()}
                  </li>
                ))}
              </ul>
            </SchedulePanelBody>
            <SchedulePanelFooter className="sticky bottom-0 z-10 bg-surface-base">
              <span className="text-detail font-semibold text-text-muted">
                Planutkastet er lagret med {placementCount} av{" "}
                {totalCandidateCount} plassert.
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPlacementStageDismissed(true)}
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  Se resten av utkastet
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlacementStageDismissed(true);
                    onEditByHand();
                  }}
                  data-cy="schedule-stage-hand-edit"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  Rediger for hånd
                </button>
                <button
                  type="button"
                  onClick={() => setRegenerationOpen(true)}
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  Juster og prøv igjen
                </button>
                {canExtendDay ? (
                  <button
                    type="button"
                    onClick={extendDay}
                    disabled={
                      session.loading ||
                      (!syntheticInput &&
                        (!persistence.isSaved ||
                          persistence.isSaving ||
                          persistence.hasConflict))
                    }
                    data-cy="schedule-stage-primary-action"
                    data-extend-day="true"
                    className={cn(actionButtonBase, actionButtonPrimary)}
                  >
                    {session.loading
                      ? "Beregner…"
                      : `Planlegg neste dag (${formatAccessibleDate(
                          nextScopeDate ?? "",
                        )})`}
                    {!session.loading && (
                      <ArrowRight size={iconSizes.medium} aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onWidenDays}
                    data-cy="schedule-stage-primary-action"
                    className={cn(actionButtonBase, actionButtonPrimary)}
                  >
                    Utvid med flere dager
                    <ArrowRight size={iconSizes.medium} aria-hidden="true" />
                  </button>
                )}
              </div>
            </SchedulePanelFooter>
          </SchedulePanel>
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
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-ui font-semibold text-text-primary">
            <Lock size={iconSizes.small} aria-hidden="true" />
            Publisert t.o.m. {formatAccessibleDate(distributedThroughDate)}
            {publishedDayLocks?.length
              ? ` – ${publishedDayLocks.length} intervjuer er låst.`
              : "."}
          </p>
          <p className="m-0 mt-1 text-detail leading-relaxed text-text-muted">
            {unplannedCandidateCount === null
              ? "Kjør planleggingen på nytt for å plassere de resterende kandidatene – de publiserte dagene flyttes ikke."
              : `${unplannedCandidateCount} ${
                  unplannedCandidateCount === 1
                    ? "kandidat venter"
                    : "kandidater venter"
                } på intervju. Planlegg resten når du er klar – de publiserte dagene holdes uendret.`}
          </p>
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
    </div>
  );
}
