import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import {
  Admission,
  Candidate,
  Application,
  Group,
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";
import { apiClient } from "src/utils/callApi";

type SaveSchedulePayload = Partial<Omit<SavedSchedule, "id" | "updated_at">> & {
  expected_updated_at?: string;
};

const sensitiveQueryOptions = {
  retry: false,
  refetchInterval: 5000,
  refetchIntervalInBackground: false,
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
  staleTime: 0,
  gcTime: 0,
} as const;

const hideDataAfterAccessDenied = <T>(
  query: UseQueryResult<T, AxiosError>,
): UseQueryResult<T, AxiosError> => {
  if (![401, 403].includes(query.error?.response?.status ?? 0)) return query;
  return { ...query, data: undefined } as UseQueryResult<T, AxiosError>;
};

export const useAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/admission/"],
  });
};

export const useAdmission = (slug: string) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/admission/${slug}/`],
    enabled: Boolean(slug),
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
    staleTime: 0,
  });
};

export const useMyApplication = (slug: string) => {
  return useQuery<Application, AxiosError>({
    queryKey: [`/admission/${slug}/application/mine/`],
    enabled: Boolean(slug),
  });
};

export const useAdminAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/admin/admission/"],
  });
};

export const useAdminAdmission = (slug: string) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/admin/admission/${slug}/`],
    enabled: Boolean(slug),
  });
};

export const useAdminApplications = (admissionSlug: string) => {
  const query = useQuery<Application[], AxiosError>({
    queryKey: [`/admin/admission/${admissionSlug}/application/`],
    enabled: Boolean(admissionSlug),
    ...sensitiveQueryOptions,
  });
  return hideDataAfterAccessDenied(query);
};

export const useInterviewCandidates = (slug: string) => {
  const query = useQuery<Candidate[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/candidates/`],
    enabled: Boolean(slug),
    ...sensitiveQueryOptions,
  });
  return hideDataAfterAccessDenied(query);
};

export const useAdminGroups = () => {
  return useQuery<Group[], AxiosError>({
    queryKey: ["/admin/group/"],
  });
};

export const useSavedSchedule = (slug: string) => {
  const query = useQuery<SavedSchedule, AxiosError>({
    queryKey: [`/admin/admission/${slug}/schedule/`],
    enabled: Boolean(slug),
    ...sensitiveQueryOptions,
  });
  return hideDataAfterAccessDenied(query);
};

export const useSaveSchedule = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation<SavedSchedule, AxiosError, SaveSchedulePayload>({
    mutationFn: (payload) =>
      apiClient
        .post(`/admin/admission/${slug}/schedule/`, payload)
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData([`/admin/admission/${slug}/schedule/`], data);
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/availability/`],
      });
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/candidates/`],
      });
    },
  });
};

export const useInterviewAvailability = (slug: string) => {
  const query = useQuery<InterviewAvailabilityParticipant[], AxiosError>({
    queryKey: [`/admin/admission/${slug}/availability/`],
    enabled: Boolean(slug),
    ...sensitiveQueryOptions,
  });
  return hideDataAfterAccessDenied(query);
};

export const useSaveInterviewAvailability = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation<
    InterviewAvailabilityParticipant,
    AxiosError,
    { slots?: string[]; conflicts?: string[] }
  >({
    mutationFn: (payload) =>
      apiClient
        .post(`/admin/admission/${slug}/availability/`, payload)
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/admin/admission/${slug}/availability/`],
      });
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
