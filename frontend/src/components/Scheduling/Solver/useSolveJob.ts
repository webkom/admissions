import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  formatApiError,
  hasSchedule,
  solveFailureMessage,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";
import djangoData from "src/utils/djangoData";
import { createSolveJobLifecycle } from "./solveJobLifecycle";

interface StoredSolveJob {
  jobId: string;
  baseRevision: string | null;
}

const parseStoredSolveJob = (value: string): StoredSolveJob => {
  try {
    const parsed = JSON.parse(value) as Partial<StoredSolveJob>;
    if (typeof parsed.jobId === "string") {
      return {
        jobId: parsed.jobId,
        baseRevision:
          typeof parsed.baseRevision === "string" ? parsed.baseRevision : null,
      };
    }
  } catch {
    return { jobId: value, baseRevision: null };
  }
  return { jobId: value, baseRevision: null };
};

export function useSolveJob(admissionSlug: string) {
  const queryClient = useQueryClient();
  const lifecycle = useMemo(
    () => createSolveJobLifecycle(admissionSlug, queryClient),
    [admissionSlug, queryClient],
  );
  const solveJobKey = `admissions.solveJob.${djangoData.user.id ?? "unknown"}.${admissionSlug}`;
  const legacySolveJobKey = `admissions.solveJob.${admissionSlug}`;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(() =>
    hasSchedule(result?.status),
  );
  const [activeJob, setActiveJob] = useState<SolveJob | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [restoredDraftBaseRevision, setRestoredDraftBaseRevision] = useState<
    string | null | undefined
  >(undefined);

  const solveRunRef = useRef(0);
  const solveJobIdRef = useRef<string | null>(null);
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
      setError(
        showError ? "Tilgangen til intervjuplanleggingen er fjernet." : "",
      );
      clearStoredJob();
    },
    [clearStoredJob],
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
    if (jobId) {
      void lifecycle.cancel(jobId);
    }
  }, [clearStoredJob, lifecycle]);

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
    try {
      const storedValue = window.sessionStorage.getItem(solveJobKey);
      if (storedValue) storedJob = parseStoredSolveJob(storedValue);
    } catch {
      return;
    }
    if (!storedJob) return;
    const runId = ++solveRunRef.current;
    (async () => {
      try {
        const readOutcome = await lifecycle.read(
          storedJob.jobId,
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
        setActiveJob(job);
        if (job.status === "PENDING" || job.status === "RUNNING") {
          solveJobIdRef.current = job.job_id;
          setLoading(true);
          await settleJob(job, runId, (finishedJob) => {
            if (finishedJob.result && hasSchedule(finishedJob.result.status)) {
              setRestoredDraftBaseRevision(storedJob.baseRevision);
            }
          });
        } else {
          clearStoredJob();
          if (job.result && hasSchedule(job.result.status)) {
            setRestoredDraftBaseRevision(storedJob.baseRevision);
          }
          applyFinishedJob(job);
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
  }, [clearAfterAccessFailure, clearStoredJob, lifecycle, solveJobKey]);

  const cancel = async () => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1;
    solveJobIdRef.current = null;
    setActiveJob(null);
    setLoading(false);
    clearStoredJob();
    if (jobId) {
      const outcome = await lifecycle.cancel(jobId);
      if (outcome.kind === "access-failure") {
        clearAfterAccessFailure();
        return;
      }
    }
    restorePreviousResult();
  };

  const solve = async (
    payload: unknown,
    baseRevision: string | null,
    { applyResult = true }: { applyResult?: boolean } = {},
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
      if (applyResult) {
        try {
          window.sessionStorage.setItem(
            solveJobKey,
            JSON.stringify({ jobId: created.job_id, baseRevision }),
          );
        } catch {
          clearStoredJob();
        }
      }
      const settleOutcome = await settleJob(
        created,
        runId,
        undefined,
        applyResult,
      );
      if (settleOutcome === "access-failure") return settleOutcome;
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
    restoredDraftBaseRevision,
    consumeRestoredDraft,
    solve,
    cancel,
    reset,
  };
}
