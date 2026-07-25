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

/**
 * Report errors to sentry. Registered on the apiClient instance (not the
 * global axios default) so that real API/network errors are actually captured.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    Sentry.setContext("response", {
      response: error.response,
    });
    Sentry.captureException(error);
    return Promise.reject(error);
  },
);
