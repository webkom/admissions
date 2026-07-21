export type TextModel = {
  type: "text";
  text: string;
};

type BaseInputModel = {
  id: string;
  title: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type TextInputModel = BaseInputModel & { type: "textinput" };

export type TextAreaModel = BaseInputModel & { type: "textarea" };

export type NumberInputModel = BaseInputModel & { type: "numberinput" };

export type PhoneInputModel = BaseInputModel & { type: "phoneinput" };

export type CheckboxInputModel = BaseInputModel & { type: "checkbox" };

export type InputFieldType =
  | TextInputModel["type"]
  | TextAreaModel["type"]
  | NumberInputModel["type"]
  | PhoneInputModel["type"]
  | CheckboxInputModel["type"];

export const DEFAULT_PLACEHOLDERS_BY_TYPE: Record<InputFieldType, string> = {
  textinput: "Skriv et kort svar",
  textarea: "Skriv et lengre svar",
  numberinput: "Skriv et tall",
  phoneinput: "Fyll inn mobilnummer...",
  checkbox: "Avkryss for ja/nei",
};

export const getDefaultPlaceholder = (
  fieldType: InputFieldType,
  placeholder = "",
) => {
  return placeholder.trim() !== ""
    ? placeholder
    : DEFAULT_PLACEHOLDERS_BY_TYPE[fieldType];
};

export type InputFieldModel =
  | TextInputModel
  | TextAreaModel
  | NumberInputModel
  | PhoneInputModel
  | CheckboxInputModel;

export type FieldModel = TextModel | InputFieldModel;

export type InputResponseValue = string | boolean;

export type InputResponseModel = { [input_id: string]: InputResponseValue };
