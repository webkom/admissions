import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarCheck, ChevronDown, Sparkles } from "lucide-react";

import type {
  Candidate,
  EnabledWindow,
  Interviewer,
  ManualScheduleBlock,
  RepairStrategy,
  ScheduleBlockMode,
  SlotOverride,
} from "../types";
import {
  buildSolveBlocks,
  formatSlotLabel,
  manualBlocksToSolverBlocks,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";
import cn from "../../../utils/cn";
import { deriveAssignmentConflictSummary } from "./assignmentConflicts";
import { hasSchedule } from "./solverHelpers";
import RepairScenarioPanel from "./RepairScenarioPanel";
import {
  buildRepairPreviewOptions,
  buildRepairScenario,
  type RepairScenario,
} from "./repairScenarios";
import SolverResults from "./SolverResults";
import SolverSetupPanel from "./SolverSetupPanel";
import { useScheduleDraft } from "./useScheduleDraft";
import { useScheduleDraftPersistence } from "./useScheduleDraftPersistence";
import { useSolverSession } from "./useSolverSession";

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
  onOpenAvailability,
  onOpenFramework,
  onOpenConflictReview,
  onOpenPlan,
}: Props) {
  const [generationSettingsRequestKey, setGenerationSettingsRequestKey] =
    useState(0);
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
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
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
    onSaved: (revision) => {
      session.markDraftSaved(revision);
    },
  });

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
  const locksWithoutCurrentConflicts = () =>
    draft.lockedAssignments.filter((assignment) =>
      assignment.candidate_id
        ? !assignmentConflicts.affectedCandidateIds.has(assignment.candidate_id)
        : !assignmentConflicts.affectedCandidateNames.has(assignment.candidate),
    );
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
    const outcome = await session.solvePlan(
      locksWithoutCurrentConflicts(),
      buildRepairPreviewOptions(strategy),
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
  const pendingProposalIsStale = Boolean(
    pendingProposal &&
      session.savedSchedule?.updated_at !== pendingProposal.baseRevision,
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

  if (session.savedSchedule?.is_distributed) {
    return (
      <SchedulePanel>
        <SchedulePanelBody className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-success-bg text-success">
              <CalendarCheck size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="m-0 text-sm font-bold text-text-primary">
                Planen er publisert
              </h2>
              <p className="m-0 mt-0.5 text-ui text-text-muted">
                Planen håndteres i Intervjuplan. Lås den opp der for å gjøre
                endringer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenPlan}
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            Åpne intervjuplan
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </SchedulePanelBody>
      </SchedulePanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {repairAvailable && (
        <RepairScenarioPanel
          open={repairOpen}
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
      )}
      {pendingProposal && (
        <SchedulePanel dataCy="candidate-proposal" className="animate-fade-in">
          <SchedulePanelBody className="space-y-4 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="m-0 text-sm font-bold text-text-primary">
                    Nytt forslag er klart
                  </h2>
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Det gjeldende utkastet er ikke endret. Se forskjellen og
                    velg om du vil bruke forslaget.
                  </p>
                  {pendingProposalExpiry && !pendingProposalHasExpired && (
                    <p className="m-0 mt-1 text-label text-text-subtle">
                      Forslaget lagres til {pendingProposalExpiry}.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-detail tabular-nums text-text-muted">
                <span>
                  <strong className="text-text-primary">
                    {pendingProposal.result.schedule.length}
                  </strong>{" "}
                  planlagt
                </span>
                <span>
                  <strong className="text-text-primary">
                    {pendingUnplaced}
                  </strong>{" "}
                  uten plass
                </span>
                <span>
                  <strong className="text-text-primary">
                    {pendingOutsideAvailability}
                  </strong>{" "}
                  utenfor tilgjengelighet
                </span>
              </div>
            </div>

            <button
              type="button"
              aria-expanded={proposalDetailsOpen}
              onClick={() => setProposalDetailsOpen((open) => !open)}
              className="flex items-center gap-1 text-detail font-semibold text-brand hover:underline"
            >
              {proposalDetailsOpen ? "Skjul forslag" : "Se forslaget"}
              <ChevronDown
                size={15}
                aria-hidden="true"
                className={cn(
                  "transition-transform",
                  proposalDetailsOpen && "rotate-180",
                )}
              />
            </button>

            {proposalDetailsOpen && (
              <div className="max-h-72 overflow-auto rounded-lg border border-border-soft">
                <table className="w-full border-collapse text-left text-detail">
                  <thead className="sticky top-0 bg-surface-subtle text-text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Tid</th>
                      <th className="px-3 py-2 font-semibold">Søker</th>
                      <th className="px-3 py-2 font-semibold">Panel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pendingProposal.result.schedule]
                      .sort((left, right) => left.time - right.time)
                      .map((item) => (
                        <tr
                          key={`${item.candidate_id ?? item.candidate}-${item.time}`}
                          className="border-t border-border-faint"
                        >
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-text-muted">
                            {formatSlotLabel(item.time, dates, sessionDuration)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-text-primary">
                            {item.candidate}
                          </td>
                          <td className="px-3 py-2 text-text-muted">
                            {item.panel.map((member) => member.name).join(", ")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {pendingProposalIsStale && (
              <p className="m-0 text-detail font-semibold text-danger">
                Utkastet er endret etter beregningen. Forkast forslaget og
                generer et nytt.
              </p>
            )}
            {pendingProposalHasExpired && (
              <p className="m-0 text-detail font-semibold text-danger">
                Forslaget har utløpt. Forkast det og generer et nytt.
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={session.proposalActionLoading}
                onClick={() => void session.discardPendingProposal()}
                className={cn(actionButtonBase, actionButtonNeutral)}
              >
                Forkast forslag
              </button>
              <button
                type="button"
                disabled={
                  session.proposalActionLoading ||
                  pendingProposalIsStale ||
                  pendingProposalHasExpired
                }
                onClick={() => void session.applyPendingProposal()}
                className={cn(actionButtonBase, actionButtonPrimary)}
              >
                Bruk dette forslaget
              </button>
            </div>
          </SchedulePanelBody>
        </SchedulePanel>
      )}
      <SolverSetupPanel
        interviewerCount={interviewers.length}
        experiencedInterviewerCount={
          interviewers.filter(
            (interviewer) => interviewer.experience_level === "experienced",
          ).length
        }
        solverOptions={session.solverOptions}
        onSolverOptionsChange={session.setSolverOptions}
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
        openRequestKey={generationSettingsRequestKey}
        onSolve={solvePlan}
        onCancel={() => void session.cancel()}
        onOpenAvailability={onOpenAvailability}
        onOpenFramework={onOpenFramework}
        onOpenConflictReview={onOpenConflictReview}
      />
      {hasProposal && (
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
          assignmentConflicts={assignmentConflicts}
          blockRestPreferenceEnabled={
            session.proposalSolverOptions
              ?.avoid_consecutive_interviewer_blocks ?? null
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
          onOpenSettings={() =>
            setGenerationSettingsRequestKey((key) => key + 1)
          }
          onOpenConflictReview={onOpenConflictReview}
          onOpenRepair={() => {
            setRepairOpen(true);
            setRepairFocusRequest((request) => request + 1);
          }}
          onRetrySolve={solvePlan}
          onOpenPlan={onOpenPlan}
          onPreviewWithAvailabilityDeviation={retryWithAvailabilityDeviation}
          previewLoading={session.loading}
        />
      )}
    </div>
  );
}
