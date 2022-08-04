import { useQuery } from "react-query";

export const useGroups = () => {
  return useQuery(["/group/"]);
};

export const useAdmission = () => {
  const query = useQuery(["/admission/"]);
  // The API seemingly supports multiple admissions at the same time,
  // but it is not currently being used.
  // Thus this hook only returns the first, as that is all that is
  // currently used in the project.
  return { ...query, data: query.data ? query.data[0] : undefined };
};

export const useApplications = () => {
  return useQuery(["/application/"]);
};

export const useMyApplication = () => {
  return useQuery(["/application/mine/"]);
};
