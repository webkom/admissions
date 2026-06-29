import React, { useMemo } from "react";
import { Field, FormikValues } from "formik";
import styled from "styled-components";
import { HelpText } from "src/routes/ApplicationForm/FormStructureStyle";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField,
  StyledTextAreaField,
} from "src/components/styledFields";
import Icon from "../Icon";
import {
  FieldModel,
  InputFieldModel,
  PhoneInputModel,
  TextModel,
} from "src/utils/jsonFields";

// Pull the (possibly nested, e.g. "headerFields.q1") error out of Formik state.
const nestedError = (
  touched: FormikValues["touched"],
  errors: FormikValues["errors"],
  name: string,
) => {
  const parts = name.split(".");
  if (parts.length > 1) {
    return touched?.[parts[0]]?.[parts[1]] && errors?.[parts[0]]?.[parts[1]];
  }
  return touched?.[name] && errors?.[name];
};

// Shared renderer for the text / textarea / number header-field inputs.
const JsonInputField: React.FC<FormikValues> = ({
  field,
  form: { touched, errors },
  inputType = "text",
  multiline = false,
  disabled,
  title,
  label,
  placeholder,
}) => {
  const { name, value, onChange, onBlur } = field;
  const error = nestedError(touched, errors, name);

  return (
    <Wrapper>
      <FieldLabel htmlFor={name}>{title}</FieldLabel>
      {label ? <HelpLabel>{label}</HelpLabel> : null}
      {multiline ? (
        <StyledTextAreaField
          id={name}
          name={name}
          value={value ?? ""}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={placeholder}
          $error={Boolean(error)}
        />
      ) : (
        <StyledField
          id={name}
          name={name}
          type={inputType}
          disabled={disabled}
          placeholder={placeholder}
          error={error}
        />
      )}
      <InputValidationFeedback error={error} />
    </Wrapper>
  );
};

type Props = {
  sectionName: string;
  fields?: FieldModel[];
  disabled?: boolean;
};

const JsonFieldEditor: React.FC<Props> = ({
  sectionName,
  fields,
  disabled = false,
}) => {
  const TextField = ({ field }: { field: TextModel }) => (
    <HelpText>
      <Icon name="information-circle-outline" />
      {field.text}
    </HelpText>
  );

  const PhoneInputField = ({ field }: { field: PhoneInputModel }) => (
    <Field
      component={PhoneNumberField}
      name={sectionName + "." + field.id}
      title={field.title}
      label={field.label}
      placeholder={field.placeholder}
      disabled={disabled}
    />
  );

  const InputField = ({
    field,
    inputType,
    multiline = false,
  }: {
    field: InputFieldModel;
    inputType: "text" | "number";
    multiline?: boolean;
  }) => (
    <Field
      component={JsonInputField}
      name={sectionName + "." + field.id}
      title={field.title}
      label={field.label}
      placeholder={field.placeholder}
      inputType={inputType}
      multiline={multiline}
      disabled={disabled}
    />
  );

  const renderedFields = useMemo(
    () =>
      fields?.map((field) => {
        switch (field.type) {
          case "text":
            return <TextField key={field.text} field={field} />;
          case "phoneinput":
            return <PhoneInputField key={field.id} field={field} />;
          case "textinput":
            return <InputField key={field.id} field={field} inputType="text" />;
          case "textarea":
            return (
              <InputField
                key={field.id}
                field={field}
                inputType="text"
                multiline
              />
            );
          case "numberinput":
            return (
              <InputField key={field.id} field={field} inputType="number" />
            );
          default:
            return null;
        }
      }),
    [fields],
  );

  return <>{renderedFields}</>;
};

export default JsonFieldEditor;

/** Styles **/

const Wrapper = styled.div`
  margin-top: 1.5rem;
`;

const HelpLabel = styled.p`
  margin: 0 0 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.85rem;
`;
