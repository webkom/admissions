import { AxiosError, type AxiosResponse } from "axios";

const accessFailureStatuses = new Set([401, 403, 404]);

export const sanitizeAxiosError = (
  error: AxiosError,
  statusOnly = false,
): AxiosError => {
  const status = error.response?.status;
  const accessFailure =
    statusOnly || (status !== undefined && accessFailureStatuses.has(status));
  const serverFailure = status !== undefined && status >= 500;
  const hideResponseData = accessFailure || serverFailure;
  const response =
    status === undefined
      ? undefined
      : ({
          status,
          statusText: hideResponseData
            ? ""
            : (error.response?.statusText ?? ""),
          data: hideResponseData ? undefined : error.response?.data,
          headers: {},
          config: {},
        } as AxiosResponse);

  return new AxiosError(
    accessFailure
      ? "API access is no longer available"
      : serverFailure
        ? "API request failed"
        : error.message,
    error.code,
    undefined,
    undefined,
    response,
  );
};
