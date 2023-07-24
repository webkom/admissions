import React from "react";
import { JsonFieldTextInput } from "src/types";
import { StyledField } from "../styledFields";

type TextInputProps = {
  field: JsonFieldTextInput;
  index: number;
};

const TextInput: React.FC<TextInputProps> = ({ field, index }) => {
  return (
    <>
      <p>Korttekst-svar</p>
      <StyledField
        name={"questions." + index + ".name"}
        placeholder={""}
        label={"Label"}
      />
      <StyledField
        name={"questions." + index + ".label"}
        placeholder={""}
        label={"Label"}
      />
    </>
  );
};

export default TextInput;
