import { callApiFromQuery } from "../utils/callApi";

interface defaultQueryFnProps {
  queryKey: string[];
}

export const defaultQueryFn: any = async ({
  queryKey,
}: defaultQueryFnProps) => {
  const path = typeof queryKey === "string" ? queryKey : queryKey[0];
  return await callApiFromQuery(path);
};
