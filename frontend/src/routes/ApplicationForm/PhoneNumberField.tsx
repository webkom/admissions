import React, { FocusEvent } from "react";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField,
} from "src/components/styledFields";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { savePhoneNumberDraft } from "src/utils/draftHelper";
import { FormikValues } from "formik";

type PhoneNumberFieldProps = FormikValues;

const PhoneNumberField: React.FC<PhoneNumberFieldProps> = ({
  field: { name },
  form: { touched, errors, handleBlur },
  disabled,
  placeholder = "Fyll inn mobilnummer...",
  title = "Mobilnummer",
}) => {
  const nameSplit = name.split(".");
  const error =
    nameSplit.length > 1
      ? touched[nameSplit[0]] &&
        touched[nameSplit[0]][nameSplit[1]] &&
        errors[nameSplit[0]] &&
        errors[nameSplit[0]][nameSplit[1]]
      : touched[name] && errors[name];

  return (
    <Wrapper>
      <FieldLabel htmlFor={name}>{title}</FieldLabel>

      <StyledField
        type="tel"
        name={name}
        disabled={disabled}
        id={name}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          savePhoneNumberDraft(e.target.value);
          handleBlur(e);
        }}
        placeholder={placeholder}
        error={error}
      />
      <InputValidationFeedback error={error} />
    </Wrapper>
  );
};

export default PhoneNumberField;

/** Styles **/

const Wrapper = styled.div`
  grid-area: phonenumber;

  ${media.portrait`
    margin-top: 1.5rem;
  `};
`;
