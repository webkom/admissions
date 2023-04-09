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

export const useAdminAdmission = (admissionId: string, enabled = true) => {
  return useQuery<Admission, QueryError>([`/admin/admission/${admissionId}/`], {
    enabled,
  });
};

// User hooks

export const useAdmissions = () => {
  return useQuery<Admission[], QueryError>(["/admission/"]);
};

export const useAdmission = (admissionId: string) => {
  return useQuery<Admission, QueryError>([`/admission/${admissionId}/`]);
};

export const useApplications = (admissionId: string) => {
  return useQuery<Application[], QueryError>([
    `/admission/${admissionId}/application/`,
  ]);
};

export const useMyApplication = (admissionId: string | number) => {
  return useQuery<Application, QueryError>([
    `/admission/${admissionId}/application/mine/`,
  ]);
};

export const useGroups = () => {
  return useQuery<Group[], QueryError>(["/group/"]);
};
