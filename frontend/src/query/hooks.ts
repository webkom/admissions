import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Admission, Application, Group, SavedSchedule } from "src/types";
import { apiClient } from "src/utils/callApi";

// Public hooks

export const useAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/admission/"],
  });
};

export const useAdmission = (slug: string) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/admission/${slug}/`],
  });
};

export const useMyApplication = (slug: string) => {
  return useQuery<Application, AxiosError>({
    queryKey: [`/admission/${slug}/application/mine/`],
  });
};

// Admin hooks

export const useAdminAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/admin/admission/"],
  });
};

export const useAdminAdmission = (slug: string) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/admin/admission/${slug}/`],
  });
};

export const useAdminApplications = (admissionSlug: string) => {
  return useQuery<Application[], AxiosError>({
    queryKey: [`/admin/admission/${admissionSlug}/application/`],
  });
};

export const useAdminGroups = () => {
  return useQuery<Group[], AxiosError>({
    queryKey: ["/admin/group/"],
  });
};

// Schedule hooks

export const useSavedSchedule = (slug: string) => {
  return useQuery<SavedSchedule, AxiosError>({
    queryKey: [`/admin/admission/${slug}/schedule/`],
    retry: false,
  });
};

export const useSaveSchedule = (slug: string) => {
  const queryClient = useQueryClient();
  return useMutation<
    SavedSchedule,
    AxiosError,
    Omit<SavedSchedule, "id" | "updated_at">
  >({
    mutationFn: (payload) =>
      apiClient
        .post(`/api/admin/admission/${slug}/schedule/`, payload)
        .then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData([`/admin/admission/${slug}/schedule/`], data);
    },
  });
};

// Manage hooks

export const useManageAdmissions = () => {
  return useQuery<Admission[], AxiosError>({
    queryKey: ["/manage/admission/"],
  });
};

export const useManageAdmission = (slug: string, enabled = true) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/manage/admission/${slug}/`],
    enabled,
  });
};

export const useManageGroups = () => {
  return useQuery<Group[], AxiosError>({
    queryKey: ["/manage/group/"],
  });
};
