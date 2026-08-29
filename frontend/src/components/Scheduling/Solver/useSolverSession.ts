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
  decodeScheduleTime,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import {
  DEFAULT_SOLVER_OPTIONS,
  estimateSolverSeconds,
  hasSchedule,
  normalizeSolverOptions,
  type SolveResponse,
} from "./solverHelpers";
import { deriveSolverReadiness } from "./solverSelectors";
import { useSolveJob } from "./useSolveJob";

interface UseSolverSessionParams {
  admissionSlug: string;
  groupId: string;
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  enabledSlots: Set<string>;
  canonicalBlocks: number[][];
  syntheticInput: boolean;
  candidateScopeResolved: boolean;
}

export const useSolverSession = ({
  admissionSlug,
  groupId,
  candidates,
  interviewers,
  dates,
  sessionDuration,
  enabledSlots,
  canonicalBlocks,
  syntheticInput,
  candidateScopeResolved,
}: UseSolverSessionParams) => {
  const [panelSize, setPanelSize] = useState(3);
  const [solverOptions, setSolverOptions] = useState<SolverOptions>(
    DEFAULT_SOLVER_OPTIONS,
  );
  // Partial-plan scope: how many of the framework's plannable days the
  // solve should cover. null means "all of them" - the framework grid is
  // untouched, so nobody's availability answer is invalidated by solving
  // a few days at a time and extending later.
  const [dayCount, setDayCount] = useState<number | null>(null);
  const [proposalSolverOptions, setProposalSolverOptions] =
    useState<SolverOptions | null>(null);
  const [pendingProposalSolverOptions, setPendingProposalSolverOptions] =
    useState<SolverOptions | null>(null);
  const [solveTick, setSolveTick] = useState(0);
  const solveJob = useSolveJob(admissionSlug, groupId);
  const { data: savedSchedule, error: savedScheduleError } = useSavedSchedule(
    admissionSlug,
    groupId,
  );
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

  const markDraftRevisionSaved = useCallback((revision: string) => {
    syncedRevisionRef.current = revision;
    draftBaseRevisionRef.current = revision;
    setDraftBaseRevision(revision);
    setRemoteRevisionChanged(false);
  }, []);

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
    const scheduledCandidateIds = new Set(
      savedSchedule.schedule.flatMap((item) => {
        if (item.candidate_id) return [item.candidate_id];
        const candidateId = uniqueCandidateIdsByName.get(item.candidate);
        return candidateId ? [candidateId] : [];
      }),
    );
    const unplaceable = candidates
      .filter((candidate) => !scheduledCandidateIds.has(candidate.id))
      .map((candidate) => ({
        candidate_id: candidate.id,
        candidate: candidate.name,
        reason: "Ikke nok intervjukapasitet i de åpne tidslukene.",
      }));
    solveJob.setResult({
      status: unplaceable.length > 0 ? "PARTIAL" : "SUCCESS",
      schedule: savedSchedule.schedule,
      unplaceable,
      locked_conflicts: [],
    });
    setProposalSolverOptions(
      normalizeSolverOptions(savedSchedule.solver_options ?? {}),
    );
    solveJob.setPlanRevealed(true);
    return true;
  }, [
    candidateScopeResolved,
    candidates,
    isCurrentCandidate,
    savedSchedule,
    solveJob.setPlanRevealed,
    solveJob.setResult,
    uniqueCandidateIdsByName,
  ]);

  const restoreSavedProposal = useCallback(() => {
    if (hasLocalDraftRef.current || !revealSavedSchedule()) return false;
    const revision = savedSchedule?.updated_at ?? null;
    syncedRevisionRef.current = revision;
    resetDraftTracking(revision);
    return true;
  }, [resetDraftTracking, revealSavedSchedule, savedSchedule?.updated_at]);
  const discardCurrentSuggestion = useCallback(() => {
    solveJob.reset();
    if (!savedSchedule?.schedule.length || !revealSavedSchedule()) {
      resetDraftTracking(null);
      return;
    }
    resetDraftTracking(savedSchedule.updated_at);
  }, [
    resetDraftTracking,
    revealSavedSchedule,
    savedSchedule?.schedule.length,
    savedSchedule?.updated_at,
    solveJob.reset,
  ]);

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
      if (!solveJob.pendingProposal) solveJob.reset();
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
    solveJob.pendingProposal,
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

  const plannableDates = useMemo(() => {
    const datesWithSlots = new Set(
      Array.from(enabledSlots, (key) => key.slice(0, key.lastIndexOf("|"))),
    );
    return dates.filter((date) => datesWithSlots.has(date));
  }, [dates, enabledSlots]);
  const effectiveDayCount = Math.min(
    dayCount ?? plannableDates.length,
    plannableDates.length,
  );
  const scopedDates = useMemo(
    () => plannableDates.slice(0, effectiveDayCount),
    [effectiveDayCount, plannableDates],
  );
  const scopedEnabledSlots = useMemo(() => {
    const scopedDateSet = new Set(scopedDates);
    if (scopedDateSet.size === plannableDates.length) return enabledSlots;
    return new Set(
      Array.from(enabledSlots).filter((key) =>
        scopedDateSet.has(key.slice(0, key.lastIndexOf("|"))),
      ),
    );
  }, [enabledSlots, plannableDates.length, scopedDates]);
  const isDayScoped = scopedDates.length < plannableDates.length;
  // The default scope is the saved plan's own extent: a page reload in the
  // middle of the widen-days loop must land back on "the next day can be
  // planned", not on all days. Explicit choices (including "Alle dager")
  // are never overwritten.
  const dayScopeSeededRef = useRef(false);
  useEffect(() => {
    if (dayScopeSeededRef.current || !savedSchedule) return;
    if (plannableDates.length === 0) return;
    dayScopeSeededRef.current = true;
    const rows = savedSchedule.schedule ?? [];
    if (rows.length === 0) return;
    let lastDate: string | null = null;
    rows.forEach((item) => {
      if (!Number.isFinite(item.time)) return;
      const date =
        dates[decodeScheduleTime(item.time, sessionDuration).dayIndex];
      if (date && (lastDate === null || date > lastDate)) lastDate = date;
    });
    if (!lastDate) return;
    const index = plannableDates.indexOf(lastDate);
    if (index === -1 || index + 1 >= plannableDates.length) return;
    setDayCount(index + 1);
  }, [dates, plannableDates, savedSchedule, sessionDuration]);

  const readiness = useMemo(
    () =>
      deriveSolverReadiness({
        candidateCount: candidates.length,
        candidates,
        interviewers,
        panelSize,
        enabledSlots: scopedEnabledSlots,
        dates: scopedDates,
        sessionDuration,
        allowOvertime: solverOptions.availability_fallback !== "stop",
        requireExperiencedPanel: solverOptions.require_experienced_panel,
        enforceSameGender: solverOptions.enforce_same_gender,
      }),
    [
      candidates,
      scopedDates,
      scopedEnabledSlots,
      interviewers,
      panelSize,
      sessionDuration,
      solverOptions.availability_fallback,
      solverOptions.enforce_same_gender,
      solverOptions.require_experienced_panel,
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
        availabilityFallback,
        dayCount: dayCountOverride,
      }: {
        mode?: "initial" | "repair";
        repairStrategy?: RepairStrategy;
        previewOnly?: boolean;
        availabilityFallback?: SolverOptions["availability_fallback"];
        /** Scope this run to the first N plannable days, e.g. when
         *  extending a saved delplan by one day in a single click. */
        dayCount?: number;
      } = {},
    ) => {
      // Cancel any in-flight solve before enqueueing a new one. The
      // backend deduplicates solves by request fingerprint in
      // enqueue_solve_job, so a still-running job with the same
      // fingerprint (same committee, same baseline, same options) would
      // otherwise be returned in place of a fresh solve. The user
      // perceives this as "lag nytt forslag" silently producing the
      // previous plan. cancel() is a no-op when no job is in flight.
      if (
        solveJob.jobStatus === "PENDING" ||
        solveJob.jobStatus === "RUNNING"
      ) {
        await solveJob.cancel();
      }

      if (!readiness.ready) {
        const blockedCandidate = readiness.conflictBlockedCandidates[0];
        const capabilityBlockedCandidate =
          readiness.capabilityBlockedCandidates[0];
        solveJob.setError(
          blockedCandidate
            ? `${blockedCandidate.candidate.name} har ikke nok habile intervjuere til å danne panelet. Kontroller registrert inhabilitet før du genererer på nytt.`
            : capabilityBlockedCandidate
              ? `${capabilityBlockedCandidate.candidate.name} kan ikke få et panel som oppfyller de valgte kravene til erfaring eller kjønn. Juster kravene eller intervjuergruppen før du genererer på nytt.`
              : "Planleggingen trenger kandidater, et mulig panel og minst én åpen intervjutid.",
        );
        return null;
      }

      const runOptions: SolverOptions = {
        ...solverOptions,
        repair_strategy: repairStrategy ?? solverOptions.repair_strategy,
        repair_mode: mode === "repair",
        ...(availabilityFallback === undefined
          ? {}
          : {
              availability_fallback: availabilityFallback,
              allow_overtime: availabilityFallback === "automatic",
            }),
      };
      if (!previewOnly && syntheticInput) {
        setSolverOptions(runOptions);
        markDraftModified();
        solveJob.setPlanRevealed(Boolean(lockedAssignments.length));
      }
      const solveScopeCount = Math.min(
        dayCountOverride ?? effectiveDayCount,
        plannableDates.length,
      );
      const solveScopeDates = plannableDates.slice(0, solveScopeCount);
      const solveScopeDateSet = new Set(solveScopeDates);
      const solveScopedSlots =
        solveScopeDateSet.size === plannableDates.length
          ? enabledSlots
          : new Set(
              Array.from(enabledSlots).filter((key) =>
                solveScopeDateSet.has(key.slice(0, key.lastIndexOf("|"))),
              ),
            );
      const allSlots = slotsToSolverAvailability(
        solveScopedSlots,
        dates,
        sessionDuration,
      );
      const openSlots = new Set(allSlots);
      const blocks = canonicalBlocks.map((block) =>
        block.filter((slot) => openSlots.has(slot)),
      );
      const lockedIds = lockedAssignments.map((assignment) => ({
        candidate_id: assignment.candidate_id,
        time: assignment.time,
        panel: assignment.panel.map((member) => ({ id: member.id })),
      }));

      const completion = await solveJob.solve(
        syntheticInput
          ? {
              admission_slug: admissionSlug,
              group_id: groupId,
              candidates,
              interviewers,
              panel_size: panelSize,
              all_slots: allSlots,
              blocks,
              options: runOptions,
              synthetic: true,
              preview_only: previewOnly,
              ...(lockedAssignments.length > 0
                ? { locked_assignments: lockedAssignments }
                : {}),
            }
          : {
              admission_slug: admissionSlug,
              group_id: groupId,
              candidates: candidates.map(({ id }) => ({ id })),
              interviewers: interviewers.map(({ id }) => ({ id })),
              panel_size: panelSize,
              options: runOptions,
              ...(savedSchedule?.updated_at
                ? { baseline_updated_at: savedSchedule.updated_at }
                : {}),
              ...(solveScopeDates.length < plannableDates.length
                ? {
                    day_scope_through:
                      solveScopeDates[solveScopeDates.length - 1],
                  }
                : {}),
              ...(lockedIds.length > 0
                ? { locked_assignments: lockedIds }
                : {}),
              preview_only: previewOnly,
            },
        savedSchedule?.updated_at ?? draftBaseRevisionRef.current,
        {
          applyResult: syntheticInput && !previewOnly,
          retainAsProposal: !syntheticInput && !previewOnly,
          autoApplyIfEmpty:
            !syntheticInput &&
            !previewOnly &&
            (savedSchedule?.schedule.length ?? 0) === 0,
          previewOnly,
        },
      );
      if (completion?.kind === "access-failure") {
        syncedRevisionRef.current = null;
        resetDraftTracking(null);
        return null;
      }
      const outcome = completion?.result ?? null;
      // Only a real schedule (SUCCESS/PARTIAL) flows into apply/retain. An
      // INFEASIBLE or TIMEOUT result has an empty schedule and no
      // unplaceable rows, so without this guard it slipped into the
      // "fully placed - auto-apply" path below and silently no-op'd while
      // the solver error was left with nowhere to surface.
      if (outcome && hasSchedule(outcome.status) && !previewOnly) {
        if (syntheticInput) {
          setProposalSolverOptions(runOptions);
          setSolveTick((tick) => tick + 1);
        } else if ((savedSchedule?.schedule.length ?? 0) === 0) {
          if (
            completion?.kind === "completed" &&
            completion.job.applied_at &&
            completion.job.auto_apply_if_empty
          ) {
            setSolverOptions(runOptions);
            setProposalSolverOptions(runOptions);
            setPendingProposalSolverOptions(null);
            setSolveTick((tick) => tick + 1);
            return outcome;
          }
          const applied = await solveJob.applyProposal();
          if (!applied) return null;
          const appliedOptions = normalizeSolverOptions(
            applied.schedule.solver_options ?? runOptions,
          );
          setSolverOptions(appliedOptions);
          setProposalSolverOptions(appliedOptions);
          setPendingProposalSolverOptions(null);
          syncedRevisionRef.current = applied.schedule.updated_at;
          resetDraftTracking(applied.schedule.updated_at);
          setSolveTick((tick) => tick + 1);
        } else {
          // A solver run that fully placed every candidate is the
          // happy path - we should not strand the user on a "save or
          // discard" decision for a perfect plan. Auto-apply so the
          // new draft is committed and the user can either iterate or
          // move on to publication. A partial result still goes through
          // the proposal panel so the user can see what's missing.
          const unplaceableCount = completion?.result?.unplaceable?.length ?? 0;
          if (completion?.kind === "completed" && unplaceableCount === 0) {
            // Worker already auto-applied.
            if (completion.job.applied_at) {
              setSolverOptions(runOptions);
              setProposalSolverOptions(runOptions);
              setPendingProposalSolverOptions(null);
              setSolveTick((tick) => tick + 1);
              return outcome;
            }
            // Worker did not auto-apply - do it ourselves.
            const applied = await solveJob.applyProposal();
            if (!applied) return null;
            const appliedOptions = normalizeSolverOptions(
              applied.schedule.solver_options ?? runOptions,
            );
            setSolverOptions(appliedOptions);
            setProposalSolverOptions(appliedOptions);
            setPendingProposalSolverOptions(null);
            syncedRevisionRef.current = applied.schedule.updated_at;
            resetDraftTracking(applied.schedule.updated_at);
            setSolveTick((tick) => tick + 1);
            return outcome;
          }
          setPendingProposalSolverOptions(runOptions);
        }
      }
      return outcome;
    },
    [
      admissionSlug,
      groupId,
      candidates,
      canonicalBlocks,
      dates,
      effectiveDayCount,
      enabledSlots,
      interviewers,
      markDraftModified,
      panelSize,
      plannableDates,
      readiness.ready,
      resetDraftTracking,
      savedSchedule?.updated_at,
      savedSchedule?.schedule.length,
      sessionDuration,
      solveJob.cancel,
      solveJob.jobStatus,
      solveJob.setError,
      solveJob.setPlanRevealed,
      solveJob.solve,
      solveJob.applyProposal,
      solverOptions,
      syntheticInput,
    ],
  );

  const applyPendingProposal = useCallback(async () => {
    const applied = await solveJob.applyProposal();
    if (!applied) return false;
    const appliedOptions = normalizeSolverOptions(
      applied.schedule.solver_options ?? pendingProposalSolverOptions ?? {},
    );
    setSolverOptions(appliedOptions);
    setProposalSolverOptions(appliedOptions);
    setPendingProposalSolverOptions(null);
    syncedRevisionRef.current = applied.schedule.updated_at;
    resetDraftTracking(applied.schedule.updated_at);
    setSolveTick((tick) => tick + 1);
    return true;
  }, [
    pendingProposalSolverOptions,
    resetDraftTracking,
    solveJob.applyProposal,
  ]);

  const discardPendingProposal = useCallback(async () => {
    await solveJob.discardProposal();
    setPendingProposalSolverOptions(null);
  }, [solveJob.discardProposal]);

  const applyRepairPreview = useCallback(
    (result: SolveResponse, repairStrategy: RepairStrategy) => {
      const nextOptions: SolverOptions = {
        ...solverOptions,
        repair_strategy: repairStrategy,
        repair_mode: true,
      };
      setSolverOptions(nextOptions);
      setProposalSolverOptions(nextOptions);
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
    proposalSolverOptions,
    pendingProposalSolverOptions,
    setSolverOptions,
    readiness,
    estimatedSeconds,
    solveTick,
    solvePlan,
    applyPendingProposal,
    discardPendingProposal,
    applyRepairPreview,
    dayCount,
    setDayCount,
    effectiveDayCount,
    plannableDates,
    isDayScoped,
    draftBaseRevision: effectiveDraftBaseRevision,
    hasLocalDraft: effectiveHasLocalDraft,
    remoteRevisionChanged: effectiveRemoteRevisionChanged,
    markDraftModified,
    markDraftRevisionSaved,
    markDraftSaved,
    markDraftConflict,
    restoreSavedProposal,
    discardCurrentSuggestion,
  };
};
