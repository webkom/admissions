import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSavedSchedule } from "../../../query/hooks";
import type {
  Candidate,
  Interviewer,
  RepairStrategy,
  ScheduleItem,
  SolverOptions,
} from "../types";
import {
  buildLockedAssignments,
  buildSolveBlocks,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import {
  DEFAULT_SOLVER_OPTIONS,
  estimateSolverSeconds,
  normalizeSolverOptions,
  type SolveResponse,
} from "./solverHelpers";
import { deriveSolverReadiness } from "./solverSelectors";
import { useSolveJob } from "./useSolveJob";

interface UseSolverSessionParams {
  admissionSlug: string;
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  syntheticInput: boolean;
  candidateScopeResolved: boolean;
}

export const useSolverSession = ({
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
  syntheticInput,
  candidateScopeResolved,
}: UseSolverSessionParams) => {
  const [panelSize, setPanelSize] = useState(3);
  const [solverOptions, setSolverOptions] = useState<SolverOptions>(
    DEFAULT_SOLVER_OPTIONS,
  );
  const [solveTick, setSolveTick] = useState(0);
  const solveJob = useSolveJob(admissionSlug);
  const { data: savedSchedule, error: savedScheduleError } =
    useSavedSchedule(admissionSlug);
  const [draftBaseRevision, setDraftBaseRevision] = useState<string | null>(
    null,
  );
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [remoteRevisionChanged, setRemoteRevisionChanged] = useState(false);
  const syncedRevisionRef = useRef<string | null>(null);
  const draftBaseRevisionRef = useRef<string | null>(null);
  const hasLocalDraftRef = useRef(false);
  const handledAccessFailureRef = useRef<unknown>(null);
  const seededFromSavedRef = useRef(false);
  const accessFailureStatus = savedScheduleError?.response?.status ?? 0;
  const candidateSignature = useMemo(
    () =>
      candidates
        .map(({ id }) => id)
        .sort()
        .join("|"),
    [candidates],
  );
  const currentCandidateIds = useMemo(
    () => new Set(candidates.map(({ id }) => id)),
    [candidateSignature, candidates],
  );
  const uniqueCandidateIdsByName = useMemo(() => {
    const idsByName = new Map<string, string[]>();
    candidates.forEach((candidate) => {
      idsByName.set(candidate.name, [
        ...(idsByName.get(candidate.name) ?? []),
        candidate.id,
      ]);
    });
    return new Map(
      Array.from(idsByName.entries())
        .filter(([, ids]) => ids.length === 1)
        .map(([name, ids]) => [name, ids[0]]),
    );
  }, [candidates]);
  const isCurrentCandidate = useCallback(
    (item: Pick<ScheduleItem, "candidate_id" | "candidate">) => {
      if (item.candidate_id) return currentCandidateIds.has(item.candidate_id);
      return uniqueCandidateIdsByName.has(item.candidate);
    },
    [currentCandidateIds, uniqueCandidateIdsByName],
  );
  const resultMatchesCandidateScope = useCallback(
    (result: NonNullable<typeof solveJob.result>) =>
      result.schedule.every(isCurrentCandidate) &&
      (result.unplaceable ?? []).every(isCurrentCandidate),
    [isCurrentCandidate],
  );
  const scopedResult = useMemo(
    () =>
      candidateScopeResolved &&
      solveJob.result &&
      resultMatchesCandidateScope(solveJob.result)
        ? solveJob.result
        : null,
    [candidateScopeResolved, resultMatchesCandidateScope, solveJob.result],
  );

  const resetDraftTracking = useCallback((revision: string | null) => {
    draftBaseRevisionRef.current = revision;
    hasLocalDraftRef.current = false;
    setDraftBaseRevision(revision);
    setHasLocalDraft(false);
    setRemoteRevisionChanged(false);
  }, []);

  const markDraftModified = useCallback(() => {
    if (hasLocalDraftRef.current) return;
    const revision = savedSchedule?.updated_at ?? syncedRevisionRef.current;
    draftBaseRevisionRef.current = revision;
    hasLocalDraftRef.current = true;
    setDraftBaseRevision(revision);
    setHasLocalDraft(true);
    setRemoteRevisionChanged(false);
  }, [savedSchedule?.updated_at]);

  const markDraftSaved = useCallback(
    (revision: string) => {
      syncedRevisionRef.current = revision;
      resetDraftTracking(revision);
    },
    [resetDraftTracking],
  );

  const markDraftConflict = useCallback(() => {
    setRemoteRevisionChanged(true);
  }, []);

  const revealSavedSchedule = useCallback(() => {
    if (
      !candidateScopeResolved ||
      !savedSchedule?.schedule.length ||
      !savedSchedule.schedule.every(isCurrentCandidate)
    ) {
      return false;
    }
    solveJob.setResult({
      status: "SUCCESS",
      schedule: savedSchedule.schedule,
      optimal: true,
      unplaceable: [],
      locked_conflicts: [],
    });
    solveJob.setPlanRevealed(true);
    return true;
  }, [
    candidateScopeResolved,
    isCurrentCandidate,
    savedSchedule,
    solveJob.setPlanRevealed,
    solveJob.setResult,
  ]);

  const restoreSavedProposal = useCallback(() => {
    if (hasLocalDraftRef.current || !revealSavedSchedule()) return false;
    const revision = savedSchedule?.updated_at ?? null;
    syncedRevisionRef.current = revision;
    resetDraftTracking(revision);
    return true;
  }, [resetDraftTracking, revealSavedSchedule, savedSchedule?.updated_at]);

  useEffect(() => {
    if (accessFailureStatus === 404) {
      const previousRevision = syncedRevisionRef.current;
      syncedRevisionRef.current = null;
      seededFromSavedRef.current = false;
      if (hasLocalDraftRef.current && draftBaseRevisionRef.current !== null) {
        setRemoteRevisionChanged(true);
      } else if (!hasLocalDraftRef.current && previousRevision !== null) {
        resetDraftTracking(null);
        solveJob.reset();
      }
      return;
    }
    if (![401, 403].includes(accessFailureStatus)) {
      if (savedSchedule) handledAccessFailureRef.current = null;
      return;
    }
    if (handledAccessFailureRef.current === savedScheduleError) return;
    handledAccessFailureRef.current = savedScheduleError;
    syncedRevisionRef.current = null;
    seededFromSavedRef.current = false;
    resetDraftTracking(null);
    solveJob.reset();
  }, [
    accessFailureStatus,
    resetDraftTracking,
    savedSchedule,
    savedScheduleError,
    solveJob.reset,
  ]);

  useEffect(() => {
    const restoredRevision = solveJob.restoredDraftBaseRevision;
    if (
      restoredRevision === undefined ||
      [401, 403].includes(accessFailureStatus)
    ) {
      return;
    }
    if (hasLocalDraftRef.current) {
      solveJob.consumeRestoredDraft();
      return;
    }
    draftBaseRevisionRef.current = restoredRevision;
    hasLocalDraftRef.current = true;
    setDraftBaseRevision(restoredRevision);
    setHasLocalDraft(true);
    setRemoteRevisionChanged(
      Boolean(savedSchedule && savedSchedule.updated_at !== restoredRevision),
    );
    solveJob.consumeRestoredDraft();
  }, [
    accessFailureStatus,
    savedSchedule,
    solveJob.consumeRestoredDraft,
    solveJob.restoredDraftBaseRevision,
  ]);

  useEffect(() => {
    if (!candidateScopeResolved || !solveJob.result) return;
    if (resultMatchesCandidateScope(solveJob.result)) return;
    resetDraftTracking(savedSchedule?.updated_at ?? null);
    solveJob.reset();
  }, [
    candidateScopeResolved,
    resultMatchesCandidateScope,
    resetDraftTracking,
    savedSchedule?.updated_at,
    solveJob.reset,
    solveJob.result,
  ]);

  useEffect(() => {
    if (!savedSchedule) return;
    const savedIsCurrent =
      savedSchedule.schedule.length > 0 &&
      savedSchedule.schedule.every(isCurrentCandidate);
    const firstSync = syncedRevisionRef.current === null;
    const revisionChanged =
      syncedRevisionRef.current !== savedSchedule.updated_at;
    syncedRevisionRef.current = savedSchedule.updated_at;

    if (hasLocalDraftRef.current) {
      setRemoteRevisionChanged(
        draftBaseRevisionRef.current !== savedSchedule.updated_at,
      );
      return;
    }

    resetDraftTracking(savedSchedule.updated_at);

    if (firstSync) {
      if (!solveJob.result && savedIsCurrent) revealSavedSchedule();
      return;
    }

    if (revisionChanged) {
      solveJob.reset();
      if (savedIsCurrent) revealSavedSchedule();
    } else if (!solveJob.result && savedIsCurrent) {
      revealSavedSchedule();
    }
  }, [
    candidateSignature,
    isCurrentCandidate,
    resetDraftTracking,
    revealSavedSchedule,
    savedSchedule,
    solveJob.reset,
    solveJob.result,
    solveJob.setPlanRevealed,
    solveJob.setResult,
  ]);

  useEffect(() => {
    if (!savedSchedule || seededFromSavedRef.current) return;
    seededFromSavedRef.current = true;
    if (typeof savedSchedule.panel_size === "number") {
      setPanelSize(savedSchedule.panel_size);
    }
    if (savedSchedule.solver_options) {
      setSolverOptions(normalizeSolverOptions(savedSchedule.solver_options));
    }
  }, [savedSchedule]);

  const readiness = useMemo(
    () =>
      deriveSolverReadiness({
        candidateCount: candidates.length,
        interviewers,
        panelSize,
        enabledSlots,
        dates,
        sessionDuration,
        allowOvertime: solverOptions.allow_overtime,
      }),
    [
      candidates.length,
      dates,
      enabledSlots,
      interviewers,
      panelSize,
      sessionDuration,
      solverOptions.allow_overtime,
    ],
  );
  const estimatedSeconds = useMemo(
    () =>
      estimateSolverSeconds(
        candidates.length,
        interviewers.length,
        readiness.enabledSlotCount,
        panelSize,
        solverOptions.prioritize_continuity,
        solverOptions.max_solver_seconds,
      ),
    [
      candidates.length,
      interviewers.length,
      panelSize,
      readiness.enabledSlotCount,
      solverOptions.max_solver_seconds,
      solverOptions.prioritize_continuity,
    ],
  );

  const solvePlan = useCallback(
    async (
      lockedAssignments: ReturnType<typeof buildLockedAssignments>,
      {
        mode = "initial",
        repairStrategy,
        previewOnly = false,
        allowOvertime,
      }: {
        mode?: "initial" | "repair";
        repairStrategy?: RepairStrategy;
        previewOnly?: boolean;
        allowOvertime?: boolean;
      } = {},
    ) => {
      if (!readiness.ready) {
        solveJob.setError(
          "Tidsoppsettet må ha nok intervjuere og åpne luker for hele panelet.",
        );
        return null;
      }

      const runOptions: SolverOptions = {
        ...solverOptions,
        repair_strategy: repairStrategy ?? solverOptions.repair_strategy,
        repair_mode: mode === "repair",
        ...(allowOvertime === undefined
          ? {}
          : { allow_overtime: allowOvertime }),
      };
      if (!previewOnly) {
        setSolverOptions(runOptions);
        markDraftModified();
        setSolveTick((tick) => tick + 1);
      }
      if (!previewOnly) {
        solveJob.setPlanRevealed(Boolean(lockedAssignments.length));
      }
      const allSlots = slotsToSolverAvailability(
        enabledSlots,
        dates,
        sessionDuration,
      );
      const openSlots = new Set(allSlots);
      const blocks = buildSolveBlocks({
        dates,
        dayStartMinute,
        dayEndMinute,
        sessionDuration,
        chunkSize,
        chunkBreakMinutes,
      })
        .map((block) => block.filter((slot) => openSlots.has(slot)))
        .filter((block) => block.length > 0);
      const lockedIds = lockedAssignments.map((assignment) => ({
        candidate_id: assignment.candidate_id,
        time: assignment.time,
        panel: assignment.panel.map((member) => ({ id: member.id })),
      }));

      const outcome = await solveJob.solve(
        syntheticInput
          ? {
              admission_slug: admissionSlug,
              candidates,
              interviewers,
              panel_size: panelSize,
              all_slots: allSlots,
              blocks,
              options: runOptions,
              synthetic: true,
              ...(lockedAssignments.length > 0
                ? { locked_assignments: lockedAssignments }
                : {}),
            }
          : {
              admission_slug: admissionSlug,
              candidates: candidates.map(({ id }) => ({ id })),
              interviewers: interviewers.map(({ id }) => ({ id })),
              panel_size: panelSize,
              options: runOptions,
              ...(mode === "repair" && savedSchedule?.updated_at
                ? { baseline_updated_at: savedSchedule.updated_at }
                : {}),
              ...(lockedIds.length > 0
                ? { locked_assignments: lockedIds }
                : {}),
            },
        draftBaseRevisionRef.current,
        { applyResult: !previewOnly },
      );
      if (outcome === "access-failure") {
        syncedRevisionRef.current = null;
        resetDraftTracking(null);
        return null;
      }
      return outcome;
    },
    [
      admissionSlug,
      candidates,
      chunkBreakMinutes,
      chunkSize,
      dates,
      dayEndMinute,
      dayStartMinute,
      enabledSlots,
      interviewers,
      markDraftModified,
      panelSize,
      readiness.ready,
      resetDraftTracking,
      savedSchedule?.updated_at,
      sessionDuration,
      solveJob.setError,
      solveJob.setPlanRevealed,
      solveJob.solve,
      solverOptions,
      syntheticInput,
    ],
  );

  const applyRepairPreview = useCallback(
    (result: SolveResponse, repairStrategy: RepairStrategy) => {
      const nextOptions: SolverOptions = {
        ...solverOptions,
        repair_strategy: repairStrategy,
        repair_mode: true,
      };
      setSolverOptions(nextOptions);
      markDraftModified();
      setSolveTick((tick) => tick + 1);
      solveJob.setResult(result);
      solveJob.setPlanRevealed(true);
    },
    [
      markDraftModified,
      solveJob.setPlanRevealed,
      solveJob.setResult,
      solverOptions,
    ],
  );

  const pendingRestoredRevision = hasLocalDraft
    ? undefined
    : solveJob.restoredDraftBaseRevision;
  const effectiveDraftBaseRevision =
    pendingRestoredRevision === undefined
      ? draftBaseRevision
      : pendingRestoredRevision;
  const effectiveHasLocalDraft =
    hasLocalDraft || pendingRestoredRevision !== undefined;
  const effectiveRemoteRevisionChanged =
    remoteRevisionChanged ||
    Boolean(
      pendingRestoredRevision !== undefined &&
        savedSchedule &&
        savedSchedule.updated_at !== pendingRestoredRevision,
    );

  return {
    ...solveJob,
    scopedResult,
    savedSchedule,
    panelSize,
    setPanelSize,
    solverOptions,
    setSolverOptions,
    readiness,
    estimatedSeconds,
    solveTick,
    solvePlan,
    applyRepairPreview,
    draftBaseRevision: effectiveDraftBaseRevision,
    hasLocalDraft: effectiveHasLocalDraft,
    remoteRevisionChanged: effectiveRemoteRevisionChanged,
    markDraftModified,
    markDraftSaved,
    markDraftConflict,
    restoreSavedProposal,
  };
};
