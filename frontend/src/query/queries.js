import { callApiFromQuery } from "../utils/callApi";

export const defaultQueryFn = async ({ queryKey }) => {
  const path = typeof queryKey === "string" ? queryKey : queryKey[0];
  return await callApiFromQuery(path);
};
