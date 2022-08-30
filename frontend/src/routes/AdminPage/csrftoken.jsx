import React from "react";
import Cookie from "js-cookie";

const csrftoken = Cookie.get("csrftoken");

const CSRFToken = () => {
  return <input type="hidden" name="csrfmiddlewaretoken" value={csrftoken} />;
};
export default CSRFToken;
