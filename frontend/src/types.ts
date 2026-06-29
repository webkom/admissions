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
  // Same-gender panel matching; opt-in, ignored for anyone with no gender data.
  enforce_same_gender: boolean;
  allow_overtime: boolean;
  prioritize_continuity: boolean;
  same_panel_per_block: boolean;
  overtime_weight: number;
  load_balance_weight: number;
  continuity_weight: number;
  max_solver_seconds: number;
}

export interface SchedulePanelMember {
  id?: string;
  name: string;
  is_overtime: boolean;
}

export interface ScheduleItem {
  candidate_id?: string;
  candidate: string;
  time: number;
  panel: SchedulePanelMember[];
  locked?: boolean;
}

export interface EnabledWindow {
  date: string;
  start_minute: number;
  end_minute: number;
}

export type NameVisibility = "hidden" | "admin_only" | "committee";

export interface SavedSchedule {
  id: number;
  schedule: ScheduleItem[];
  start_date: string;
  end_date: string | null;
  session_duration: number;
  enabled_windows: EnabledWindow[];
  enabled_slots: string[];
  day_start_minute: number;
  day_end_minute: number;
  chunk_size: number;
  chunk_break_minutes: number;
  panel_size?: number | null;
  solver_options?: {
    enforce_same_gender?: boolean;
    allow_overtime?: boolean;
    prioritize_continuity?: boolean;
    same_panel_per_block?: boolean;
    overtime_weight?: number;
    load_balance_weight?: number;
    continuity_weight?: number;
    max_solver_seconds?: number;
  } | null;
  is_distributed: boolean;
  name_visibility: NameVisibility;
  updated_at: string;
}

export interface InterviewAvailabilityParticipant {
  user_id: string;
  username: string;
  full_name: string;
  // Solver panel-matching code: "M" / "F" / "" (mirrored from LEGO, only
  // populated for privileged viewers).
  gender: string;
  slots: string[];
  conflicts: string[];
  has_submitted: boolean;
  is_me: boolean;
}
