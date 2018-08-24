import React from "react";

import InputValidationFeedback from "src/components/InputValidationFeedback";
import { CardTitle } from "src/components/Card";

import { StyledTextarea } from "./styles";

const TextAreaField = ({
  placeholder,
  title,
  field: { name, onChange, value },
  form: { touched, errors }
}) => {
  const error = touched[name] && errors[name];

  return (
    <div>
      <CardTitle margin="0.5rem" fontSize="0.8em">
        {title}
        <InputValidationFeedback error={error} />
      </CardTitle>

      <StyledTextarea
        className="textarea"
        type="textarea"
        name={name}
        id={name}
        onChange={onChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        value={value}
        rows="10"
      />
    </div>
  );
};

export default TextAreaField;
