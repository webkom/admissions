import { FieldModel } from "src/utils/jsonFields";

export interface Group {
  pk: number;
  name: string;
  description: string;
  logo: string;
  response_label: string;
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
  text: string;
}

export interface Application {
  pk: number;
  user: User;
  applied_within_deadline: boolean;
  created_at: string;
  updated_at: string;
  text?: string;
  phone_number: string;
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
  header_fields: FieldModel[];
  userdata: AdmissionUserData;
}
