import type {
  Admission,
  AdminApplication,
  ApplicationViewMode,
  CommitteeMinimalAdminApplication,
  FullAdminApplication,
} from "src/types";

export const isCommitteeMinimalView = (
  mode: ApplicationViewMode | undefined,
): mode is "committee_minimal" => mode === "committee_minimal";

export const isFullAdminApplication = (
  application: AdminApplication,
): application is FullAdminApplication =>
  application.application_view_mode === "admin_full" ||
  application.application_view_mode === "committee_full";

export type ApplicationWithDetails =
  | FullAdminApplication
  | CommitteeMinimalAdminApplication;

export const hasApplicationDetails = (
  application: AdminApplication,
): application is ApplicationWithDetails =>
  isFullAdminApplication(application) ||
  application.application_view_mode === "committee_minimal";

export const getApplicationDeadlineStatus = (
  appliedWithinDeadline: boolean | undefined,
): "innen fristen" | "etter fristen" =>
  appliedWithinDeadline ? "innen fristen" : "etter fristen";

export const getApplicationScopeKey = (
  admission: Admission | undefined,
): string => {
  if (!admission) return "";
  return [
    admission.userdata.application_view_mode,
    ...[...admission.userdata.represented_groups].sort((a, b) =>
      a.localeCompare(b, "nb"),
    ),
  ].join(":");
};
