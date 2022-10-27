import { useQuery } from "react-query";

export const useAdmissions = () => {
  return useQuery(["/admission/"]);
};

export const useAdmission = (admissionId) => {
  return useQuery([`/admission/${admissionId}/`]);
};

export const useApplications = (admissionId) => {
  return useQuery([`/admission/${admissionId}/application/`]);
};

export const useMyApplication = (admissionId) => {
  return useQuery([`/admission/${admissionId}/application/mine/`]);
};
