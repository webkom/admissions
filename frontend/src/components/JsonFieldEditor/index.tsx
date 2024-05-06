import React, { useMemo } from "react";
import { Field } from "formik";
import { HelpText } from "src/routes/ApplicationForm/FormStructureStyle";
import PhoneNumberField from "src/routes/ApplicationForm/PhoneNumberField";
import Icon from "../Icon";
import { FieldModel, PhoneInputModel, TextModel } from "src/utils/jsonFields";

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

  const renderedFields = useMemo(
    () =>
      fields?.map((field) =>
        field.type === "text" ? (
          <TextField key={field.text} field={field} />
        ) : field.type === "phoneinput" ? (
          <PhoneInputField key={field.id} field={field} />
        ) : null,
      ),
    [fields],
  );

  return <>{renderedFields}</>;
};

export default JsonFieldEditor;
