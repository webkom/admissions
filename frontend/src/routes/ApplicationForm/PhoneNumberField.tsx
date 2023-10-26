import React, { FocusEvent, useMemo } from "react";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField,
} from "src/components/styledFields";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { savePhoneNumberDraft } from "src/utils/draftHelper";
import { FormikValues } from "formik";
import { traverseObject } from "src/utils/methods";

type PhoneNumberFieldProps = FormikValues;

const PhoneNumberField: React.FC<PhoneNumberFieldProps> = ({
  field: { name },
  form: { touched, errors, handleBlur },
  disabled,
}) => {
  const fieldError = useMemo(
    () => traverseObject(name, errors),
    [name, errors]
  );
  const fieldTouched = useMemo(
    () => traverseObject(name, touched),
    [name, touched]
  );

  return (
    <Wrapper>
      <FieldLabel htmlFor={name}>Mobilnummer</FieldLabel>

      <StyledField
        type="tel"
        name={name}
        disabled={disabled}
        id={name}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          savePhoneNumberDraft(e.target.value);
          handleBlur(e);
        }}
        placeholder="Fyll inn mobilnummer..."
        error={fieldTouched && fieldError}
      />
      <InputValidationFeedback error={fieldTouched && fieldError} />
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
