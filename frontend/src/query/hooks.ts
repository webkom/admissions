import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { AxiosError, isAxiosError } from "axios";
import {
  Admission,
  AdmissionList,
  AdminApplication,
  Candidate,
  Application,
  Group,
  InterviewAvailabilityParticipant,
  ExperienceLevel,
  SavedSchedule,
} from "src/types";
import { apiClient } from "src/utils/callApi";
import {
  areSensitiveAdmissionCacheWritesBlocked,
  areSensitiveCacheWritesBlocked,
  isSensitiveAuthorityChangedError,
  purgeSensitiveAdmissionAccess,
  runSensitiveAdmissionMutation,
  sensitiveAdmissionMutationOptions,
  type SensitiveAdmissionMutationError,
} from "./sensitiveAccess";

type SaveSchedulePayload = Partial<
  Omit<SavedSchedule, "id" | "updated_at" | "revealed_groups">
> & {
  expected_updated_at: string | null;
  deviation_approval_fingerprint?: string;
};

interface SaveScheduleOptions {
  onCanonicalScheduleSaved?: (schedule: SavedSchedule) => void;
}

const accessFailureStatus = (error: unknown) =>
  isAxiosError(error) ? (error.response?.status ?? 0) : 0;

const sensitiveQueryOptions = (admissionSlug: string) => ({
  retry: false,
  refetchInterval: (query: { state: { error: unknown } }) =>
    areSensitiveAdmissionCacheWritesBlocked(admissionSlug) ||
    [401, 403, 404].includes(accessFailureStatus(query.state.error))
      ? false
      : 5000,
  refetchIntervalInBackground: false,
  refetchOnMount: () =>
    areSensitiveAdmissionCacheWritesBlocked(admissionSlug)
      ? false
      : ("always" as const),
  refetchOnWindowFocus: () =>
    areSensitiveAdmissionCacheWritesBlocked(admissionSlug)
      ? false
      : ("always" as const),
  staleTime: 0,
  gcTime: 0,
  meta: { sensitive: true },
});

const admissionSensitiveQueryMeta = (
  admissionSlug: string,
  purgeAdmissionOnNotFound: boolean,
) => ({
  sensitive: true,
  admissionSlug,
  purgeAdmissionOnNotFound,
});

const personalQueryOptions = {
  retry: false,
  gcTime: 0,
  meta: { sensitive: true },
} as const;

const HTTP_CONFLICT_STATUS = 409;

const hideDataAfterSensitiveQueryFailure = <T>(
  query: UseQueryResult<T, AxiosError>,
): UseQueryResult<T, AxiosError> => {
  if (![401, 403, 404].includes(query.error?.response?.status ?? 0))
    return query;
  return { ...query, data: undefined } as UseQueryResult<T, AxiosError>;
};

export const useAdmissions = () => {
  const query = useQuery<AdmissionList[], AxiosError>({
    queryKey: ["/admission/"],
    enabled: !areSensitiveCacheWritesBlocked(),
    ...personalQueryOptions,
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useAdmission = (slug: string) => {
  const query = useQuery<Admission, AxiosError>({
    queryKey: [`/admission/${slug}/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    refetchInterval: (query) =>
      areSensitiveAdmissionCacheWritesBlocked(slug) ||
      [401, 403, 404].includes(accessFailureStatus(query.state.error))
        ? false
        : 15000,
    refetchOnWindowFocus: () =>
      areSensitiveAdmissionCacheWritesBlocked(slug) ? false : "always",
    staleTime: 0,
    ...personalQueryOptions,
    meta: admissionSensitiveQueryMeta(slug, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useMyApplication = (slug: string) => {
  const query = useQuery<Application, AxiosError>({
    queryKey: [`/admission/${slug}/application/mine/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    ...personalQueryOptions,
    meta: admissionSensitiveQueryMeta(slug, false),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useAdminApplications = (admissionSlug: string) => {
  const query = useQuery<AdminApplication[], AxiosError>({
    queryKey: [`/admin/admission/${admissionSlug}/application/`],
    enabled:
      Boolean(admissionSlug) &&
      !areSensitiveAdmissionCacheWritesBlocked(admissionSlug),
    ...sensitiveQueryOptions(admissionSlug),
    meta: admissionSensitiveQueryMeta(admissionSlug, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useInterviewCandidates = (slug: string) => {
  const query = useQuery<Candidate[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/candidates/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    ...sensitiveQueryOptions(slug),
    meta: admissionSensitiveQueryMeta(slug, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSavedSchedule = (slug: string) => {
  const query = useQuery<SavedSchedule, AxiosError>({
    queryKey: [`/admin/admission/${slug}/schedule/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    ...sensitiveQueryOptions(slug),
    meta: admissionSensitiveQueryMeta(slug, false),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSaveSchedule = (
  slug: string,
  options: SaveScheduleOptions = {},
) => {
  const queryClient = useQueryClient();
  const scheduleQueryKey = [`/admin/admission/${slug}/schedule/`];
  const candidatesQueryKey = [`/admin/admission/${slug}/candidates/`];
  return useMutation<
    SavedSchedule,
    SensitiveAdmissionMutationError,
    SaveSchedulePayload
  >({
    ...sensitiveAdmissionMutationOptions(slug),
    mutationFn: (payload) =>
      runSensitiveAdmissionMutation(slug, () =>
        apiClient
          .post(`/admin/admission/${slug}/schedule/`, payload)
          .then((r) => r.data),
      ),
    onSuccess: (data) => {
      if (areSensitiveAdmissionCacheWritesBlocked(slug)) return;
      options.onCanonicalScheduleSaved?.(data);
      queryClient.setQueryData(scheduleQueryKey, data);
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/availability/`],
      });
      queryClient.invalidateQueries({
        queryKey: candidatesQueryKey,
      });
    },
    onError: async (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if ([401, 403].includes(status)) return;
      if (status === 404) {
        queryClient.removeQueries({ queryKey: scheduleQueryKey, exact: true });
        await queryClient.invalidateQueries({
          queryKey: candidatesQueryKey,
          exact: true,
          refetchType: "all",
        });
        return;
      }
      if (error.response?.status !== HTTP_CONFLICT_STATUS) return;
      await queryClient.invalidateQueries({
        queryKey: scheduleQueryKey,
        exact: true,
        refetchType: "active",
      });
    },
  });
};

export const useInterviewAvailability = (slug: string) => {
  const query = useQuery<InterviewAvailabilityParticipant[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/availability/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    ...sensitiveQueryOptions(slug),
    meta: admissionSensitiveQueryMeta(slug, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSaveInterviewAvailability = (slug: string) => {
  const queryClient = useQueryClient();
  const availabilityQueryKey = [`/admin/admission/${slug}/availability/`];
  return useMutation<
    InterviewAvailabilityParticipant,
    SensitiveAdmissionMutationError,
    {
      user_id?: string;
      participation?: "awaiting_response" | "not_participating";
      slots?: string[];
      conflicts?: string[];
      reviewed_candidate_ids?: string[];
      conflict_collection_reviewed_candidate_ids?: string[];
      conflict_collection_revision?: string;
      experience_level?: ExperienceLevel;
      expected_availability_generation?: number;
    }
  >({
    ...sensitiveAdmissionMutationOptions(slug),
    mutationFn: (payload) =>
      runSensitiveAdmissionMutation(slug, () =>
        apiClient
          .post(`/admin/admission/${slug}/availability/`, payload)
          .then((r) => r.data),
      ),
    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(slug)) return;
      queryClient.invalidateQueries({
        queryKey: availabilityQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/schedule/`],
      });
    },
    onError: (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (status !== 404) return;
      purgeSensitiveAdmissionAccess(queryClient, slug, error);
    },
  });
};

export const useManageAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/manage/admission/"],
  });
};

export const useManageAdmission = (slug: string, enabled = true) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/manage/admission/${slug}/`],
    enabled: enabled && Boolean(slug),
  });
};

export const useManageGroups = () => {
  return useQuery<Group[], AxiosError>({
    queryKey: ["/manage/group/"],
  });
};
