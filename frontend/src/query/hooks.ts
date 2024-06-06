import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { Admission, Application, Group } from "src/types";

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
