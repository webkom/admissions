import React from "react";
import InputValidationFeedback from "src/components/InputValidationFeedback";
import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";

const TextAreaField = ({
  placeholder,
  title,
  field: { name, onChange, value },
  form: { touched, errors, handleBlur },
}) => {
  const error = touched[name] && errors[name];

  return (
    <div>
      <FieldLabel>
        {title}
        <InputValidationFeedback error={error} />
      </FieldLabel>

      <StyledTextAreaField
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
