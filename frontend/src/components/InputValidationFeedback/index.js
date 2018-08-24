import React from "react";
import "./styles.css";

const InputValidationFeedback = ({ error }) =>
  error ? <div className="input-feedback">{error}</div> : null;

export default InputValidationFeedback;
