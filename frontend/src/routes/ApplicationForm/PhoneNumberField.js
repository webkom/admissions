import React from "react";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField
} from "src/components/styledFields";

const PhoneNumberField = ({
  field: { name },
  form: { touched, errors, handleBlur }
}) => {
  const error = touched[name] && errors[name];

  return (
    <div>
      <FieldLabel htmlFor={name}>Mobilnummer</FieldLabel>

      <StyledField
        type="tel"
        name={name}
        onBlur={e => {
          sessionStorage.setItem("phoneNumber", e.target.value);
          handleBlur();
        }}
        placeholder="Fyll inn mobilnummer..."
        error={error}
      />
      <InputValidationFeedback error={error} />
    </div>
  );
};

export default PhoneNumberField;
