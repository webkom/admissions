import React from "react";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField
} from "src/components/styledFields";

const PhoneNumberField = ({ field: { name }, form: { touched, errors } }) => {
  const error = touched[name] && errors[name];

  return (
    <div>
      <FieldLabel>Mobilnummer</FieldLabel>

      <StyledField
        type="tel"
        name={name}
        onBlur={e => sessionStorage.setItem("phoneNumber", e.target.value)}
        placeholder="Fyll inn mobilnummer..."
        error={error}
      />
      <InputValidationFeedback error={error} />
    </div>
  );
};

export default PhoneNumberField;
