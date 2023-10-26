import React, { useState } from "react";
import { Group, JsonFieldInput } from "src/types";
import styled from "styled-components";
import PhoneInput from "./PhoneInput";
import Text from "./Text";
import TextArea from "./TextArea";
import TextInput from "./TextInput";

type JsonFieldEditorProps = {
  group: Group;
  initialFields: JsonFieldInput[];
};

const JsonFieldEditor: React.FC<JsonFieldEditorProps> = ({
  group,
  initialFields,
}) => {
  const [fields, setFields] = useState<JsonFieldInput[]>(initialFields);

  return (
    <EditorWrapper>
      <h3>Rediger spørsmål for {group.name}</h3>
      <FieldWrapper>
        {fields.map((field, index) => {
          if (field.type === "text")
            return <Text key={index} field={field} index={index} />;
          if (field.type === "textarea")
            return <TextArea key={field.id} field={field} index={index} />;
          if (field.type === "phoneinput")
            return <PhoneInput key={field.id} field={field} index={index} />;
          if (field.type === "textinput")
            return <TextInput key={field.id} field={field} index={index} />;
          return null;
        })}
      </FieldWrapper>
    </EditorWrapper>
  );
};

export default JsonFieldEditor;

const EditorWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  width: 100%;
  margin-bottom: 1em;

  h3 {
    margin: 0;
  }
`;

const FieldWrapper = styled.div`
  p {
    margin: 0;
  }
  input {
    display: block;
  }
`;
