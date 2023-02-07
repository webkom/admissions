import { useQuery } from "@tanstack/react-query";
import { Admission, Application } from "src/types";

interface QueryError {
  message: string;
  code?: number;
}

export const useAdmissions = () => {
  return useQuery<Admission[], QueryError>(["/admission/"]);
};

export const useAdmission = (admissionId: string | number) => {
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
