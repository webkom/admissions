import { Field } from "formik";
import React from "react";
import { JsonFieldPhoneInput } from "src/types";
import { StyledField } from "../styledFields";

type PhoneInputProps = {
  field: JsonFieldPhoneInput;
  index: number;
};

const PhoneInput: React.FC<PhoneInputProps> = ({ field, index }) => {
  return (
    <>
      <p>Telefonnummer</p>
      <StyledField
        name={"questions." + index + ".name"}
        placeholder={""}
        label={"Label"}
      />
      <StyledField name={"questions." + index + ".label"} label={"Label"} />
    </>
  );
};

export default PhoneInput;
