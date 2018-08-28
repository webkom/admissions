import React from "react";

import { InputFeedback } from "./styles";

const InputValidationFeedback = ({ error }) =>
  error ? <InputFeedback>{error}</InputFeedback> : null;

export default InputValidationFeedback;
