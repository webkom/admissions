import { type Query, type QueryClient } from "@tanstack/react-query";
import { isAxiosError, type AxiosError } from "axios";
import { sanitizeAxiosError } from "src/utils/sanitizeAxiosError";

let sensitiveCacheWritesBlocked = false;
let sensitiveAccessError: AxiosError | null = null;
const sensitiveAdmissionAccessErrors = new Map<string, AxiosError>();

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

export const blockSensitiveAdmissionCacheWrites = (
  admissionSlug: string,
  error: AxiosError,
) => {
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

export const purgeSensitiveAdmissionAccess = (
  queryClient: QueryClient,
  admissionSlug: string,
  error: unknown,
) => {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status ?? 0;
  if (![401, 403, 404].includes(status)) return false;

  if (status === 401 || status === 403) {
    return purgeSensitiveAuthorizationFailure(queryClient, error);
  }

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
  purgeSensitiveQueries(queryClient.getQueryCache().getAll(), error, true);
  purgeSensitiveMutations(queryClient);
  return true;
};
