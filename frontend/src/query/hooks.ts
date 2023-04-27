import { useQuery } from "@tanstack/react-query";
import { Admission, Application, Group } from "src/types";

interface QueryError {
  message: string;
  code?: number;
}

// Admin hooks

export const useAdminAdmissions = () => {
  return useQuery<Admission[], QueryError>(["/admin/admission/"]);
};

export const useAdminAdmission = (slug: string, enabled = true) => {
  return useQuery<Admission, QueryError>([`/admin/admission/${slug}/`], {
    enabled,
  });
};

// User hooks

export const useAdmissions = () => {
  return useQuery<Admission[], QueryError>(["/admission/"]);
};

export const useAdmission = (slug: string) => {
  return useQuery<Admission, QueryError>([`/admission/${slug}/`]);
};

export const useApplications = (slug: string) => {
  return useQuery<Application[], QueryError>([
    `/admission/${slug}/application/`,
  ]);
};

export const useMyApplication = (slug: string) => {
  return useQuery<Application, QueryError>([
    `/admission/${slug}/application/mine/`,
  ]);
};

export const useGroups = () => {
  return useQuery<Group[], QueryError>(["/group/"]);
};
