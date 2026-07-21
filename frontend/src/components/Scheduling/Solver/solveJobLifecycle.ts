import type { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  areSensitiveAdmissionCacheWritesBlocked,
  purgeSensitiveAdmissionAccess,
  purgeSensitiveAuthorizationFailure,
} from "src/query/sensitiveAccess";
import { apiClient } from "src/utils/callApi";

import type { SolveJob } from "./solverHelpers";

const SOLVE_POLL_INTERVAL_MS = 1500;

type IsStale = () => boolean;
type OnJobChange = (job: SolveJob) => void;

type SolveJobInterruption =
  | { kind: "stale" }
  | { kind: "access-failure"; purged: boolean };

type SolveJobRequestOutcome =
  | SolveJobInterruption
  | { kind: "created"; job: SolveJob };

type SolveJobReadOutcome =
  | SolveJobInterruption
  | { kind: "missing" }
  | { kind: "job"; job: SolveJob };

type SolveJobPollOutcome =
  | SolveJobInterruption
  | { kind: "finished"; job: SolveJob }
  | { kind: "missing" };

type SolveJobCancelOutcome = SolveJobInterruption | { kind: "cancelled" };

const neverStale = () => false;

export const createSolveJobLifecycle = (
  admissionSlug: string,
  queryClient: QueryClient,
) => {
  const interruption = (
    isStale: IsStale = neverStale,
  ): SolveJobInterruption | null => {
    if (isStale()) return { kind: "stale" };
    if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) {
      return { kind: "access-failure", purged: false };
    }
    return null;
  };

  const request = async (
    payload: unknown,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobRequestOutcome> => {
    const beforeRequest = interruption(isStale);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.post<SolveJob>("/solve/", payload);
      return interruption(isStale) ?? { kind: "created", job: data };
    } catch (error) {
      const purged = purgeSensitiveAdmissionAccess(
        queryClient,
        admissionSlug,
        error,
      );
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const read = async (
    jobId: string,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobReadOutcome> => {
    const beforeRequest = interruption(isStale);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.get<SolveJob>(`/solve/${jobId}/`);
      return interruption(isStale) ?? { kind: "job", job: data };
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return isStale() ? { kind: "stale" } : { kind: "missing" };
      }
      const purged = purgeSensitiveAuthorizationFailure(queryClient, error);
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const cancel = async (
    jobId: string,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobCancelOutcome> => {
    const beforeRequest = interruption(isStale);
    if (beforeRequest) return beforeRequest;

    try {
      await apiClient.delete(`/solve/${jobId}/`);
    } catch (error) {
      const purged = purgeSensitiveAuthorizationFailure(queryClient, error);
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale);
      if (afterRequest) return afterRequest;
    }
    return interruption(isStale) ?? { kind: "cancelled" };
  };

  const poll = async (
    created: SolveJob,
    isStale: IsStale = neverStale,
    onJobChange: OnJobChange = () => undefined,
  ): Promise<SolveJobPollOutcome> => {
    let job = created;
    const beforePoll = interruption(isStale);
    if (beforePoll) return beforePoll;
    onJobChange(job);

    while (job.status === "PENDING" || job.status === "RUNNING") {
      await new Promise((resolve) =>
        setTimeout(resolve, SOLVE_POLL_INTERVAL_MS),
      );
      const beforeRead = interruption(isStale);
      if (beforeRead) return beforeRead;

      const readOutcome = await read(created.job_id, isStale);
      if (readOutcome.kind !== "job") return readOutcome;
      job = readOutcome.job;
      onJobChange(job);
    }

    return interruption(isStale) ?? { kind: "finished", job };
  };

  return { request, read, poll, cancel };
};
