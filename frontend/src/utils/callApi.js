import { compose } from "recompose";
import Cookie from "js-cookie";
import Raven from "raven-js";
import config from "src/utils/config";

export class HttpError extends Error {
  response: Response;
}

function reportToSentry(error) {
  error && Raven.captureException(error);
  throw error;
}
function timeoutPromise(ms = 0) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  }).then(() => {
    throw new Error("HTTP request timed out.");
  });
}

async function parseResponseBody(response) {
  const textString = await response.text();
  const contentType =
    response.headers.get("content-type") || "application/json";

  if (contentType.includes("application/json") && textString) {
    response.jsonData = JSON.parse(textString);
  }

  response.textString = textString;
  return response;
}

function rejectOnHttpErrors(response) {
  if (response.ok) return response;

  const error = new HttpError(`HTTP ${response.status}`);
  error.response = response;
  throw error;
}

const callApi = async (url, { method = "GET", body = null } = {}) => {
  const request = new Request(`${config.API_URL}${url}`, {
    method,
    headers: new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": Cookie.get("csrftoken"),
      "Access-Control-Allow-Credentials": true
    }),
    redirect: "manual",
    credentials: "include",
    // IE don't support body equal to null
    ...(body ? { body } : {})
  });
  const res = await Promise.race([timeoutPromise(20000), fetch(request)]);
  if (res.status === 401) {
    window.location = `/login/lego/?next=${window.location.pathname}`;
    throw null;
  }

  return parseResponseBody(res).then(rejectOnHttpErrors);
};
export default (...input) => callApi(...input).catch(reportToSentry);
