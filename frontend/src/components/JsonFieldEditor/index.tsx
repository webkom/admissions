import React, { useMemo } from "react";
import { Field, FieldProps, FormikValues, getIn } from "formik";
import styled from "styled-components";
import { HelpText } from "src/routes/ApplicationForm/FormStructureStyle";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import Icon from "../Icon";
import {
  CheckboxInputModel,
  FieldModel,
  InputFieldModel,
  PhoneInputModel,
  TextModel,
} from "src/utils/jsonFields";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField,
  StyledTextAreaField,
} from "src/components/styledFields";

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
  const error = getIn(touched, name) ? getIn(errors, name) : undefined;

  return (
    <InputWrapper>
      <FieldLabel htmlFor={name}>{title}</FieldLabel>
      {label ? <InputHelp>{label}</InputHelp> : null}
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
    </InputWrapper>
  );
};

const JsonCheckboxField: React.FC<{
  field: CheckboxInputModel;
  disabled?: boolean;
  sectionName: string;
}> = ({ field, disabled, sectionName }) => {
  const name = `${sectionName}.${field.id}`;

  return (
    <Field name={name}>
      {({ field: formikField, meta, form }: FieldProps<boolean>) => (
        <CheckboxWrapper>
          <FieldLabel htmlFor={name}>{field.title}</FieldLabel>
          {field.label ? <InputHelp>{field.label}</InputHelp> : null}
          <CheckboxInput
            id={name}
            checked={Boolean(formikField.value)}
            disabled={disabled}
            type="checkbox"
            onBlur={formikField.onBlur}
            onChange={(event) => form.setFieldValue(name, event.target.checked)}
            name={name}
          />
          <InputValidationFeedback
            error={meta.touched ? meta.error : undefined}
          />
        </CheckboxWrapper>
      )}
    </Field>
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
      name={`${sectionName}.${field.id}`}
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
          case "checkbox":
            return (
              <JsonCheckboxField
                key={field.id}
                sectionName={sectionName}
                field={field}
                disabled={disabled}
              />
            );
          default:
            return null;
        }
      }),
    [disabled, fields, sectionName],
  );

  return <>{renderedFields}</>;
};

export default JsonFieldEditor;

const InputWrapper = styled.div`
  margin-top: 1rem;
`;

const InputHelp = styled.p`
  margin: 0 0 0.25rem;
  color: var(--color-gray-5);
  font-size: 0.85rem;
`;

const CheckboxWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
`;

const CheckboxInput = styled.input`
  width: 1.25rem;
  min-height: 1.25rem;
  accent-color: var(--lego-red-color);
`;
