import React, { useMemo } from "react";
import InputValidationFeedback from "src/components/InputValidationFeedback";
import { FieldLabel, StyledTextAreaField } from "src/components/styledFields";
import { traverseObject } from "src/utils/methods";

interface TextAreaFieldProps {
  placeholder: string;
  label: string;
  disabled: boolean;
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
  label,
  disabled,
  field: { name, onChange, value },
  form: { touched, errors, handleBlur },
}) => {
  const fieldTouched = useMemo(
    () => traverseObject(name, touched),
    [name, touched]
  );
  const fieldError = useMemo(
    () => traverseObject(name, errors),
    [name, errors]
  );
  const error = fieldTouched && fieldError;

  return (
    <div>
      <FieldLabel htmlFor={name}>
        {label}
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
        disabled={disabled}
      />
    </div>
  );
};

export default TextAreaField;
