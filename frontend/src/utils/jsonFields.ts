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

export type InputFieldModel =
  | TextInputModel
  | TextAreaModel
  | NumberInputModel
  | PhoneInputModel;

export type FieldModel = TextModel | InputFieldModel;

export type InputResponseModel = { [input_id: string]: string };
