import React from "react";
import "./styles.css";

interface InputValidationFeedbackProps {
  error: string;
}

const InputValidationFeedback: React.FC<InputValidationFeedbackProps> = ({
  error,
}) => (error ? <p className="input-feedback">{error}</p> : null);

export default InputValidationFeedback;
