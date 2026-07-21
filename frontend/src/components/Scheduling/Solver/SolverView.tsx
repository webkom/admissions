import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarCheck } from "lucide-react";

import type {
  Candidate,
  EnabledWindow,
  Interviewer,
  RepairStrategy,
} from "../types";
import { buildSolveBlocks, slotsToSolverAvailability } from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonPrimary,
} from "../ui";
import cn from "../../../utils/cn";
import { deriveAssignmentConflictSummary } from "./assignmentConflicts";
import { hasSchedule } from "./solverHelpers";
import RepairScenarioPanel from "./RepairScenarioPanel";
import { buildRepairScenario, type RepairScenario } from "./repairScenarios";
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
  candidateScopeResolved: boolean;
  availabilityReady: boolean;
  syntheticInput?: boolean;
  editRequestKey: number;
  onOpenAvailability: () => void;
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
  candidateScopeResolved,
  availabilityReady,
  syntheticInput = false,
  editRequestKey,
  onOpenAvailability,
  onOpenPlan,
}: Props) {
  const [repairScenarios, setRepairScenarios] = useState<RepairScenario[]>([]);
  const [selectedRepairStrategy, setSelectedRepairStrategy] =
    useState<RepairStrategy>("balanced");
  const [selectedScenarioStrategy, setSelectedScenarioStrategy] =
    useState<RepairStrategy>();
  const [runningRepairStrategy, setRunningRepairStrategy] =
    useState<RepairStrategy>();
  const [repairError, setRepairError] = useState("");
  const session = useSolverSession({
    admissionSlug,
    candidates,
    interviewers,
    dates,
    sessionDuration,
    enabledSlots,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    chunkBreakMinutes,
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
      panelSize: session.panelSize,
      solverOptions: session.solverOptions,
    }),
    [
      admissionSlug,
      chunkBreakMinutes,
      chunkSize,
      dayEndMinute,
      dayStartMinute,
      enabledSlots,
      enabledWindows,
      endDate,
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

  useEffect(() => {
    setSelectedRepairStrategy(session.solverOptions.repair_strategy);
  }, [session.solverOptions.repair_strategy]);

  const solveBlocks = useMemo(() => {
    const openSlots = new Set(
      slotsToSolverAvailability(enabledSlots, dates, sessionDuration),
    );
    return buildSolveBlocks({
      dates,
      dayStartMinute,
      dayEndMinute,
      sessionDuration,
      chunkSize,
      chunkBreakMinutes,
    })
      .map((block) => block.filter((slot) => openSlots.has(slot)))
      .filter((block) => block.length > 0);
  }, [
    chunkBreakMinutes,
    chunkSize,
    dates,
    dayEndMinute,
    dayStartMinute,
    enabledSlots,
    sessionDuration,
  ]);
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
    setSelectedScenarioStrategy(undefined);
    setRepairError("");
  }, [repairBaselineKey]);

  const solvePlan = () => {
    void session.solvePlan(draft.lockedAssignments);
  };
  const retryWithAvailabilityDeviation = () => {
    void session.solvePlan(draft.lockedAssignments, { allowOvertime: true });
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
    const outcome = await session.solvePlan(locksWithoutCurrentConflicts(), {
      mode: "repair",
      repairStrategy: strategy,
      previewOnly: true,
    });
    setRunningRepairStrategy(undefined);
    if (repairBaselineKeyRef.current !== baselineKey) {
      setRepairError("Planen ble endret. Beregn løsningene på nytt.");
      return null;
    }
    if (
      !outcome ||
      outcome === "access-failure" ||
      !hasSchedule(outcome.status)
    ) {
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
    setSelectedScenarioStrategy(strategy);
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
    session.applyRepairPreview(scenario.result, scenario.strategy);
  };
  const selectRepairStrategy = (strategy: RepairStrategy) => {
    setSelectedRepairStrategy(strategy);
    setSelectedScenarioStrategy(
      repairScenarios.some((scenario) => scenario.strategy === strategy)
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
      {hasProposal && assignmentConflicts.assignmentCount > 0 && (
        <RepairScenarioPanel
          conflictCount={assignmentConflicts.assignmentCount}
          selectedStrategy={selectedRepairStrategy}
          onSelectedStrategyChange={selectRepairStrategy}
          scenarios={repairScenarios}
          selectedScenario={selectedRepairScenario}
          onSelectScenario={setSelectedScenarioStrategy}
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
          onOpenPlan={onOpenPlan}
        />
      )}
      <SolverSetupPanel
        interviewerCount={interviewers.length}
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
        result={session.scopedResult}
        elapsedMs={session.elapsedMs}
        jobStatus={session.jobStatus}
        estimatedSeconds={session.estimatedSeconds}
        lockedCount={draft.presentation.lockedCount}
        hasProposal={hasProposal}
        editRequestKey={editRequestKey}
        onSolve={solvePlan}
        onCancel={() => void session.cancel()}
        onRetryWithAvailabilityDeviation={retryWithAvailabilityDeviation}
        onOpenAvailability={onOpenAvailability}
      />
    </div>
  );
}
