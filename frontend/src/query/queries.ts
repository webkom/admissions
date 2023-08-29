import { QueryFunction, QueryKey } from "@tanstack/react-query";
import { apiClient } from "../utils/callApi";

export const defaultQueryFn: QueryFunction<unknown, QueryKey> = async ({
  queryKey,
}) => {
  const path = queryKey.join("/");
  return (await apiClient.get(path)).data;
};
