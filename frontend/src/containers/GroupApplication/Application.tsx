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
import JsonFieldEditor from "src/components/JsonFieldEditor";
import { FieldModel } from "src/utils/jsonFields";

type FieldValue = string;

export interface ApplicationProps {
  responseLabel: string;
  group: Group;
  field: FieldInputProps<FieldValue>;
  form: FormikProps<FormValues>;
  disabled: boolean;
  questionFields?: FieldModel[];
}

const Application: React.FC<ApplicationProps> = ({
  responseLabel,
  group,
  field: { name, onChange, value },
  form: { touched, errors, handleBlur },
  disabled,
  questionFields,
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
        <ResponseLabel>{readmeIfy(responseLabel, true)}</ResponseLabel>
      )}
      {group.name === "Bankkom" && (
        <p>
          <b>NB!</b> I Bankkom kan du søke både <b>Investeringsansvarlig</b> og{" "}
          <b>vanlig Bankkom-medlem</b>. Tydeliggjør godt i søknaden din hvilken
          stilling du søker på, eller om du søker begge to.
        </p>
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
        <JsonFieldEditor
          sectionName={`groupAnswers.${group.name.toLowerCase()}`}
          fields={questionFields}
          disabled={disabled}
        />
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
  gap: var(--spacing-md);
  align-items: center;
  margin: var(--spacing-xl) 0;
  padding-bottom: var(--spacing-xl);
  border-bottom: var(--border-width-default) solid var(--color-border-muted);

  &:last-of-type {
    border-bottom: 0;
    padding-bottom: 0;
  }

  ${media.portrait`
    margin: var(--spacing-md) 0;
    `};
`;

const LogoNameWrapper = styled.div`
  grid-area: logoname;
  display: flex;
  align-items: center;
`;

const Name = styled.h3`
  grid-area: name;
  margin: 0;
  font-size: var(--font-size-heading-md);
  line-height: var(--line-height-heading-md);

  ${media.portrait`
    font-size: var(--font-size-heading-xs);
    padding: 0;
    text-align: left;
    align-self: center;
    `};
`;

const Logo = styled.img`
  grid-area: logo;
  justify-self: start;
  object-fit: scale-down;
  max-width: var(--application-logo-size);
  margin-right: var(--spacing-md);
`;

const ResponseLabel = styled.div`
  grid-area: responselabel;
  background: linear-gradient(
    180deg,
    var(--color-surface-subtle) 0%,
    var(--color-border-soft) 100%
  );
  background-repeat: repeat;
  border: var(--border-width-default) solid var(--color-blue-2);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-md);
  font-size: var(--font-size-detail);
  line-height: var(--line-height-tiny);
  color: var(--color-text-muted);
`;

const InputWrapper = styled.div`
  grid-area: input;
  font-size: var(--font-size-md);
`;

const InputArea = styled(StyledTextAreaField)`
  min-height: var(--group-editor-min-height);
`;
