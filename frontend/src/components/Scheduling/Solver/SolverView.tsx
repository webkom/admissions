import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowRight, Sparkles } from "lucide-react";

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
  buildSolveBlocks,
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
  onOpenConflictReview: () => void;
  onOpenPlan: () => void;
}

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionSlug,
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
  onOpenConflictReview,
  onOpenPlan,
}: Props) {
  const [regenerationOpen, setRegenerationOpen] = useState(false);
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
    onModify: session.markDraftModified,
  });
  const persistenceConfig = useMemo(
    () => ({
      admissionSlug,
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
    onConflict: session.markDraftConflict,
    onRevisionSaved: session.markDraftRevisionSaved,
    onSaved: (revision) => {
      session.markDraftSaved(revision);
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
    void session.solvePlan(draft.lockedAssignments);
  };
  const retryWithAvailabilityDeviation = () => {
    void session.solvePlan(draft.lockedAssignments, {
      availabilityFallback: "propose",
    });
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
    isPublished: Boolean(session.savedSchedule?.is_distributed),
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
      blockRestPreferenceEnabled={
        session.proposalSolverOptions?.avoid_consecutive_interviewer_blocks ??
        null
      }
      panelSize={session.panelSize}
      proposalStrategy={
        session.proposalSolverOptions?.initial_strategy ??
        session.solverOptions.initial_strategy
      }
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
      onOpenConflictReview={onOpenConflictReview}
      onOpenRepair={() => {
        setRepairOpen(true);
        setRepairFocusRequest((request) => request + 1);
      }}
      onRetrySolve={solvePlan}
      onOpenPlan={onOpenPlan}
      onPreviewWithAvailabilityDeviation={retryWithAvailabilityDeviation}
      previewLoading={session.loading}
      backgroundMode={backgroundMode}
    />
  );

  if (session.savedSchedule?.is_distributed) {
    return (
      <PublishedPlanNotice
        stage={planDraftStage.kind}
        title={planDraftStage.title}
        description={planDraftStage.description}
        onOpenPlan={onOpenPlan}
      />
    );
  }

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
                </li>
              ))}
            </ul>
          </SchedulePanelBody>
          <SchedulePanelFooter className="sticky bottom-0 z-10 bg-surface-base">
            <span className="text-detail font-semibold text-text-muted">
              Resten av utkastet er beholdt.
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
                onClick={() => setRegenerationOpen(true)}
                data-cy="schedule-stage-primary-action"
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                Juster og prøv igjen
                <ArrowRight size={iconSizes.medium} aria-hidden="true" />
              </button>
            </div>
          </SchedulePanelFooter>
        </SchedulePanel>
      </DraftTaskLayout>
    );
  }

  return renderDraftCanvas();
}
