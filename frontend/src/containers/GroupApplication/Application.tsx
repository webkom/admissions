import React, { useEffect } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledTextAreaField,
} from "src/components/styledFields";
import readmeIfy from "src/components/ReadmeLogo";
import useDebouncedState from "src/utils/useDebouncedState";
import { saveApplicationTextDraft } from "src/utils/draftHelper";
import { Group } from "src/types";
import { FieldInputProps, FormikProps } from "formik";
import { FormValues } from "src/routes/ApplicationForm";

type FieldValue = string;

export interface ApplicationProps {
  responseLabel: string;
  group: Group;
  field: FieldInputProps<FieldValue>;
  form: FormikProps<FormValues>;
  disabled: boolean;
}
const replaceLinebreak = (text: string) =>
  text.split("\n").map((val) => (
    <>
      {val}
      <br />
    </>
  ));

const Application: React.FC<ApplicationProps> = ({
  responseLabel,
  group,
  field: { name, onChange, value },
  form: { touched, errors, handleBlur },
  disabled,
}) => {
  const debouncedValue = useDebouncedState(value);

  useEffect(() => {
    saveApplicationTextDraft([group.name, value]);
  }, [debouncedValue]);

  const error =
    touched.groups && touched.groups[name]
      ? errors.groups && errors.groups[name]
      : undefined;

  return (
    <Container>
      <LogoNameWrapper>
        <Logo src={group.logo} />
        <Name>{readmeIfy(group.name)}</Name>
      </LogoNameWrapper>
      {responseLabel && (
        <ResponseLabel>{replaceLinebreak(responseLabel)}</ResponseLabel>
      )}
      <InputWrapper>
        <FieldLabel htmlFor={name}>Søknadstekst</FieldLabel>
        <InputArea
          className="textarea"
          name={name}
          id={name}
          onChange={onChange}
          onBlur={handleBlur}
          placeholder="Skriv søknadstekst her..."
          value={value}
          $error={!!error}
          rows={10}
          disabled={disabled}
        />
        <InputValidationFeedback error={error} />
      </InputWrapper>
    </Container>
  );
};

export default Application;

/** Styles **/

const Container = styled.div`
  display: grid;
  grid-template-areas:
    "logoname"
    "responselabel"
    "input";
  grid-gap: 0.7rem;
  align-items: center;
  margin: 2rem 0rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid var(--lego-gray-medium);

  &:last-of-type {
    border-bottom: 0;
    padding-bottom: 0;
  }

  ${media.portrait`
    margin: 1em 0;
    `};
`;

export const LogoNameWrapper = styled.div`
  grid-area: logoname;
  display: flex;
  align-items: center;
`;

export const Name = styled.h3`
  grid-area: name;
  margin: 0;
  font-size: 1.5rem;
  line-height: 2rem;
  letter-spacing: 0.7px;

  ${media.portrait`
    font-size: 1.3rem;
    padding: 0
    text-align: left;
    align-self: center;
    `};
`;

export const Logo = styled.img`
  grid-area: logo;
  justify-self: start;
  object-fit: scale-down;
  max-width: 45px;
  margin-right: 1rem;
`;

export const ResponseLabel = styled.div`
  grid-area: responselabel;
  background: linear-gradient(
    180deg,
    rgba(234, 233, 232, 0.76) 0%,
    rgba(218, 218, 218, 0.56) 100%
  );
  background-repeat: repeat;
  border: 1px solid rgba(53, 138, 204, 0.22);
  border-radius: 13px;
  padding: 1rem;
  font-size: 0.8rem;
  line-height: 1rem;
  color: rgba(57, 75, 89, 0.8);
`;

export const InputWrapper = styled.div`
  grid-area: input;
  font-family: var(--font-family);
  font-size: 1rem;
`;

const InputArea = styled(StyledTextAreaField)`
  min-height: 10rem;
`;
