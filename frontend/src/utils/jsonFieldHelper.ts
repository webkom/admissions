import { JsonFieldEditableInput, JsonFieldInput } from "src/types";
import * as Yup from "yup";

export const validationFields = {
  phoneinput: Yup.string()
    .matches(
      /^(0047|\+47|47)?(?:\s*\d){8}$/,
      "Skriv inn et gyldig norsk telefonnummer"
    )
    .required("Skriv inn et gyldig norsk telefonnummer"),
  textarea: Yup.string().required("Må fylles ut"),
  textinput: Yup.string().required("Må fylles ut"),
};

export const filterEditableFields = (fields?: JsonFieldInput[]) => {
  const filteredFields = fields?.filter((field) => "label" in field);
  return filteredFields as JsonFieldEditableInput[];
};
