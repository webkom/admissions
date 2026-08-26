import { FieldModel, InputResponseModel } from "src/utils/jsonFields";

export type GroupCategory = "committee" | "revue" | "other";

export interface Group {
  pk: string;
  name: string;
  /** Which split this group is offered under. Server-assigned; see constants.py. */
  category?: GroupCategory;
  description: string;
  logo: string | null;
  response_label: string;
  detail_link: string;
  header_fields?: FieldModel[];
  committee_info?: string | null;
  application_guidance?: string | null;
  interview_description?: string | null;
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
  header_fields_response: InputResponseModel;
}

export interface Application {
  pk: string;
  user: User;
  created_at: string;
  updated_at: string;
  applied_within_deadline: boolean;
  phone_number: string;
  priority_text?: string;
  group_applications: GroupApplication[];
}

export type InterviewStatus =
  | "not_invited"
  | "invited"
  | "confirmed"
  | "declined"
  | "completed"
  | "cancelled";

export type ApplicationViewMode =
  | "none"
  | "admin_full"
  | "committee_full"
  | "committee_minimal";

export interface FullAdminApplication extends Application {
  application_view_mode: "admin_full" | "committee_full";
  interview_status: InterviewStatus;
  interview_status_updated_at: string;
  interview_status_updated_by: string;
}

export interface CommitteeMinimalAdminApplication {
  pk: string;
  application_view_mode: "committee_minimal";
  user: Pick<User, "full_name">;
  created_at: string;
  applied_within_deadline: boolean;
  phone_number: string;
  group_applications: CommitteeGroupApplication[];
  interview_status: InterviewStatus;
  interview_status_updated_at: string;
}

export interface CommitteeGroupApplication {
  group: Pick<Group, "pk" | "name" | "logo" | "response_label">;
  text: string;
  header_fields_response: InputResponseModel;
}

export type AdminApplication =
  | FullAdminApplication
  | CommitteeMinimalAdminApplication;

interface AdmissionUserData {
  actor_id: string | null;
  has_application: boolean;
  is_privileged: boolean;
  is_admin: boolean;
  is_org_leadership: boolean;
  is_recruiter: boolean;
  committee_role: "leader" | "recruiting" | "member" | null;
  committee_groups: string[];
  committee_group_details: (Pick<Group, "pk" | "name"> & {
    role: "leader" | "recruiting" | "member";
  })[];
  represented_groups: string[];
  application_view_mode: ApplicationViewMode;
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
  userdata: AdmissionUserData;
}

export type AdmissionList = Omit<Admission, "groups"> & {
  groups: string[];
};

export interface Candidate {
  id: string;
  name: string;
  gender?: string;
  user_id?: string;
}

export type ExperienceLevel = "unknown" | "inexperienced" | "experienced";

export interface Interviewer {
  id: string;
  name: string;
  gender?: string;
  experience_level?: ExperienceLevel;
  availability: number[];
  /** Subset of `availability` the interviewer would rather not be used. */
  discouraged?: number[];
  biased: string[];
  has_submitted: boolean;
  participation?: InterviewerParticipation;
  affected_assignment_count?: number;
}

export type InitialPlanningStrategy =
  | "balanced"
  | "minimize_overtime"
  | "compact_days"
  | "balance_workload";

export type InterviewerParticipation =
  | "awaiting_response"
  | "participating"
  | "not_participating";

export type RepairStrategy = "minimum_change" | "preserve_panels" | "balanced";
export type PanelStability = "required" | "preferred" | "flexible";
export type AvailabilityFallback = "stop" | "propose" | "automatic";

interface ScheduleDeviation {
  kind: "availability";
  candidate_id: string;
  interviewer_id: string;
  time: number;
}

export interface ScheduleDeviationReview {
  policy: {
    policy_version: number | null;
    panel_stability: PanelStability;
    availability_fallback: AvailabilityFallback;
  } | null;
  schedule_fingerprint?: string;
  deviation_fingerprint: string;
  deviations: ScheduleDeviation[];
  deviation_count: number;
  requires_approval: boolean;
  approved: boolean;
  error?: string;
}

export interface SolverOptions {
  policy_version: 2;
  panel_stability: PanelStability;
  availability_fallback: AvailabilityFallback;
  enforce_same_gender: boolean;
  require_experienced_panel: boolean;
  /**
   * Candidates per session: 1 is a normal interview; 2+ means one shared
   * panel meets that many candidates together in the same slot.
   */
  candidates_per_session: number;
  allow_overtime: boolean;
  prioritize_continuity: boolean;
  same_panel_per_block: boolean;
  avoid_consecutive_interviewer_blocks: boolean;
  initial_strategy: InitialPlanningStrategy;
  repair_strategy: RepairStrategy;
  repair_mode: boolean;
  overtime_weight: number;
  load_balance_weight: number;
  continuity_weight: number;
  max_solver_seconds: number;
}

export interface SchedulePanelMember {
  id?: string;
  name: string;
  is_overtime: boolean;
  experience_level?: ExperienceLevel;
}

export interface ScheduleItem {
  candidate_id?: string;
  candidate: string;
  time: number;
  panel: SchedulePanelMember[];
  locked?: boolean;
  booking_source?: "solver" | "manual";
  interview_status?: InterviewStatus;
  interview_status_updated_at?: string;
  interview_status_updated_by?: string;
  candidate_phone?: string;
}

export interface EnabledWindow {
  date: string;
  start_minute: number;
  end_minute: number;
}

export type NameVisibility = "hidden" | "admin_only" | "committee";
export type ScheduleBlockMode = "standard" | "manual";

export interface ManualScheduleBlock {
  slots: string[];
}

export interface SlotOverride {
  slot: string;
  open: boolean;
}

export interface ScheduleLayoutCapabilities {
  version: number;
  slot_overrides: boolean;
  availability_projection: boolean;
  opened_pause_semantics: "separate_block";
}

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
  block_mode: ScheduleBlockMode;
  resolved_blocks: ManualScheduleBlock[];
  manual_blocks: ManualScheduleBlock[];
  layout_version: number;
  slot_overrides: SlotOverride[];
  availability_generation: number;
  layout_capabilities: ScheduleLayoutCapabilities;
  panel_size?: number | null;
  solver_options?: {
    policy_version?: number;
    panel_stability?: PanelStability;
    availability_fallback?: AvailabilityFallback;
    enforce_same_gender?: boolean;
    require_experienced_panel?: boolean;
    allow_overtime?: boolean;
    prioritize_continuity?: boolean;
    same_panel_per_block?: boolean;
    avoid_consecutive_interviewer_blocks?: boolean;
    initial_strategy?: InitialPlanningStrategy;
    repair_strategy?: RepairStrategy;
    repair_mode?: boolean;
    overtime_weight?: number;
    load_balance_weight?: number;
    continuity_weight?: number;
    max_solver_seconds?: number;
  } | null;
  deviation_review?: ScheduleDeviationReview | null;
  is_distributed: boolean;
  distributed_through: string | null;
  conflict_review_open: boolean;
  name_visibility: NameVisibility;
  updated_at: string;
}

export interface InterviewAvailabilityParticipant {
  user_id: string;
  username: string;
  full_name: string;
  gender?: string;
  /** Admin-only; empty string for everyone else. */
  email?: string;
  availability_updated_at?: string | null;
  experience_level: ExperienceLevel;
  slots: string[];
  /** "Helst ikke" - schedulable, but only at a cost. Disjoint from `slots`. */
  discouraged_slots: string[];
  conflicts: string[];
  /** Admin-only; empty for everyone else, including the declaring interviewer. */
  derived_conflicts: string[];
  reviewed_candidate_ids: string[];
  proposed_candidate_ids: string[];
  conflict_review_complete: boolean;
  has_submitted: boolean;
  participation: InterviewerParticipation;
  needs_review: boolean;
  affected_assignment_count: number;
  availability_generation: number;
  is_me: boolean;
  /**
   * False only on the full roster an admin or recruiter is served: someone
   * LEGO lists in the committee who has never signed in to admissions, so
   * there is nobody to remind about their times - only about signing in.
   */
  has_signed_in?: boolean;
  /** Your own declarations only; always empty on other people's rows. */
  fadderbarn?: {
    lego_user_id: number;
    username?: string;
    full_name?: string;
  }[];
}
