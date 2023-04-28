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
  timeout: 20000,
});

/**
 * Report errors to sentry
 */
axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    Sentry.setContext("response", {
      response: error.response,
    });
    Sentry.captureException(error);
    return Promise.reject(error);
  }
);
