import React from "react";
import "./styles.css";

interface InputValidationFeedbackProps {
  error?: string;
}

const InputValidationFeedback: React.FC<InputValidationFeedbackProps> = ({
  error,
}) => (error ? <div className="input-feedback">{error}</div> : null);

export default InputValidationFeedback;
