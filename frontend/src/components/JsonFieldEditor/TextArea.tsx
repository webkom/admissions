import { Field } from "formik";
import React from "react";
import { JsonFieldTextArea } from "src/types";
import { StyledField } from "../styledFields";
import TextAreaField from "../TextAreaField";

type TextAreaProps = {
  field: JsonFieldTextArea;
  index: number;
};

const TextArea: React.FC<TextAreaProps> = ({ field, index }) => {
  return (
    <>
      <p>Langtekst-svar</p>
      <StyledField
        name={"questions." + index + ".name"}
        placeholder={""}
        label={"Label"}
      />
      <Field
        name={"questions." + index + ".label"}
        component={TextAreaField}
        placeholder={""}
      />
    </>
  );
};

export default TextArea;
