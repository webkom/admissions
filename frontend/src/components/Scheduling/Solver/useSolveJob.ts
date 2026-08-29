import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  formatApiError,
  hasSchedule,
  solveFailureMessage,
  type AppliedSolveProposal,
  type PendingSolveProposal,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";
import djangoData from "src/utils/djangoData";
import { admissionGroupScope } from "src/query/sensitiveAccess";
import { createSolveJobLifecycle } from "./solveJobLifecycle";
import { createSolveJobStorage, type StoredSolveJob } from "./solveJobStorage";

// How long a solve job may sit PENDING before we assume the solver worker is
// not running. The worker claims jobs within its ~2s poll interval, so 60s of
// PENDING means it never started — surface that to the user instead of an
// endless spinner. (Was dev-only; a dead worker in production is exactly as
// invisible without it.)
const SOLVE_WORKER_STALL_MS = 60_000;

interface SolveJobCompletion {
  kind: "completed";
  job: SolveJob;
  result: SolveResponse | null;
}

export function useSolveJob(admissionSlug: string, groupId: string) {
  const queryClient = useQueryClient();
  const lifecycle = useMemo(
    () => createSolveJobLifecycle(admissionSlug, groupId, queryClient),
    [admissionSlug, groupId, queryClient],
  );
  const storage = useMemo(
    () =>
      createSolveJobStorage(
        admissionGroupScope(admissionSlug, groupId),
        djangoData.user.id,
      ),
    [admissionSlug, groupId],
  );

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(() =>
    hasSchedule(result?.status),
  );
  const [activeJob, setActiveJob] = useState<SolveJob | null>(null);
  const [pendingProposal, setPendingProposal] =
    useState<PendingSolveProposal | null>(null);
  const [rejectedProposalJobId, setRejectedProposalJobId] = useState<
    string | null
  >(null);
  const [proposalActionLoading, setProposalActionLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restoredDraftBaseRevision, setRestoredDraftBaseRevision] = useState<
    string | null | undefined
  >(undefined);

  const solveRunRef = useRef(0);
  const proposalActionRunRef = useRef(0);
  const solveJobIdRef = useRef<string | null>(null);
  const pendingProposalRef = useRef<PendingSolveProposal | null>(null);
  const completedProposalRef = useRef<PendingSolveProposal | null>(null);
  const lastGoodResultRef = useRef<SolveResponse | null>(
    result && hasSchedule(result.status) ? result : null,
  );

  useEffect(() => {
    storage.removeLegacyJob();
  }, [storage]);

  useEffect(() => {
    return () => {
      solveRunRef.current += 1;
      proposalActionRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (result && hasSchedule(result.status)) {
      lastGoodResultRef.current = result;
    }
  }, [result]);

  const jobStartedAt =
    activeJob &&
    (activeJob.status === "PENDING" || activeJob.status === "RUNNING")
      ? activeJob.status === "RUNNING" && activeJob.started_at
        ? activeJob.started_at
        : activeJob.created_at
      : null;

  useEffect(() => {
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const start = jobStartedAt ? Date.parse(jobStartedAt) : Date.now();
    const update = () => {
      setElapsedMs(Math.max(0, Date.now() - start));
    };
    update();
    const tick = window.setInterval(update, 100);
    return () => window.clearInterval(tick);
  }, [loading, jobStartedAt]);

  const clearStoredJob = useCallback(() => {
    setRestoredDraftBaseRevision(undefined);
    storage.removeJob();
  }, [storage]);
  const clearStoredProposal = useCallback(() => {
    storage.removeProposal();
  }, [storage]);
  const rememberProposal = useCallback(
    (job: SolveJob, baseRevision: string | null) => {
      if (
        !baseRevision ||
        job.status !== "DONE" ||
        job.applied_at ||
        job.discarded_at ||
        job.preview_only ||
        !job.result ||
        !hasSchedule(job.result.status)
      ) {
        if (
          !pendingProposalRef.current ||
          pendingProposalRef.current.job.job_id === job.job_id
        ) {
          pendingProposalRef.current = null;
          setPendingProposal(null);
          clearStoredProposal();
        }
        return;
      }
      const proposal = { job, result: job.result, baseRevision };
      pendingProposalRef.current = proposal;
      setPendingProposal(proposal);
      storage.writeProposal({
        jobId: job.job_id,
        baseRevision,
        mode: "proposal",
      });
    },
    [clearStoredProposal, storage],
  );
  const consumeRestoredDraft = useCallback(
    () => setRestoredDraftBaseRevision(undefined),
    [],
  );
  const clearAfterAccessFailure = useCallback(
    (showError = true) => {
      solveJobIdRef.current = null;
      lastGoodResultRef.current = null;
      setActiveJob(null);
      setLoading(false);
      setResult(null);
      setPlanRevealed(false);
      pendingProposalRef.current = null;
      completedProposalRef.current = null;
      setPendingProposal(null);
      setRejectedProposalJobId(null);
      setError(
        showError ? "Tilgangen til intervjuplanleggingen er fjernet." : "",
      );
      clearStoredJob();
      clearStoredProposal();
    },
    [clearStoredJob, clearStoredProposal],
  );

  const reset = useCallback(() => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1;
    proposalActionRunRef.current += 1;
    solveJobIdRef.current = null;
    lastGoodResultRef.current = null;
    setActiveJob(null);
    setLoading(false);
    setResult(null);
    setError("");
    setPlanRevealed(false);
    clearStoredJob();
    setPendingProposal(null);
    setRejectedProposalJobId(null);
    pendingProposalRef.current = null;
    completedProposalRef.current = null;
    clearStoredProposal();
    if (jobId) {
      void lifecycle.cancel(jobId);
    }
  }, [clearStoredJob, clearStoredProposal, lifecycle]);

  const restorePreviousResult = () => {
    const previous = lastGoodResultRef.current;
    if (!previous) return false;
    setResult(previous);
    setPlanRevealed(true);
    return true;
  };

  const applyFinishedJob = (job: SolveJob) => {
    if (job.status === "ERROR") {
      setError(job.error || "Solveren feilet under kjøring.");
      restorePreviousResult();
      return;
    }
    const jobResult = job.result;
    if (jobResult && hasSchedule(jobResult.status)) {
      setResult(jobResult);
      setPlanRevealed(true);
      return;
    }
    if (jobResult) {
      if (restorePreviousResult()) {
        setError(solveFailureMessage(jobResult));
      } else {
        setResult(jobResult);
      }
      return;
    }
    restorePreviousResult();
  };

  const settleJob = async (
    job: SolveJob,
    runId: number,
    beforeApply?: (finishedJob: SolveJob) => void,
    applyResult = true,
  ) => {
    const outcome = await lifecycle.poll(
      job,
      () => solveRunRef.current !== runId,
      setActiveJob,
      SOLVE_WORKER_STALL_MS,
    );
    if (outcome.kind === "stale") return null;
    if (outcome.kind === "access-failure") {
      clearAfterAccessFailure();
      return "access-failure" as const;
    }
    if (outcome.kind === "pending-timeout") {
      clearStoredJob();
      solveJobIdRef.current = null;
      setActiveJob(null);
      setError(
        import.meta.env.DEV
          ? "Solve-jobben ble aldri startet. Sjekk at `poetry run python " +
              "manage.py run_solver_worker` kjører (eller start Django med " +
              "`make dev`), og prøv igjen."
          : "Beregningen kom aldri i gang. Prøv igjen om litt — hvis det " +
              "ikke hjelper, kontakt webkom.",
      );
      restorePreviousResult();
      return null;
    }
    if (outcome.kind === "missing") {
      clearStoredJob();
      solveJobIdRef.current = null;
      setActiveJob(null);
      setError("Solver-jobben finnes ikke lenger. Kjør planen på nytt.");
      restorePreviousResult();
      return null;
    }
    clearStoredJob();
    beforeApply?.(outcome.job);
    if (applyResult) {
      applyFinishedJob(outcome.job);
    } else if (outcome.job.status === "ERROR") {
      setError(outcome.job.error || "Solveren feilet under kjøring.");
    } else if (outcome.job.result && !hasSchedule(outcome.job.result.status)) {
      setError(solveFailureMessage(outcome.job.result));
    }
    return outcome.job.result;
  };

  useEffect(() => {
    const storedJobRead = storage.readJob();
    const storedProposalRead = storage.readProposal();
    if (!storedJobRead.available || !storedProposalRead.available) return;
    let storedJob: StoredSolveJob | null = storedJobRead.value;
    const hasStoredProposal = storedProposalRead.value !== null;
    if (!storedJob && hasStoredProposal) return;
    const runId = ++solveRunRef.current;
    (async () => {
      try {
        let initialJob: SolveJob | null = null;
        if (!storedJob) {
          const latestOutcome = await lifecycle.latest(
            () => solveRunRef.current !== runId,
          );
          if (latestOutcome.kind !== "job") {
            if (latestOutcome.kind === "access-failure") {
              clearAfterAccessFailure();
            }
            return;
          }
          initialJob = latestOutcome.job;
          if (initialJob.preview_only) {
            void lifecycle.cancel(initialJob.job_id);
            return;
          }
          storedJob = {
            jobId: initialJob.job_id,
            baseRevision: initialJob.baseline_updated_at,
            mode: initialJob.auto_apply_if_empty ? "auto-apply" : "proposal",
          };
        }
        const restoredJob = storedJob;
        const readOutcome = initialJob
          ? { kind: "job" as const, job: initialJob }
          : await lifecycle.read(
              restoredJob.jobId,
              () => solveRunRef.current !== runId,
            );
        if (readOutcome.kind === "stale") return;
        if (readOutcome.kind === "access-failure") {
          clearAfterAccessFailure();
          return;
        }
        if (readOutcome.kind === "missing") {
          clearStoredJob();
          setResult(null);
          setPlanRevealed(false);
          setError("");
          return;
        }
        const { job } = readOutcome;
        const restoreFinishedJob = (finishedJob: SolveJob) => {
          if (restoredJob.mode === "preview" || finishedJob.preview_only) {
            void lifecycle.cancel(finishedJob.job_id);
            return;
          }
          const shouldRemainAProposal =
            restoredJob.mode === "proposal" ||
            (restoredJob.mode === "auto-apply" && !finishedJob.applied_at);
          if (shouldRemainAProposal) {
            rememberProposal(finishedJob, restoredJob.baseRevision);
            return;
          }
          if (
            restoredJob.mode === "result" &&
            finishedJob.result &&
            hasSchedule(finishedJob.result.status)
          ) {
            setRestoredDraftBaseRevision(restoredJob.baseRevision);
          }
          applyFinishedJob(finishedJob);
          if (finishedJob.applied_at) {
            void queryClient.invalidateQueries({
              queryKey: [
                `/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
              ],
            });
          }
        };
        setActiveJob(job);
        if (job.status === "PENDING" || job.status === "RUNNING") {
          solveJobIdRef.current = job.job_id;
          setLoading(true);
          await settleJob(job, runId, restoreFinishedJob, false);
        } else {
          clearStoredJob();
          restoreFinishedJob(job);
        }
      } catch {
        if (solveRunRef.current !== runId) return;
        clearStoredJob();
      } finally {
        if (solveRunRef.current === runId) {
          setLoading(false);
          solveJobIdRef.current = null;
        }
      }
    })();
  }, [
    admissionSlug,
    groupId,
    clearAfterAccessFailure,
    clearStoredJob,
    lifecycle,
    queryClient,
    rememberProposal,
    storage,
  ]);

  useEffect(() => {
    const storedProposalRead = storage.readProposal();
    if (!storedProposalRead.available) return;
    const storedProposal = storedProposalRead.value;
    if (!storedProposal?.baseRevision) return;
    const runId = solveRunRef.current;
    void (async () => {
      const outcome = await lifecycle.read(
        storedProposal.jobId,
        () => solveRunRef.current !== runId,
      );
      if (outcome.kind === "job") {
        rememberProposal(outcome.job, storedProposal.baseRevision);
      } else if (outcome.kind === "missing") {
        clearStoredProposal();
      } else if (outcome.kind === "access-failure") {
        clearAfterAccessFailure();
      }
    })();
  }, [
    clearAfterAccessFailure,
    clearStoredProposal,
    lifecycle,
    rememberProposal,
    storage,
  ]);

  const cancel = async () => {
    const jobId = solveJobIdRef.current;
    const cancelRunId = ++solveRunRef.current;
    const isStale = () => solveRunRef.current !== cancelRunId;
    solveJobIdRef.current = null;
    setActiveJob(null);
    setLoading(false);
    if (jobId) {
      try {
        const outcome = await lifecycle.cancel(jobId, isStale);
        if (outcome.kind === "stale") return;
        if (outcome.kind === "access-failure") {
          clearAfterAccessFailure();
          return;
        }
        if (outcome.kind === "cancelled") clearStoredJob();
      } catch {
        if (isStale()) return;
        setError(
          "Kunne ikke avbryte beregningen. Last siden på nytt for å følge den videre.",
        );
      }
    } else {
      clearStoredJob();
    }
    if (isStale()) return;
    restorePreviousResult();
  };

  const solve = async (
    payload: unknown,
    baseRevision: string | null,
    {
      applyResult = true,
      retainAsProposal = false,
      autoApplyIfEmpty = false,
      previewOnly = false,
    }: {
      applyResult?: boolean;
      retainAsProposal?: boolean;
      autoApplyIfEmpty?: boolean;
      previewOnly?: boolean;
    } = {},
  ) => {
    const runId = ++solveRunRef.current;
    proposalActionRunRef.current += 1;
    setRejectedProposalJobId(null);
    setRestoredDraftBaseRevision(undefined);
    setActiveJob(null);
    setLoading(true);
    setError("");
    if (applyResult) setResult(null);

    try {
      const requestOutcome = await lifecycle.request(
        payload,
        () => solveRunRef.current !== runId,
      );
      if (requestOutcome.kind === "stale") return;
      if (requestOutcome.kind === "access-failure") {
        clearAfterAccessFailure();
        return { kind: "access-failure" as const };
      }
      const { job: created } = requestOutcome;
      setActiveJob(created);
      solveJobIdRef.current = created.job_id;
      const jobStored = storage.writeJob({
        jobId: created.job_id,
        baseRevision,
        mode: previewOnly
          ? "preview"
          : retainAsProposal
            ? autoApplyIfEmpty
              ? "auto-apply"
              : "proposal"
            : "result",
      });
      if (!jobStored) {
        clearStoredJob();
      }
      const finishedJobHolder: { current: SolveJob | null } = {
        current: null,
      };
      const settleOutcome = await settleJob(
        created,
        runId,
        (job) => {
          finishedJobHolder.current = job;
        },
        applyResult,
      );
      if (settleOutcome === "access-failure") {
        return { kind: "access-failure" as const };
      }
      const finishedJob = finishedJobHolder.current;
      if (!finishedJob) return null;
      if (previewOnly && finishedJob?.status === "DONE") {
        void lifecycle.cancel(finishedJob.job_id);
      }
      const workerAppliedFirstDraft = Boolean(
        retainAsProposal &&
          autoApplyIfEmpty &&
          finishedJob.applied_at &&
          finishedJob.auto_apply_if_empty &&
          finishedJob.result &&
          hasSchedule(finishedJob.result.status),
      );
      if (workerAppliedFirstDraft) {
        applyFinishedJob(finishedJob);
        pendingProposalRef.current = null;
        completedProposalRef.current = null;
        setPendingProposal(null);
        clearStoredProposal();
        await queryClient.invalidateQueries({
          queryKey: [
            `/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
          ],
          exact: true,
          refetchType: "active",
        });
      } else if (retainAsProposal) {
        if (
          baseRevision &&
          finishedJob.result &&
          hasSchedule(finishedJob.result.status)
        ) {
          completedProposalRef.current = {
            job: finishedJob,
            result: finishedJob.result,
            baseRevision,
          };
        }
        rememberProposal(finishedJob, baseRevision);
      }
      return {
        kind: "completed",
        job: finishedJob,
        result: settleOutcome,
      } satisfies SolveJobCompletion;
    } catch (err) {
      if (solveRunRef.current !== runId) return;
      if (applyResult) restorePreviousResult();
      if (isAxiosError(err) && err.response) {
        setError(formatApiError(err.response.data));
      } else {
        setError("Kunne ikke koble til serveren. Er backend oppe?");
      }
      return null;
    } finally {
      if (solveRunRef.current === runId) {
        setLoading(false);
        solveJobIdRef.current = null;
      }
    }
  };

  const applyProposal = async (): Promise<AppliedSolveProposal | null> => {
    const proposal =
      pendingProposal ??
      pendingProposalRef.current ??
      completedProposalRef.current;
    if (!proposal) return null;
    const runId = solveRunRef.current;
    const actionRunId = ++proposalActionRunRef.current;
    const isStale = () =>
      solveRunRef.current !== runId ||
      proposalActionRunRef.current !== actionRunId;
    setProposalActionLoading(true);
    setError("");
    try {
      const outcome = await lifecycle.apply(
        proposal.job.job_id,
        proposal.baseRevision,
        isStale,
      );
      if (outcome.kind === "stale") return null;
      if (outcome.kind === "access-failure") {
        clearAfterAccessFailure();
        return null;
      }
      if (outcome.kind === "conflict") {
        setRejectedProposalJobId(proposal.job.job_id);
        setError(formatApiError(outcome.error.response?.data));
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: [
              `/admin/admission/${admissionSlug}/group/${groupId}/schedule/`,
            ],
            exact: true,
            refetchType: "active",
          }),
          queryClient.invalidateQueries({
            queryKey: [
              `/admin/admission/${admissionSlug}/group/${groupId}/availability/`,
            ],
            exact: true,
            refetchType: "active",
          }),
          queryClient.invalidateQueries({
            queryKey: [
              `/admin/admission/${admissionSlug}/group/${groupId}/candidates/`,
            ],
            exact: true,
            refetchType: "active",
          }),
        ]);
        return null;
      }
      if (outcome.kind !== "applied") return null;
      const applied = {
        schedule: outcome.schedule,
        result: proposal.result,
      };
      setResult(proposal.result);
      setPlanRevealed(true);
      lastGoodResultRef.current = proposal.result;
      pendingProposalRef.current = null;
      completedProposalRef.current = null;
      setPendingProposal(null);
      setRejectedProposalJobId(null);
      clearStoredProposal();
      return applied;
    } catch (err) {
      if (isStale()) return null;
      setError(
        isAxiosError(err) && err.response
          ? formatApiError(err.response.data)
          : "Kunne ikke bruke forslaget. Prøv igjen.",
      );
      return null;
    } finally {
      if (!isStale()) setProposalActionLoading(false);
    }
  };

  const discardProposal = async () => {
    const proposal = pendingProposal ?? pendingProposalRef.current;
    if (!proposal) return;
    const runId = solveRunRef.current;
    const actionRunId = ++proposalActionRunRef.current;
    const isStale = () =>
      solveRunRef.current !== runId ||
      proposalActionRunRef.current !== actionRunId;
    setProposalActionLoading(true);
    try {
      const outcome = await lifecycle.cancel(proposal.job.job_id, isStale);
      if (outcome.kind === "stale") return;
      if (outcome.kind === "access-failure") {
        clearAfterAccessFailure();
        return;
      }
      if (outcome.kind !== "cancelled" || !outcome.job.discarded_at) {
        setError("Forslaget ble ikke forkastet. Prøv igjen.");
        return;
      }
      pendingProposalRef.current = null;
      completedProposalRef.current = null;
      setPendingProposal(null);
      setRejectedProposalJobId(null);
      clearStoredProposal();
    } catch (err) {
      if (isStale()) return;
      setError(
        isAxiosError(err) && err.response
          ? formatApiError(err.response.data)
          : "Kunne ikke forkaste forslaget. Prøv igjen.",
      );
    } finally {
      if (!isStale()) setProposalActionLoading(false);
    }
  };

  return {
    loading,
    result,
    setResult,
    error,
    setError,
    planRevealed,
    setPlanRevealed,
    elapsedMs,
    startedAt: jobStartedAt,
    jobStatus: activeJob?.status ?? null,
    pendingProposal,
    pendingProposalRejected:
      pendingProposal !== null &&
      rejectedProposalJobId === pendingProposal.job.job_id,
    proposalActionLoading,
    restoredDraftBaseRevision,
    consumeRestoredDraft,
    solve,
    applyProposal,
    discardProposal,
    cancel,
    reset,
  };
}
