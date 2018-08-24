import React from "react";

import InputValidationFeedback from "src/components/InputValidationFeedback";
import { CardTitle } from "src/components/Card";

import { StyledField, InfoText } from "./styles";

const PhoneNumberField = ({ field: { name }, form: { touched, errors } }) => {
  const error = touched[name] && errors[name];

  return (
    <div>
      <CardTitle margin="0.5rem" fontSize="0.8em">
        Mobilnummer
        <InfoText>
          Lederen(e) av komiteen(e) du søker bruker mobilnummeret for å kalle
          deg inn på intervju
        </InfoText>
        <InputValidationFeedback error={error} />
      </CardTitle>

      <StyledField
        type="tel"
        name={name}
        onBlur={e => sessionStorage.setItem("phoneNumber", e.target.value)}
        placeholder="Fyll inn mobilnummer..."
      />
    </div>
  );
};

export default PhoneNumberField;
