import { FieldModel, InputResponseModel } from "src/utils/jsonFields";

export interface Group {
  pk: string;
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
  pk: string;
  user: User;
  created_at: string;
  updated_at: string;
  applied_within_deadline: boolean;
  text?: string;
  phone_number: string;
  header_fields_response: InputResponseModel;
  group_applications: GroupApplication[];
}

interface AdmissionUserData {
  has_application: boolean;
  is_privileged: boolean;
  is_admin: boolean;
  is_recruiter: boolean;
  committee_role: "leader" | "recruiting" | "member" | null;
  committee_groups: Group[];
}

export interface Admission {
  pk: string;
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

export interface Candidate {
  id: string;
  name: string;
  gender: string;
}

export interface Interviewer {
  id: string;
  name: string;
  gender: string;
  availability: number[];
  biased: string[];
}

export interface SolverOptions {
  enforce_same_gender: boolean;
  allow_overtime: boolean;
  overtime_weight: number;
  load_balance_weight: number;
  max_solver_seconds: number;
}

export interface SchedulePanelMember {
  name: string;
  is_overtime: boolean;
}

export interface ScheduleItem {
  candidate: string;
  time: number;
  panel: SchedulePanelMember[];
}

export interface SavedSchedule {
  id: number;
  schedule: ScheduleItem[];
  start_date: string;
  end_date: string | null;
  session_duration: number;
  enabled_slots: string[];
  day_start_minute: number;
  day_end_minute: number;
  chunk_size: number;
  chunk_break_minutes: number;
  is_distributed: boolean;
  show_candidate_names: boolean;
  updated_at: string;
}

export interface InterviewAvailabilityParticipant {
  user_id: string;
  username: string;
  full_name: string;
  slots: string[];
  conflicts: string[];
  has_submitted: boolean;
  is_me: boolean;
}
