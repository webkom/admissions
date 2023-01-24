import { useQuery } from "@tanstack/react-query";
import { Admission, Application } from "src/types";

interface QueryError {
  message: string;
  code?: number;
}

export const useAdmissions = () => {
  return useQuery<Admission[], QueryError>(["/admission/"]);
};

export const useAdmission = (admissionId: string, enabled = true) => {
  return useQuery<Admission, QueryError>([`/admission/${admissionId}/`], {
    enabled,
  });
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
