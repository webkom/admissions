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

type BaseInputResponseModel = {
  input_id: string;
  value: string;
};

export type TextInputResponseModel = BaseInputResponseModel;

export type TextAreaResponseModel = BaseInputResponseModel;

export type NumberInputResponseModel = BaseInputResponseModel;

export type PhoneInputResponseModel = BaseInputResponseModel;

export type InputResponseModel =
  | TextInputResponseModel
  | TextAreaResponseModel
  | NumberInputResponseModel
  | PhoneInputResponseModel;
