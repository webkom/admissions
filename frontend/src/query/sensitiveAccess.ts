import { type Query, type QueryClient } from "@tanstack/react-query";
import { isAxiosError, type AxiosError } from "axios";
import type { Admission } from "src/types";
import type {
  AdmissionActions,
  AdmissionGroupContext,
  AdmissionResourceScopes,
} from "src/types";
import {
  canOpenScheduleWorkspace,
  type ScheduleWorkspaceContext,
} from "src/utils/admissionAccess";
import { sanitizeAxiosError } from "src/utils/sanitizeAxiosError";
import {
  clearAllSensitiveBrowserStorage,
  clearSensitiveAdmissionBrowserStorage,
} from "./sensitiveBrowserStorage";

let sensitiveCacheWritesBlocked = false;
let sensitiveAccessError: AxiosError | null = null;
const sensitiveAdmissionAccessErrors = new Map<string, AxiosError>();
let sensitiveGlobalAuthorityEpoch = 0;
const sensitiveAdmissionAuthorityEpochs = new Map<string, number>();

export interface SensitiveAdmissionAuthorityEpoch {
  global: number;
  admission: number;
}

export class SensitiveAuthorityChangedError extends Error {
  readonly admissionSlug: string;

  constructor(admissionSlug: string) {
    super(
      "The authenticated admission authority changed while the request was in flight.",
    );
    this.name = "SensitiveAuthorityChangedError";
    this.admissionSlug = admissionSlug;
  }
}

export type SensitiveAdmissionMutationError =
  | AxiosError
  | SensitiveAuthorityChangedError;

const advanceSensitiveGlobalAuthorityEpoch = () => {
  sensitiveGlobalAuthorityEpoch += 1;
};

const advanceSensitiveAdmissionAuthorityEpoch = (admissionSlug: string) => {
  sensitiveAdmissionAuthorityEpochs.set(
    admissionSlug,
    (sensitiveAdmissionAuthorityEpochs.get(admissionSlug) ?? 0) + 1,
  );
};

export const captureSensitiveAdmissionAuthorityEpoch = (
  admissionSlug: string,
): SensitiveAdmissionAuthorityEpoch => ({
  global: sensitiveGlobalAuthorityEpoch,
  admission: sensitiveAdmissionAuthorityEpochs.get(admissionSlug) ?? 0,
});

export const isSensitiveAdmissionAuthorityEpochCurrent = (
  admissionSlug: string,
  epoch: SensitiveAdmissionAuthorityEpoch,
) =>
  epoch.global === sensitiveGlobalAuthorityEpoch &&
  epoch.admission ===
    (sensitiveAdmissionAuthorityEpochs.get(admissionSlug) ?? 0);

export const isSensitiveAuthorityChangedError = (
  error: unknown,
): error is SensitiveAuthorityChangedError =>
  error instanceof SensitiveAuthorityChangedError ||
  (error instanceof Error &&
    error.name === "SensitiveAuthorityChangedError" &&
    "admissionSlug" in error &&
    typeof error.admissionSlug === "string");

/**
 * Capture authority at request dispatch, then turn any response that crosses
 * an authentication or admission-scope boundary into an inert stale result.
 * Callers must ignore SensitiveAuthorityChangedError in their error handlers.
 */
export const runSensitiveAdmissionMutation = async <T>(
  admissionSlug: string,
  request: () => Promise<T>,
) => {
  const authorityEpoch = captureSensitiveAdmissionAuthorityEpoch(admissionSlug);
  if (areSensitiveAdmissionCacheWritesBlocked(admissionSlug)) {
    throw new SensitiveAuthorityChangedError(admissionSlug);
  }

  try {
    const result = await request();
    if (
      !isSensitiveAdmissionAuthorityEpochCurrent(admissionSlug, authorityEpoch)
    ) {
      throw new SensitiveAuthorityChangedError(admissionSlug);
    }
    return result;
  } catch (error) {
    if (
      !isSensitiveAdmissionAuthorityEpochCurrent(admissionSlug, authorityEpoch)
    ) {
      throw new SensitiveAuthorityChangedError(admissionSlug);
    }
    throw error;
  }
};

const blockSensitiveCacheWrites = () => {
  sensitiveCacheWritesBlocked = true;
};

export const areSensitiveCacheWritesBlocked = () => sensitiveCacheWritesBlocked;

export const areSensitiveAdmissionCacheWritesBlocked = (
  admissionSlug: string,
) =>
  sensitiveCacheWritesBlocked ||
  sensitiveAdmissionAccessErrors.has(admissionSlug);

export const getSensitiveAccessError = () => sensitiveAccessError;

export const getSensitiveAdmissionAccessError = (admissionSlug: string) =>
  sensitiveAdmissionAccessErrors.get(admissionSlug) ?? null;

export const buildSensitiveAdmissionScopeKey = ({
  actorId,
  isAdmin,
  committeeRole,
  representedGroups,
  committeeGroups,
  groupContexts = [],
  admissionActions,
  resourceScopes,
  scheduleContext,
}: {
  actorId: string | null;
  isAdmin: boolean;
  committeeRole: string | null;
  representedGroups: string[];
  committeeGroups: string[];
  groupContexts?: AdmissionGroupContext[];
  admissionActions?: AdmissionActions;
  resourceScopes?: AdmissionResourceScopes;
  scheduleContext?: ScheduleWorkspaceContext | null;
}) =>
  JSON.stringify({
    actorId,
    isAdmin,
    committeeRole,
    representedGroups: [...representedGroups].sort(),
    committeeGroups: [...committeeGroups].sort(),
    groupContexts: groupContexts
      .map((context) => ({
        groupId: context.group.id,
        membershipRoles: [...context.membership_roles].sort(),
        sources: context.sources,
        actions: context.actions,
      }))
      .sort((left, right) => left.groupId.localeCompare(right.groupId)),
    admissionActions,
    resourceScopes,
    scheduleContext: scheduleContext
      ? {
          mode: scheduleContext.mode,
          groupId: scheduleContext.groupContext?.group.id ?? null,
          valid: scheduleContext.valid,
        }
      : null,
  });

export const clearSensitiveAdmissionDataForScopeChange = (
  queryClient: QueryClient,
  admissionSlug: string,
  { clearBrowserStorage = true }: { clearBrowserStorage?: boolean } = {},
) => {
  advanceSensitiveAdmissionAuthorityEpoch(admissionSlug);
  if (clearBrowserStorage) {
    clearSensitiveAdmissionBrowserStorage(admissionSlug);
  }
  const admissionDescriptorKey = `/admission/${admissionSlug}/`;
  const admissionAdminPrefix = `/admin/admission/${admissionSlug}/`;
  const personalAdmissionPrefix = `/admission/${admissionSlug}/application/`;
  const queryCache = queryClient.getQueryCache();
  queryCache
    .getAll()
    .filter((query) => {
      const isAdmissionDescriptor = query.queryKey.some(
        (part) => part === admissionDescriptorKey,
      );
      return (
        !isAdmissionDescriptor &&
        (query.meta?.admissionSlug === admissionSlug ||
          query.queryKey.some(
            (part) =>
              typeof part === "string" &&
              (part.startsWith(admissionAdminPrefix) ||
                part.startsWith(personalAdmissionPrefix)),
          ))
      );
    })
    .forEach((query) => {
      void query.cancel({ silent: true });
      queryCache.remove(query);
    });
  purgeSensitiveMutations(queryClient, admissionSlug);
};

/**
 * Re-enable sensitive reads only after the caller has made a fresh request
 * outside React Query and verified that the server still reports an active
 * scheduler role. A global block invalidates every sensitive scope; a known
 * admission block invalidates only that admission.
 */
export const restoreSensitiveAccessAfterVerifiedAdmission = (
  queryClient: QueryClient,
  admissionSlug: string,
  verifiedAdmission: Admission,
) => {
  const hasSchedulerRole = canOpenScheduleWorkspace(verifiedAdmission.userdata);
  if (verifiedAdmission.slug !== admissionSlug || !hasSchedulerRole) {
    return false;
  }

  if (sensitiveAccessError || sensitiveCacheWritesBlocked) {
    advanceSensitiveGlobalAuthorityEpoch();
    const queryCache = queryClient.getQueryCache();
    queryCache
      .getAll()
      .filter((query) => query.meta?.sensitive === true)
      .forEach((query) => {
        void query.cancel({ silent: true });
        queryCache.remove(query);
      });
    purgeSensitiveMutations(queryClient);
    sensitiveAccessError = null;
    sensitiveCacheWritesBlocked = false;
  } else {
    clearSensitiveAdmissionDataForScopeChange(queryClient, admissionSlug);
  }
  sensitiveAdmissionAccessErrors.delete(admissionSlug);
  return true;
};

export const blockSensitiveAdmissionCacheWrites = (
  admissionSlug: string,
  error: AxiosError,
) => {
  advanceSensitiveAdmissionAuthorityEpoch(admissionSlug);
  const accessError = sanitizeAxiosError(error, true);
  sensitiveAdmissionAccessErrors.set(admissionSlug, accessError);
  return accessError;
};

export const sensitiveAdmissionMutationOptions = (admissionSlug: string) => ({
  gcTime: 0,
  meta: { sensitive: true, admissionSlug },
});

export const purgeSensitiveQuery = <TError>(
  query: Query<unknown, TError, unknown, readonly unknown[]>,
  error: TError,
) => {
  void query.cancel({ silent: true });
  query.setState({
    data: undefined,
    dataUpdatedAt: 0,
    error,
    errorUpdatedAt: Date.now(),
    fetchFailureReason: error,
    fetchStatus: "idle",
    isInvalidated: true,
    status: "error",
  });
};

export const purgeSensitiveQueries = <TError>(
  queries: Query<unknown, TError, unknown, readonly unknown[]>[],
  error: TError,
  blockWrites: boolean,
) => {
  let purgeError = error;
  if (blockWrites && isAxiosError(error)) {
    advanceSensitiveGlobalAuthorityEpoch();
    const accessError = sanitizeAxiosError(error, true);
    sensitiveAccessError = accessError;
    purgeError = accessError as TError;
    blockSensitiveCacheWrites();
  }
  queries
    .filter((query) => query.meta?.sensitive === true)
    .forEach((query) => purgeSensitiveQuery(query, purgeError));
};

export const purgeSensitiveAdmissionQueries = <TError>(
  queries: Query<unknown, TError, unknown, readonly unknown[]>[],
  admissionSlug: string,
  error: TError,
  blockWrites: boolean,
) => {
  const admissionPrefixes = [
    `/admin/admission/${admissionSlug}/`,
    `/admission/${admissionSlug}/`,
  ];
  purgeSensitiveQueries(
    queries.filter(
      (query) =>
        query.meta?.admissionSlug === admissionSlug ||
        query.queryKey.some(
          (part) =>
            typeof part === "string" &&
            admissionPrefixes.some((prefix) => part.startsWith(prefix)),
        ),
    ),
    error,
    blockWrites,
  );
};

export const purgeSensitiveMutations = (
  queryClient: QueryClient,
  admissionSlug?: string,
) => {
  const mutationCache = queryClient.getMutationCache();
  mutationCache
    .getAll()
    .filter(
      (mutation) =>
        mutation.meta?.sensitive === true &&
        (admissionSlug === undefined ||
          mutation.meta?.admissionSlug === admissionSlug),
    )
    .forEach((mutation) => mutationCache.remove(mutation));
};

export const clearAllSensitiveDataForActorChange = (
  queryClient: QueryClient,
) => {
  advanceSensitiveGlobalAuthorityEpoch();
  clearAllSensitiveBrowserStorage();
  const queryCache = queryClient.getQueryCache();
  queryCache
    .getAll()
    .filter((query) => query.meta?.sensitive === true)
    .forEach((query) => {
      void query.cancel({ silent: true });
      queryCache.remove(query);
    });
  purgeSensitiveMutations(queryClient);
};

export const purgeSensitiveAdmissionAccess = (
  queryClient: QueryClient,
  admissionSlug: string,
  error: unknown,
  {
    scopeForbiddenToAdmission = false,
  }: { scopeForbiddenToAdmission?: boolean } = {},
) => {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status ?? 0;
  if (![401, 403, 404].includes(status)) return false;

  if (status === 401 || (status === 403 && !scopeForbiddenToAdmission)) {
    return purgeSensitiveAuthorizationFailure(queryClient, error);
  }

  clearSensitiveAdmissionBrowserStorage(admissionSlug);
  const queries = queryClient.getQueryCache().getAll();
  const accessError = blockSensitiveAdmissionCacheWrites(admissionSlug, error);
  purgeSensitiveAdmissionQueries(queries, admissionSlug, accessError, false);
  purgeSensitiveMutations(queryClient, admissionSlug);
  return true;
};

export const purgeSensitiveAuthorizationFailure = (
  queryClient: QueryClient,
  error: unknown,
) => {
  if (
    !isAxiosError(error) ||
    ![401, 403].includes(error.response?.status ?? 0)
  ) {
    return false;
  }
  clearAllSensitiveBrowserStorage();
  purgeSensitiveQueries(queryClient.getQueryCache().getAll(), error, true);
  purgeSensitiveMutations(queryClient);
  return true;
};
