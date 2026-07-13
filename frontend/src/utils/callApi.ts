import Cookie from "js-cookie";
import * as Sentry from "@sentry/browser";
import config from "src/utils/config";
import axios, { AxiosError, AxiosResponse } from "axios";

/**
 * API base
 */
export const apiClient = axios.create({
  baseURL: config.API_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRFToken": Cookie.get("csrftoken") ?? "",
  },
  timeout: 50000,
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === undefined || status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag("api.status", status ?? "network_error");
        scope.setTag(
          "api.method",
          error.config?.method?.toUpperCase() ?? "UNKNOWN",
        );
        Sentry.captureException(
          new Error(
            status ? `API request failed (${status})` : "API request failed",
          ),
        );
      });
    }
    return Promise.reject(error);
  },
);
