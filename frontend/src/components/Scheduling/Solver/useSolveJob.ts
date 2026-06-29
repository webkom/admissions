import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";

import { apiClient } from "../../../utils/callApi";
import {
  SOLVE_POLL_INTERVAL_MS,
  SOLVE_POLL_TIMEOUT_MS,
  formatApiError,
  hasSchedule,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";

/**
 * Owns the async solve lifecycle for one admission: enqueue a job, poll it to
 * completion, and expose the result/loading/error state.
 *
 * - `solve(payload)` enqueues and polls; call it after validating inputs.
 * - `cancel()` aborts the current poll and cancels the server-side job.
 * The draft result is persisted in sessionStorage (it holds real candidate
 * names) so it survives reloads within a sitting but clears when the tab closes.
 */
export function useSolveJob(admissionSlug: string) {
  const solverResultKey = `admissions.solverResult.${admissionSlug}`;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(() => {
    try {
      const raw = window.sessionStorage.getItem(solverResultKey);
      return raw ? (JSON.parse(raw) as SolveResponse) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(() =>
    hasSchedule(result?.status),
  );
  const [elapsedMs, setElapsedMs] = useState(0);

  // Identifies the current solve run so a superseding solve (or an unmount)
  // can't have a stale poll overwrite newer state.
  const solveRunRef = useRef(0);
  // The job currently being polled, so it can be cancelled.
  const solveJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (result) {
        window.sessionStorage.setItem(solverResultKey, JSON.stringify(result));
      } else {
        window.sessionStorage.removeItem(solverResultKey);
      }
    } catch {
      // ignore storage failures
    }
  }, [result, solverResultKey]);

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

  const cancel = async () => {
    const jobId = solveJobIdRef.current;
    solveRunRef.current += 1; // stop the active poll loop
    solveJobIdRef.current = null;
    setLoading(false);
    if (jobId) {
      try {
        await apiClient.delete(`/solve/${jobId}/`);
      } catch {
        // Best effort — the worker's reaper cleans up if the cancel didn't land.
      }
    }
  };

  const solve = async (payload: unknown) => {
    const runId = ++solveRunRef.current;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // Enqueue, then poll the job; solving runs in a background worker.
      const { data: created } = await apiClient.post<SolveJob>(
        "/solve/",
        payload,
      );
      solveJobIdRef.current = created.job_id;
      let job = created;
      const pollStart = Date.now();
      while (job.status === "PENDING" || job.status === "RUNNING") {
        await new Promise((resolve) =>
          setTimeout(resolve, SOLVE_POLL_INTERVAL_MS),
        );
        if (solveRunRef.current !== runId) return; // superseded
        if (Date.now() - pollStart > SOLVE_POLL_TIMEOUT_MS) {
          setError(
            "Solveren svarer ikke i tide. Prøv igjen, eller sjekk at " +
              "solver-worker kjører.",
          );
          return;
        }
        const { data } = await apiClient.get<SolveJob>(
          `/solve/${created.job_id}/`,
        );
        job = data;
      }

      if (solveRunRef.current !== runId) return;
      if (job.status === "ERROR") {
        setError(job.error || "Solveren feilet under kjøring.");
      } else if (job.result) {
        setResult(job.result);
        if (hasSchedule(job.result.status)) {
          setPlanRevealed(true);
        }
      }
    } catch (err) {
      if (solveRunRef.current !== runId) return;
      console.error(err);
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
  };
}
