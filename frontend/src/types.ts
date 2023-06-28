type JsonFieldEditableBase = {
  id: string;
  name: string;
  label: string;
};

export type JsonFieldTextArea = JsonFieldEditableBase & {
  type: "textarea";
  placeholder?: string;
};

export type JsonFieldTextInput = JsonFieldEditableBase & { type: "textinput" };

export type JsonFieldPhoneInput = JsonFieldEditableBase & {
  type: "phoneinput";
};

export type JsonFieldEditableInput =
  | JsonFieldTextArea
  | JsonFieldTextInput
  | JsonFieldPhoneInput;

export type JsonFieldText = {
  type: "text";
  text: string;
};

export type JsonFieldInput = JsonFieldText | JsonFieldEditableInput;

export type JsonFieldValue = {
  type: "text" | "textarea" | "textinput" | "phoneinput";
  value: string;
};

export interface Group {
  pk: number;
  name: string;
  description: string;
  logo: string;
  questions: JsonFieldInput[];
  detail_link: string;
}

export interface User {
  username: string;
  full_name: string;
  profile_picture: string;
  phone_number: string;
  email: string;
}

export interface GroupApplication {
  group: Group;
  responses: Record<string, string>;
}

export interface Application {
  pk: number;
  user: User;
  applied_within_deadline: boolean;
  created_at: string;
  updated_at: string;
  responses: Record<string, string>;
  group_applications: GroupApplication[];
}

interface AdmissionUserData {
  has_application: boolean;
  is_privileged: boolean;
  is_admin: boolean;
}

export interface Admission {
  pk: number;
  slug: string;
  title: string;
  description: string;
  is_open: boolean;
  is_appliable: boolean;
  is_closed: boolean;
  open_from: string;
  public_deadline: string;
  closed_from: string;
  admin_groups?: Group[];
  groups: Group[];
  userdata: AdmissionUserData;
  questions: JsonFieldInput[];
}
