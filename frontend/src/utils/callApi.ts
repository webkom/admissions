import Cookie from "js-cookie";
import * as Sentry from "@sentry/browser";
import config from "src/utils/config";
import "whatwg-fetch";

export class HttpError extends Error {}

function reportToSentry(error) {
  try {
    if (error.response) {
      Sentry.setContext("response", {
        response: error.response,
      });
    }
  } catch (e) {
    //
  }
  Sentry.captureException(error);
  throw error;
}
function timeoutPromise(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  }).then(() => {
    throw new Error("HTTP request timed out.");
  });
}

const _callApiFromQuery = async (url, { method = "GET", body = null } = {}) => {
  const request = new Request(`${config.API_URL}${url}`, {
    method,
    headers: new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": Cookie.get("csrftoken"),
      "Access-Control-Allow-Credentials": true,
    }),
    redirect: "manual",
    credentials: "include",
    // IE don't support body equal to null
    ...(body ? { body } : {}),
  });
  const response = await Promise.race([timeoutPromise(20000), fetch(request)]);
  const contentType =
    response.headers.get("content-type") || "application/json";
  const contentLength =
    parseInt(response.headers.get("content-length"), 10) || 0;
  if (response.status !== 200) {
    const newError = new Error(response.statusText);
    newError.code = response.status;
    throw newError;
  }
  if (contentType.includes("application/json") && contentLength !== 0) {
    return await response.json();
  }
  const responseText = await response.text();
  return responseText;
};
export const callApiFromQuery = (...input) =>
  _callApiFromQuery(...input).catch(reportToSentry);
