import { Field } from "formik";
import React from "react";
import { JsonFieldText } from "src/types";
import TextAreaField from "src/components/TextAreaField";

type TextProps = {
  field: JsonFieldText;
  index: number;
};

const Text: React.FC<TextProps> = ({ field, index }) => {
  return (
    <>
      <p>Informasjonstekst</p>
      <Field
        name={"questions." + index + ".text"}
        component={TextAreaField}
        placeholder={""}
      />
    </>
  );
};

export default Text;
