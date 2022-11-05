import React from "react";
import InputValidationFeedback from "src/components/InputValidationFeedback";
import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";

interface TextAreaFieldProps {
  placeholder: string;
  title: string;
  field: {
    name: string;
    onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
    value: string;
  };
  form: {
    touched: { [key: string]: string };
    errors: { [key: string]: string };
    handleBlur: () => void;
  };
}

const TextAreaField: React.FC<TextAreaFieldProps> = ({
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
        name={name}
        id={name}
        onChange={onChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        value={value}
        rows={10}
      />
    </div>
  );
};

export default TextAreaField;
