import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";

import { apiClient } from "../../../utils/callApi";
import {
  formatApiError,
  hasSchedule,
  pollSolveJob,
  solveFailureMessage,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";
import djangoData from "src/utils/djangoData";

export function useSolveJob(admissionSlug: string) {
  const solveJobKey = `admissions.solveJob.${djangoData.user.id ?? "unknown"}.${admissionSlug}`;
  const legacySolveJobKey = `admissions.solveJob.${admissionSlug}`;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(() =>
    hasSchedule(result?.status),
  );
  const [elapsedMs, setElapsedMs] = useState(0);

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
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const start = performance.now();
    const tick = window.setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 100);
    return () => window.clearInterval(tick);
  }, [loading]);

  const clearStoredJob = useCallback(() => {
    try {
      window.sessionStorage.removeItem(solveJobKey);
    } catch {
      return;
    }
  }, [solveJobKey]);

  const reset = useCallback(() => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1;
    solveJobIdRef.current = null;
    lastGoodResultRef.current = null;
    setLoading(false);
    setResult(null);
    setError("");
    setPlanRevealed(false);
    clearStoredJob();
    if (jobId) {
      void apiClient.delete(`/solve/${jobId}/`).catch(() => undefined);
    }
  }, [clearStoredJob]);

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

  const settleJob = async (job: SolveJob, runId: number) => {
    const outcome = await pollSolveJob(
      job,
      () => solveRunRef.current !== runId,
    );
    if (outcome.kind === "stale") return;
    if (outcome.kind === "timeout") {
      const jobId = solveJobIdRef.current;
      clearStoredJob();
      solveJobIdRef.current = null;
      if (jobId) {
        void apiClient.delete(`/solve/${jobId}/`).catch(() => undefined);
      }
      setError(
        "Solveren svarer ikke i tide. Prøv igjen, eller sjekk at " +
          "solver-worker kjører.",
      );
      restorePreviousResult();
      return;
    }
    if (solveRunRef.current !== runId) return;
    clearStoredJob();
    applyFinishedJob(outcome.job);
  };

  useEffect(() => {
    let storedJobId: string | null = null;
    try {
      storedJobId = window.sessionStorage.getItem(solveJobKey);
    } catch {
      return;
    }
    if (!storedJobId) return;
    const runId = ++solveRunRef.current;
    (async () => {
      try {
        const { data: job } = await apiClient.get<SolveJob>(
          `/solve/${storedJobId}/`,
        );
        if (solveRunRef.current !== runId) return;
        if (job.status === "PENDING" || job.status === "RUNNING") {
          solveJobIdRef.current = job.job_id;
          setLoading(true);
          await settleJob(job, runId);
        } else {
          clearStoredJob();
          applyFinishedJob(job);
        }
      } catch {
        if (solveRunRef.current === runId) clearStoredJob();
      } finally {
        if (solveRunRef.current === runId) {
          setLoading(false);
          solveJobIdRef.current = null;
        }
      }
    })();
  }, [solveJobKey]);

  const cancel = async () => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1;
    solveJobIdRef.current = null;
    setLoading(false);
    restorePreviousResult();
    clearStoredJob();
    if (jobId) {
      try {
        await apiClient.delete(`/solve/${jobId}/`);
      } catch {
        clearStoredJob();
      }
    }
  };

  const solve = async (payload: unknown) => {
    const runId = ++solveRunRef.current;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const { data: created } = await apiClient.post<SolveJob>(
        "/solve/",
        payload,
      );
      solveJobIdRef.current = created.job_id;
      try {
        window.sessionStorage.setItem(solveJobKey, created.job_id);
      } catch {
        clearStoredJob();
      }
      await settleJob(created, runId);
    } catch (err) {
      if (solveRunRef.current !== runId) return;
      restorePreviousResult();
      if (isAxiosError(err) && err.response) {
        setError(formatApiError(err.response.data));
      } else {
        setError("Kunne ikke koble til serveren. Er backend oppe?");
      }
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
    solve,
    cancel,
    reset,
  };
}
