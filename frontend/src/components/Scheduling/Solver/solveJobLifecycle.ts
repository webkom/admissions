import type { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import {
  areSensitiveAdmissionCacheWritesBlocked,
  captureSensitiveAdmissionAuthorityEpoch,
  isSensitiveAdmissionAuthorityEpochCurrent,
  purgeSensitiveAdmissionAccess,
  purgeSensitiveAuthorizationFailure,
  type SensitiveAdmissionAuthorityEpoch,
} from "src/query/sensitiveAccess";
import { apiClient } from "src/utils/callApi";

import type { SolveJob } from "./solverHelpers";
import type { SavedSchedule } from "src/types";

const SOLVE_POLL_INTERVAL_MS = 1500;
const SOLVE_POLL_MAX_INTERVAL_MS = 12000;
const SOLVE_POLL_MAX_TRANSIENT_FAILURES = 5;

const isTransientSolvePollError = (error: unknown) => {
  if (!isAxiosError(error)) return true;
  const status = error.response?.status;
  return (
    status === undefined ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
};

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

type SolveJobCancelOutcome =
  | SolveJobInterruption
  | { kind: "cancelled"; job: SolveJob };

const neverStale = () => false;

export const createSolveJobLifecycle = (
  admissionSlug: string,
  queryClient: QueryClient,
) => {
  const interruption = (
    isStale: IsStale = neverStale,
    authorityEpoch?: SensitiveAdmissionAuthorityEpoch,
  ): SolveJobInterruption | null => {
    if (isStale()) return { kind: "stale" };
    if (
      authorityEpoch &&
      !isSensitiveAdmissionAuthorityEpochCurrent(admissionSlug, authorityEpoch)
    ) {
      return { kind: "stale" };
    }
    if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) {
      return { kind: "access-failure", purged: false };
    }
    return null;
  };

  const request = async (
    payload: unknown,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobRequestOutcome> => {
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforeRequest = interruption(isStale, authorityEpoch);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.post<SolveJob>("/solve/", payload);
      return (
        interruption(isStale, authorityEpoch) ?? { kind: "created", job: data }
      );
    } catch (error) {
      const purged = purgeSensitiveAdmissionAccess(
        queryClient,
        admissionSlug,
        error,
      );
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale, authorityEpoch);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const read = async (
    jobId: string,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobReadOutcome> => {
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforeRequest = interruption(isStale, authorityEpoch);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.get<SolveJob>(`/solve/${jobId}/`);
      return (
        interruption(isStale, authorityEpoch) ?? { kind: "job", job: data }
      );
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        return (
          interruption(isStale, authorityEpoch) ?? { kind: "missing" as const }
        );
      }
      const purged = purgeSensitiveAdmissionAccess(
        queryClient,
        admissionSlug,
        error,
        { scopeForbiddenToAdmission: true },
      );
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale, authorityEpoch);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const latest = async (
    isStale: IsStale = neverStale,
  ): Promise<SolveJobReadOutcome> => {
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforeRequest = interruption(isStale, authorityEpoch);
    if (beforeRequest) return beforeRequest;

    try {
      const response = await apiClient.get<SolveJob | "">("/solve/latest/", {
        params: { admission_slug: admissionSlug },
      });
      const interrupted = interruption(isStale, authorityEpoch);
      if (interrupted) return interrupted;
      return response.status === 204 || !response.data
        ? { kind: "missing" }
        : { kind: "job", job: response.data };
    } catch (error) {
      const purged = purgeSensitiveAdmissionAccess(
        queryClient,
        admissionSlug,
        error,
        { scopeForbiddenToAdmission: true },
      );
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale, authorityEpoch);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const cancel = async (
    jobId: string,
    isStale: IsStale = neverStale,
  ): Promise<SolveJobCancelOutcome> => {
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforeRequest = interruption(isStale, authorityEpoch);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.delete<SolveJob>(`/solve/${jobId}/`);
      return (
        interruption(isStale, authorityEpoch) ?? {
          kind: "cancelled",
          job: data,
        }
      );
    } catch (error) {
      const purged = purgeSensitiveAuthorizationFailure(queryClient, error);
      if (isStale()) return { kind: "stale" };
      if (purged) return { kind: "access-failure", purged };
      const afterRequest = interruption(isStale, authorityEpoch);
      if (afterRequest) return afterRequest;
      throw error;
    }
  };

  const apply = async (
    jobId: string,
    expectedUpdatedAt: string,
    isStale: IsStale = neverStale,
  ) => {
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforeRequest = interruption(isStale, authorityEpoch);
    if (beforeRequest) return beforeRequest;

    try {
      const { data } = await apiClient.post<SavedSchedule>(
        `/solve/${jobId}/apply/`,
        { expected_updated_at: expectedUpdatedAt },
      );
      const interrupted = interruption(isStale, authorityEpoch);
      if (interrupted) return interrupted;
      queryClient.setQueryData(
        [`/admin/admission/${admissionSlug}/schedule/`],
        data,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [`/admin/admission/${admissionSlug}/availability/`],
        }),
        queryClient.invalidateQueries({
          queryKey: [`/admin/admission/${admissionSlug}/candidates/`],
        }),
      ]);
      return { kind: "applied" as const, schedule: data };
    } catch (error) {
      const purged = purgeSensitiveAuthorizationFailure(queryClient, error);
      if (isStale()) return { kind: "stale" as const };
      if (purged) return { kind: "access-failure" as const, purged };
      const afterRequest = interruption(isStale, authorityEpoch);
      if (afterRequest) return afterRequest;
      if (isAxiosError(error) && error.response?.status === 409) {
        return { kind: "conflict" as const, error };
      }
      throw error;
    }
  };

  const poll = async (
    created: SolveJob,
    isStale: IsStale = neverStale,
    onJobChange: OnJobChange = () => undefined,
  ): Promise<SolveJobPollOutcome> => {
    let job = created;
    let transientFailureCount = 0;
    let nextPollDelayMs = SOLVE_POLL_INTERVAL_MS;
    const authorityEpoch =
      captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
    const beforePoll = interruption(isStale, authorityEpoch);
    if (beforePoll) return beforePoll;
    onJobChange(job);

    while (job.status === "PENDING" || job.status === "RUNNING") {
      await new Promise((resolve) => setTimeout(resolve, nextPollDelayMs));
      const beforeRead = interruption(isStale, authorityEpoch);
      if (beforeRead) return beforeRead;

      let readOutcome: SolveJobReadOutcome;
      try {
        readOutcome = await read(created.job_id, isStale);
      } catch (error) {
        if (!isTransientSolvePollError(error)) throw error;
        transientFailureCount += 1;
        if (transientFailureCount > SOLVE_POLL_MAX_TRANSIENT_FAILURES) {
          throw error;
        }
        nextPollDelayMs = Math.min(
          SOLVE_POLL_INTERVAL_MS * 2 ** (transientFailureCount - 1),
          SOLVE_POLL_MAX_INTERVAL_MS,
        );
        continue;
      }
      if (readOutcome.kind !== "job") return readOutcome;
      const afterRead = interruption(isStale, authorityEpoch);
      if (afterRead) return afterRead;
      job = readOutcome.job;
      transientFailureCount = 0;
      nextPollDelayMs = SOLVE_POLL_INTERVAL_MS;
      onJobChange(job);
    }

    return interruption(isStale, authorityEpoch) ?? { kind: "finished", job };
  };

  return { request, read, latest, poll, cancel, apply };
};
