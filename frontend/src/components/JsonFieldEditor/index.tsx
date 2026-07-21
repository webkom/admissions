import React, { useMemo } from "react";
import { Field, FieldProps, FormikValues } from "formik";
import styled from "styled-components";
import { HelpText } from "src/routes/ApplicationForm/FormStructureStyle";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import {
  FieldLabel,
  InputValidationFeedback,
  StyledField,
  StyledTextAreaField,
} from "src/components/styledFields";
import { Info } from "lucide-react";
import {
  FieldModel,
  InputFieldModel,
  PhoneInputModel,
  CheckboxInputModel,
  TextModel,
  getDefaultPlaceholder,
} from "src/utils/jsonFields";

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

const JsonInputField: React.FC<FormikValues> = ({
  field,
  form: { touched, errors },
  inputType = "text",
  multiline = false,
  disabled,
  title,
  label,
  placeholder,
  type,
}) => {
  const { name, value, onChange, onBlur } = field;
  const error = nestedError(touched, errors, name);
  const resolvedPlaceholder = getDefaultPlaceholder(type, placeholder);

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
          placeholder={resolvedPlaceholder}
          $error={Boolean(error)}
        />
      ) : (
        <StyledField
          id={name}
          name={name}
          type={inputType}
          disabled={disabled}
          placeholder={resolvedPlaceholder}
          error={error}
        />
      )}
      <InputValidationFeedback error={error} />
    </Wrapper>
  );
};

const JsonCheckboxField: React.FC<{
  field: CheckboxInputModel;
  title: string;
  label: string;
  disabled?: boolean;
  sectionName: string;
}> = ({ field, title, label, disabled, sectionName }) => {
  const name = sectionName + "." + field.id;

  return (
    <Field name={name}>
      {({ field: formikField, meta, form }: FieldProps<boolean>) => {
        const error = meta.touched ? meta.error : undefined;

        return (
          <CheckboxWrapper>
            <FieldLabel htmlFor={name}>{title}</FieldLabel>
            {label ? <HelpLabel>{label}</HelpLabel> : null}
            <CheckboxInput
              id={name}
              checked={Boolean(formikField.value)}
              disabled={disabled}
              type="checkbox"
              onBlur={formikField.onBlur}
              onChange={(event) =>
                form.setFieldValue(name, event.target.checked)
              }
              name={name}
            />
            <InputValidationFeedback error={error as string} />
          </CheckboxWrapper>
        );
      }}
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
      <Info aria-hidden="true" />
      {field.text}
    </HelpText>
  );

  const PhoneInputField = ({ field }: { field: PhoneInputModel }) => (
    <Field
      component={PhoneNumberField}
      name={sectionName + "." + field.id}
      title={field.title}
      label={field.label}
      placeholder={getDefaultPlaceholder(field.type, field.placeholder)}
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
      placeholder={getDefaultPlaceholder(field.type, field.placeholder)}
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
                title={field.title}
                label={field.label}
                disabled={disabled}
              />
            );
          default:
            return null;
        }
      }),
    [fields, sectionName, disabled],
  );

  return <>{renderedFields}</>;
};

export default JsonFieldEditor;

const Wrapper = styled.div`
  margin-top: var(--spacing-lg);
`;

const HelpLabel = styled.p`
  margin: 0 0 0.25rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
`;

const CheckboxWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;

const CheckboxInput = styled.input`
  align-self: flex-start;
  width: 1.25rem;
  min-height: 1.25rem;
  accent-color: var(--color-brand);
`;
