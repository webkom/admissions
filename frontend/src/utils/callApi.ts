import Cookie from "js-cookie";
import * as Sentry from "@sentry/browser";
import config from "src/utils/config";
import axios, { type AxiosError, type AxiosResponse } from "axios";
import { sanitizeAxiosError } from "src/utils/sanitizeAxiosError";

/**
 * API base
 */
export const apiClient = axios.create({
  baseURL: config.API_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 50000,
});

apiClient.interceptors.request.use((request) => {
  request.headers.set(
    "X-CSRFToken",
    Cookie.get(config.CSRF_COOKIE_NAME ?? "csrftoken") ?? "",
  );
  return request;
});

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    // 4xx is reported too, not just 5xx and network failures. It is still a
    // scrubbed event - a synthetic Error carrying the status, never the
    // response body - but dropping this whole class meant a production
    // incident showing up as client-side 400s or 409s was invisible here.
    if (status === undefined || status >= 400) {
      Sentry.withScope((scope) => {
        scope.setTag("api.status", status ?? "network_error");
        scope.setTag(
          "api.method",
          error.config?.method?.toUpperCase() ?? "UNKNOWN",
        );
        // Path only, never the query string - query params can carry
        // candidate/applicant ids.
        const route = error.config?.url?.split("?")[0];
        if (route) {
          scope.setTag("api.route", route);
          scope.setTransactionName(route);
        }
        Sentry.captureException(
          new Error(
            status ? `API request failed (${status})` : "API request failed",
          ),
        );
      });
    }
    return Promise.reject(sanitizeAxiosError(error));
  },
);
