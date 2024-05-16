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

export const useGroups = () => {
  return useQuery<Group[], AxiosError>({
    queryKey: ["/group/"],
  });
};

// Admin hooks

export const useAdminApplications = (admissionSlug: string) => {
  return useQuery<Application[], AxiosError>({
    queryKey: [`/admission/${admissionSlug}/admin/application/`],
  });
};

// Manage hooks

export const useAdminAdmissions = () => {
  return useQuery<Admission[], AxiosError>({ queryKey: ["/admin/admission/"] });
};

export const useAdminAdmission = (slug: string, enabled = true) => {
  return useQuery<Admission, AxiosError>({
    queryKey: [`/admin/admission/${slug}/`],
    enabled,
  });
};
