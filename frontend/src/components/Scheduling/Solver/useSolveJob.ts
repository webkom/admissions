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
import { createSolveJobLifecycle } from "./solveJobLifecycle";

interface StoredSolveJob {
  jobId: string;
  baseRevision: string | null;
  mode: "result" | "proposal" | "auto-apply" | "preview";
}

const parseStoredSolveJob = (value: string): StoredSolveJob => {
  try {
    const parsed = JSON.parse(value) as Partial<StoredSolveJob>;
    if (typeof parsed.jobId === "string") {
      return {
        jobId: parsed.jobId,
        baseRevision:
          typeof parsed.baseRevision === "string" ? parsed.baseRevision : null,
        mode:
          parsed.mode === "proposal" ||
          parsed.mode === "auto-apply" ||
          parsed.mode === "preview"
            ? parsed.mode
            : "result",
      };
    }
  } catch {
    return { jobId: value, baseRevision: null, mode: "result" };
  }
  return { jobId: value, baseRevision: null, mode: "result" };
};

export function useSolveJob(admissionSlug: string) {
  const queryClient = useQueryClient();
  const lifecycle = useMemo(
    () => createSolveJobLifecycle(admissionSlug, queryClient),
    [admissionSlug, queryClient],
  );
  const solveJobKey = `admissions.solveJob.${djangoData.user.id ?? "unknown"}.${admissionSlug}`;
  const solveProposalKey = `admissions.solveProposal.${djangoData.user.id ?? "unknown"}.${admissionSlug}`;
  const legacySolveJobKey = `admissions.solveJob.${admissionSlug}`;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(() =>
    hasSchedule(result?.status),
  );
  const [activeJob, setActiveJob] = useState<SolveJob | null>(null);
  const [pendingProposal, setPendingProposal] =
    useState<PendingSolveProposal | null>(null);
  const [proposalActionLoading, setProposalActionLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restoredDraftBaseRevision, setRestoredDraftBaseRevision] = useState<
    string | null | undefined
  >(undefined);

  const solveRunRef = useRef(0);
  const solveJobIdRef = useRef<string | null>(null);
  const pendingProposalRef = useRef<PendingSolveProposal | null>(null);
  const completedProposalRef = useRef<PendingSolveProposal | null>(null);
  const lastGoodResultRef = useRef<SolveResponse | null>(
    result && hasSchedule(result.status) ? result : null,
  );

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(legacySolveJobKey);
    } catch {
      return;
    }
  }, [legacySolveJobKey]);

  useEffect(() => {
    return () => {
      solveRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (result && hasSchedule(result.status)) {
      lastGoodResultRef.current = result;
    }
  }, [result]);

  useEffect(() => {
    if (
      !loading ||
      !activeJob ||
      (activeJob.status !== "PENDING" && activeJob.status !== "RUNNING")
    ) {
      setElapsedMs(0);
      return;
    }
    const phaseStartedAt = Date.parse(
      activeJob.status === "RUNNING" && activeJob.started_at
        ? activeJob.started_at
        : activeJob.created_at,
    );
    const updateElapsed = () => {
      setElapsedMs(Math.max(0, Date.now() - phaseStartedAt));
    };
    updateElapsed();
    const tick = window.setInterval(updateElapsed, 100);
    return () => window.clearInterval(tick);
  }, [
    activeJob?.created_at,
    activeJob?.started_at,
    activeJob?.status,
    loading,
  ]);

  const clearStoredJob = useCallback(() => {
    setRestoredDraftBaseRevision(undefined);
    try {
      window.sessionStorage.removeItem(solveJobKey);
    } catch {
      return;
    }
  }, [solveJobKey]);
  const clearStoredProposal = useCallback(() => {
    try {
      window.sessionStorage.removeItem(solveProposalKey);
    } catch {
      return;
    }
  }, [solveProposalKey]);
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
      try {
        window.sessionStorage.setItem(
          solveProposalKey,
          JSON.stringify({ jobId: job.job_id, baseRevision }),
        );
      } catch {
        return;
      }
    },
    [clearStoredProposal, solveProposalKey],
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
    solveJobIdRef.current = null;
    lastGoodResultRef.current = null;
    setActiveJob(null);
    setLoading(false);
    setResult(null);
    setError("");
    setPlanRevealed(false);
    clearStoredJob();
    setPendingProposal(null);
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
    );
    if (outcome.kind === "stale") return null;
    if (outcome.kind === "access-failure") {
      clearAfterAccessFailure();
      return "access-failure" as const;
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
    let storedJob: StoredSolveJob | null = null;
    let hasStoredProposal = false;
    try {
      const storedValue = window.sessionStorage.getItem(solveJobKey);
      if (storedValue) storedJob = parseStoredSolveJob(storedValue);
      hasStoredProposal = Boolean(
        window.sessionStorage.getItem(solveProposalKey),
      );
    } catch {
      return;
    }
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
              queryKey: [`/admin/admission/${admissionSlug}/schedule/`],
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
    clearAfterAccessFailure,
    clearStoredJob,
    lifecycle,
    queryClient,
    rememberProposal,
    solveJobKey,
    solveProposalKey,
  ]);

  useEffect(() => {
    let storedProposal: StoredSolveJob | null = null;
    try {
      const storedValue = window.sessionStorage.getItem(solveProposalKey);
      if (storedValue) storedProposal = parseStoredSolveJob(storedValue);
    } catch {
      return;
    }
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
    solveProposalKey,
  ]);

  const cancel = async () => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1;
    solveJobIdRef.current = null;
    setActiveJob(null);
    setLoading(false);
    if (jobId) {
      try {
        const outcome = await lifecycle.cancel(jobId);
        if (outcome.kind === "access-failure") {
          clearAfterAccessFailure();
          return;
        }
        if (outcome.kind === "cancelled") clearStoredJob();
      } catch {
        setError(
          "Kunne ikke avbryte beregningen. Last siden på nytt for å følge den videre.",
        );
      }
    } else {
      clearStoredJob();
    }
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
        return "access-failure" as const;
      }
      const { job: created } = requestOutcome;
      setActiveJob(created);
      solveJobIdRef.current = created.job_id;
      try {
        window.sessionStorage.setItem(
          solveJobKey,
          JSON.stringify({
            jobId: created.job_id,
            baseRevision,
            mode: previewOnly
              ? "preview"
              : retainAsProposal
                ? autoApplyIfEmpty
                  ? "auto-apply"
                  : "proposal"
                : "result",
          } satisfies StoredSolveJob),
        );
      } catch {
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
      if (settleOutcome === "access-failure") return settleOutcome;
      const finishedJob = finishedJobHolder.current;
      if (previewOnly && finishedJob?.status === "DONE") {
        void lifecycle.cancel(finishedJob.job_id);
      }
      if (retainAsProposal && finishedJob) {
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
      return settleOutcome;
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
    setProposalActionLoading(true);
    setError("");
    try {
      const outcome = await lifecycle.apply(
        proposal.job.job_id,
        proposal.baseRevision,
      );
      if (outcome.kind === "access-failure") {
        clearAfterAccessFailure();
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
      clearStoredProposal();
      return applied;
    } catch (err) {
      setError(
        isAxiosError(err) && err.response
          ? formatApiError(err.response.data)
          : "Kunne ikke bruke forslaget. Prøv igjen.",
      );
      return null;
    } finally {
      setProposalActionLoading(false);
    }
  };

  const discardProposal = async () => {
    const proposal = pendingProposal ?? pendingProposalRef.current;
    if (!proposal) return;
    setProposalActionLoading(true);
    try {
      const outcome = await lifecycle.cancel(proposal.job.job_id);
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
      clearStoredProposal();
    } catch (err) {
      setError(
        isAxiosError(err) && err.response
          ? formatApiError(err.response.data)
          : "Kunne ikke forkaste forslaget. Prøv igjen.",
      );
    } finally {
      setProposalActionLoading(false);
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
    jobStatus: activeJob?.status ?? null,
    pendingProposal,
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
