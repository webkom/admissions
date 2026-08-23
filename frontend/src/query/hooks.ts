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
import { useIsWindowIdle } from "src/utils/useIsWindowIdle";
import {
  admissionGroupScope,
  areSensitiveAdmissionCacheWritesBlocked,
  areSensitiveCacheWritesBlocked,
  isSensitiveAuthorityChangedError,
  purgeSensitiveAdmissionAccess,
  runSensitiveAdmissionMutation,
  sensitiveAdmissionMutationOptions,
  type SensitiveAdmissionMutationError,
} from "./sensitiveAccess";
import type { ApplicationViewMode } from "src/types";

type SaveSchedulePayload = Partial<Omit<SavedSchedule, "id" | "updated_at">> & {
  expected_updated_at: string | null;
  deviation_approval_fingerprint?: string;
};

interface SaveScheduleOptions {
  onCanonicalScheduleSaved?: (schedule: SavedSchedule) => void;
}

const accessFailureStatus = (error: unknown) =>
  isAxiosError(error) ? (error.response?.status ?? 0) : 0;

// How long with no mouse/keyboard/scroll activity before a live poll backs
// off. Without this, a tab left open for the bulk of a multi-week
// recruitment period polled exactly as hard as one being actively watched -
// see useIsWindowIdle for the activity tracking itself.
const IDLE_AFTER_MS = 3 * 60 * 1000;
const ADMIN_POLL_ACTIVE_MS = 5000;
const ADMIN_POLL_IDLE_MS = 60000;
const ADMISSION_POLL_ACTIVE_MS = 15000;
const ADMISSION_POLL_IDLE_MS = 120000;

const useSensitiveQueryOptions = (admissionSlug: string) => {
  const isIdle = useIsWindowIdle(IDLE_AFTER_MS);
  return {
    retry: false,
    refetchInterval: (query: { state: { error: unknown } }) =>
      areSensitiveAdmissionCacheWritesBlocked(admissionSlug) ||
      [401, 403, 404].includes(accessFailureStatus(query.state.error))
        ? false
        : isIdle
          ? ADMIN_POLL_IDLE_MS
          : ADMIN_POLL_ACTIVE_MS,
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
  };
};

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
  const isIdle = useIsWindowIdle(IDLE_AFTER_MS);
  const query = useQuery<Admission, AxiosError>({
    queryKey: [`/admission/${slug}/`],
    enabled: Boolean(slug) && !areSensitiveAdmissionCacheWritesBlocked(slug),
    refetchInterval: (query) =>
      areSensitiveAdmissionCacheWritesBlocked(slug) ||
      [401, 403, 404].includes(accessFailureStatus(query.state.error))
        ? false
        : isIdle
          ? ADMISSION_POLL_IDLE_MS
          : ADMISSION_POLL_ACTIVE_MS,
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

const selectAdminApplicationsForScope = (
  applications: AdminApplication[],
  expectedMode: ApplicationViewMode | undefined,
  representedGroups: string[],
): AdminApplication[] => {
  if (!expectedMode) return [];
  if (expectedMode !== "committee_minimal") {
    return applications.filter(
      (application) => application.application_view_mode === expectedMode,
    );
  }

  const allowedGroups = new Set(representedGroups);
  return applications.flatMap((application) => {
    if (application.application_view_mode !== "committee_minimal") return [];
    const groupApplications = application.group_applications.filter(
      ({ group }) => allowedGroups.has(group.name),
    );
    return groupApplications.length > 0
      ? [{ ...application, group_applications: groupApplications }]
      : [];
  });
};

export const useAdminApplications = (
  admissionSlug: string,
  scopeKey: string,
  expectedMode: ApplicationViewMode | undefined,
  representedGroups: string[],
) => {
  const path = `/admin/admission/${admissionSlug}/application/`;
  const query = useQuery<AdminApplication[], AxiosError>({
    queryKey: [path, scopeKey],
    queryFn: async () => (await apiClient.get(path)).data,
    enabled:
      Boolean(admissionSlug) &&
      Boolean(scopeKey) &&
      !areSensitiveAdmissionCacheWritesBlocked(admissionSlug),
    select: (applications) =>
      selectAdminApplicationsForScope(
        applications,
        expectedMode,
        representedGroups,
      ),
    ...useSensitiveQueryOptions(admissionSlug),
    meta: admissionSensitiveQueryMeta(admissionSlug, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useInterviewCandidates = (slug: string, groupId: string) => {
  const scope = admissionGroupScope(slug, groupId);
  const query = useQuery<Candidate[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/group/${groupId}/candidates/`],
    enabled:
      Boolean(slug) &&
      Boolean(groupId) &&
      !areSensitiveAdmissionCacheWritesBlocked(scope),
    ...useSensitiveQueryOptions(scope),
    meta: admissionSensitiveQueryMeta(scope, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSavedSchedule = (slug: string, groupId: string) => {
  const scope = admissionGroupScope(slug, groupId);
  const query = useQuery<SavedSchedule, AxiosError>({
    queryKey: [`/admin/admission/${slug}/group/${groupId}/schedule/`],
    enabled:
      Boolean(slug) &&
      Boolean(groupId) &&
      !areSensitiveAdmissionCacheWritesBlocked(scope),
    ...useSensitiveQueryOptions(scope),
    meta: admissionSensitiveQueryMeta(scope, false),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSaveSchedule = (
  slug: string,
  groupId: string,
  options: SaveScheduleOptions = {},
) => {
  const queryClient = useQueryClient();
  const scope = admissionGroupScope(slug, groupId);
  const scheduleQueryKey = [
    `/admin/admission/${slug}/group/${groupId}/schedule/`,
  ];
  const candidatesQueryKey = [
    `/admin/admission/${slug}/group/${groupId}/candidates/`,
  ];
  return useMutation<
    SavedSchedule,
    SensitiveAdmissionMutationError,
    SaveSchedulePayload
  >({
    ...sensitiveAdmissionMutationOptions(scope),
    mutationFn: (payload) =>
      runSensitiveAdmissionMutation(scope, () =>
        apiClient
          .post(`/admin/admission/${slug}/group/${groupId}/schedule/`, payload)
          .then((r) => r.data),
      ),
    onSuccess: (data) => {
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return;
      options.onCanonicalScheduleSaved?.(data);
      queryClient.setQueryData(scheduleQueryKey, data);
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/group/${groupId}/availability/`],
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

export const useInterviewAvailability = (slug: string, groupId: string) => {
  const scope = admissionGroupScope(slug, groupId);
  const query = useQuery<InterviewAvailabilityParticipant[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/group/${groupId}/availability/`],
    enabled:
      Boolean(slug) &&
      Boolean(groupId) &&
      !areSensitiveAdmissionCacheWritesBlocked(scope),
    ...useSensitiveQueryOptions(scope),
    meta: admissionSensitiveQueryMeta(scope, true),
  });
  return hideDataAfterSensitiveQueryFailure(query);
};

export const useSaveInterviewAvailability = (slug: string, groupId: string) => {
  const queryClient = useQueryClient();
  const scope = admissionGroupScope(slug, groupId);
  const availabilityQueryKey = [
    `/admin/admission/${slug}/group/${groupId}/availability/`,
  ];
  return useMutation<
    InterviewAvailabilityParticipant,
    SensitiveAdmissionMutationError,
    {
      user_id?: string;
      participation?: "awaiting_response" | "not_participating";
      slots?: string[];
      conflicts?: string[];
      reviewed_candidate_ids?: string[];
      experience_level?: ExperienceLevel;
      expected_availability_generation?: number;
      /** Full replacement of this interviewer's declarations. */
      fadderbarn?: {
        lego_user_id: number;
        username?: string;
        full_name?: string;
      }[];
    }
  >({
    ...sensitiveAdmissionMutationOptions(scope),
    mutationFn: (payload) =>
      runSensitiveAdmissionMutation(scope, () =>
        apiClient
          .post(
            `/admin/admission/${slug}/group/${groupId}/availability/`,
            payload,
          )
          .then((r) => r.data),
      ),
    onSuccess: () => {
      if (areSensitiveAdmissionCacheWritesBlocked(scope)) return;
      queryClient.invalidateQueries({
        queryKey: availabilityQueryKey,
      });
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/group/${groupId}/schedule/`],
      });
    },
    onError: (error) => {
      if (isSensitiveAuthorityChangedError(error)) return;
      const status = error.response?.status ?? 0;
      if (status !== 404) return;
      purgeSensitiveAdmissionAccess(queryClient, scope, error);
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

export interface DirectoryMember {
  lego_user_id: number;
  username: string;
  full_name: string;
  profile_picture: string;
}

/**
 * Looks members up in LEGO through admissions, on the signed-in user's own
 * authority. Disabled below the server's minimum query length so a debounced
 * field does not fire a request per keystroke.
 */
export const useMemberSearch = (slug: string, query: string) =>
  useQuery<DirectoryMember[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/member-search/`, query],
    queryFn: () =>
      apiClient
        .get<
          DirectoryMember[]
        >(`/admin/admission/${slug}/member-search/?q=${encodeURIComponent(query)}`)
        .then((response) => response.data),
    enabled: Boolean(slug) && query.trim().length >= 2,
    retry: false,
    staleTime: 60000,
    gcTime: 0,
    meta: { sensitive: true },
  });
