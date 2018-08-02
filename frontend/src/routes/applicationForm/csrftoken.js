import React from "react";
import Cookie from "js-cookie";

var csrftoken = Cookie.get("csrftoken");

const CSRFToken = () => {
  return <input type="hidden" name="csrfmiddlewaretoken" value={csrftoken} />;
};
export default CSRFToken;
