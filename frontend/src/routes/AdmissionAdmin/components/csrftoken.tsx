import React from "react";
import Cookie from "js-cookie";
import config from "src/utils/config";

const csrftoken = Cookie.get(config.CSRF_COOKIE_NAME ?? "csrftoken");

const CSRFToken = () => {
  return <input type="hidden" name="csrfmiddlewaretoken" value={csrftoken} />;
};
export default CSRFToken;
