import React from "react";
import { Field } from "formik";
import { Group, JsonFieldInput } from "src/types";
import PhoneNumberField from "./PhoneNumberField";
import { HelpText } from "./FormStructureStyle";
import Icon from "src/components/Icon";
import PriorityTextField from "./PriorityTextField";
import TextAreaField from "src/components/TextAreaField";

type JsonFieldParserProps = {
  group?: Group;
  jsonField: JsonFieldInput;
  disabled?: boolean;
};

const JsonFieldParser: React.FC<JsonFieldParserProps> = ({
  group,
  jsonField,
  disabled,
}) => {
  if (jsonField.type === "text") {
    return (
      <HelpText $indented={!group}>
        {!group && <Icon name="information-circle-outline" />}
        {jsonField.text}
      </HelpText>
    );
  }

  const id =
    (group ? "groupResponses." + group.name + "." : "responses.") +
    jsonField.id;

  if (jsonField.type === "textarea")
    return (
      <>
        <Field
          name={id}
          component={TextAreaField}
          placeholder={jsonField.placeholder}
          label={jsonField.label}
          disabled={!!disabled}
        />
      </>
    );
  if (jsonField.type === "phoneinput")
    return (
      <Field name={id} component={PhoneNumberField} disabled={!!disabled} />
    );
  if (jsonField.type === "textinput")
    return (
      <Field
        name={id}
        component={TextAreaField}
        label="Prioriteringer, og andre kommentarer"
        optional
        disabled={!!disabled}
      />
    );
  return null;
};

export default JsonFieldParser;
