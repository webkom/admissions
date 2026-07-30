import type {
  AdmissionActions,
  AdmissionGroupContext,
  AdmissionResourceScopes,
  AdmissionUserData,
} from "src/types";

export type ScheduleWorkspaceMode = "admin" | "member";

export interface AdmissionAccessProjection {
  groupContexts: AdmissionGroupContext[];
  admissionActions: AdmissionActions;
  resourceScopes: AdmissionResourceScopes;
}

export interface ScheduleWorkspaceContext {
  mode: ScheduleWorkspaceMode | null;
  groupContext?: AdmissionGroupContext;
  valid: boolean;
  invalid: boolean;
  requiresCommitteeSelection?: boolean;
}

export interface LandingAccessActions {
  administerAllApplications: boolean;
  administerSchedule: boolean;
  authorityContexts: AdmissionGroupContext[];
  groupApplicationContexts: AdmissionGroupContext[];
  memberWorkspaceContexts: AdmissionGroupContext[];
}

export interface LandingAccessLink {
  key: string;
  label: string;
  to: string;
}

export interface LandingAccessLinks {
  applicationAdmin: LandingAccessLink[];
  scheduleAdmin: LandingAccessLink[];
  scheduleMember: LandingAccessLink[];
}

const defaultActions: AdmissionActions = {
  administer_all_applications: false,
  administer_schedule: false,
  authority_group_ids: [],
};

const defaultResourceScopes: AdmissionResourceScopes = {
  schedule: "admission",
  availability: "admission_user",
};

export const getAdmissionAccessProjection = (
  userdata: AdmissionUserData,
): AdmissionAccessProjection => ({
  groupContexts: userdata.group_contexts ?? [],
  admissionActions: userdata.admission_actions ?? defaultActions,
  resourceScopes: userdata.resource_scopes ?? defaultResourceScopes,
});

export const canOpenScheduleWorkspace = (userdata: AdmissionUserData) => {
  const projection = getAdmissionAccessProjection(userdata);
  if (userdata.group_contexts || userdata.admission_actions) {
    return (
      projection.admissionActions.administer_schedule ||
      projection.groupContexts.some(
        (context) => context.actions.open_member_workspace,
      )
    );
  }

  return userdata.is_admin || userdata.committee_role !== null;
};

export const canAdministerApplications = (userdata: AdmissionUserData) => {
  const projection = getAdmissionAccessProjection(userdata);
  if (userdata.group_contexts || userdata.admission_actions) {
    return (
      projection.admissionActions.administer_all_applications ||
      projection.groupContexts.some(
        (context) => context.actions.administer_group_applications,
      )
    );
  }

  return userdata.is_admin || userdata.is_recruiter;
};

export const getLandingAccessActions = (
  userdata: AdmissionUserData,
): LandingAccessActions => {
  const projection = getAdmissionAccessProjection(userdata);
  const authorityGroupIds = new Set(
    projection.admissionActions.authority_group_ids,
  );
  const authorityContexts = projection.groupContexts.filter(
    (context) =>
      context.sources.admission_group &&
      authorityGroupIds.has(context.group.id),
  );
  const administerAllApplications =
    projection.admissionActions.administer_all_applications;
  return {
    administerAllApplications,
    administerSchedule: projection.admissionActions.administer_schedule,
    authorityContexts,
    groupApplicationContexts: projection.groupContexts.filter(
      (context) => context.actions.administer_group_applications,
    ),
    memberWorkspaceContexts: projection.groupContexts.filter(
      (context) => context.actions.open_member_workspace,
    ),
  };
};

export const getLandingAccessLinks = (
  admissionSlug: string,
  userdata: AdmissionUserData,
): LandingAccessLinks => {
  const actions = getLandingAccessActions(userdata);
  const applicationContexts = [
    ...actions.authorityContexts,
    ...actions.groupApplicationContexts,
  ].filter(
    (context, index, contexts) =>
      contexts.findIndex(
        (candidate) => candidate.group.id === context.group.id,
      ) === index,
  );
  const applicationAdmin =
    applicationContexts.length > 0
      ? applicationContexts.map((context) => ({
          key: `applications-${context.group.id}`,
          label: `Administrer søknader · ${context.group.name}`,
          to: `/${admissionSlug}/admin/?group=${encodeURIComponent(
            context.group.id,
          )}`,
        }))
      : actions.administerAllApplications
        ? [
            {
              key: "applications-all",
              label: "Administrer søknader",
              to: `/${admissionSlug}/admin/`,
            },
          ]
        : [];
  const scheduleAdmin =
    actions.authorityContexts.length > 0
      ? actions.authorityContexts.map((context) => ({
          key: `schedule-admin-${context.group.id}`,
          label: `Planlegg intervjuer · ${context.group.name}`,
          to: `/${admissionSlug}/schedule?mode=admin&group=${encodeURIComponent(
            context.group.id,
          )}`,
        }))
      : actions.administerSchedule
        ? [
            {
              key: "schedule-admin",
              label: "Planlegg intervjuer",
              to: `/${admissionSlug}/schedule?mode=admin`,
            },
          ]
        : [];
  const scheduleMember = actions.memberWorkspaceContexts.map((context) => ({
    key: `schedule-member-${context.group.id}`,
    label: `Registrer tilgjengelighet · ${context.group.name}`,
    to: `/${admissionSlug}/schedule?mode=member&group=${encodeURIComponent(
      context.group.id,
    )}`,
  }));

  return { applicationAdmin, scheduleAdmin, scheduleMember };
};

export const resolveScheduleWorkspaceContext = ({
  userdata,
  mode,
  groupId,
}: {
  userdata: AdmissionUserData;
  mode: string | null;
  groupId: string | null;
}): ScheduleWorkspaceContext => {
  const projection = getAdmissionAccessProjection(userdata);
  const hasProjection =
    userdata.group_contexts !== undefined ||
    userdata.admission_actions !== undefined;
  const memberContexts = projection.groupContexts.filter(
    (context) => context.actions.open_member_workspace,
  );
  const authorityGroupIds = new Set(
    projection.admissionActions.authority_group_ids,
  );

  if (!mode && !groupId) {
    if (
      projection.admissionActions.administer_schedule ||
      (!hasProjection && userdata.is_admin)
    ) {
      return { mode: "admin", valid: true, invalid: false };
    }
    if (memberContexts.length === 1) {
      return {
        mode: "member",
        groupContext: memberContexts[0],
        valid: true,
        invalid: false,
      };
    }
    if (!hasProjection && userdata.committee_role !== null) {
      return { mode: "member", valid: true, invalid: false };
    }
    return {
      mode: null,
      valid: false,
      invalid: false,
      requiresCommitteeSelection: memberContexts.length > 1,
    };
  }

  if (mode === "admin") {
    const groupContext = groupId
      ? projection.groupContexts.find(
          (context) =>
            context.group.id === groupId &&
            context.sources.admission_group &&
            authorityGroupIds.has(groupId),
        )
      : undefined;
    const validAuthorityGroup = !groupId || Boolean(groupContext);
    const canAdminister =
      projection.admissionActions.administer_schedule ||
      (!hasProjection && userdata.is_admin);
    return {
      mode: canAdminister && validAuthorityGroup ? "admin" : null,
      groupContext,
      valid: canAdminister && validAuthorityGroup,
      invalid: !(canAdminister && validAuthorityGroup),
    };
  }

  if (mode === "member") {
    const groupContext = memberContexts.find(
      (context) => context.group.id === groupId,
    );
    return {
      mode: groupContext ? "member" : null,
      groupContext,
      valid: Boolean(groupContext),
      invalid: !groupContext,
    };
  }

  return { mode: null, valid: false, invalid: true };
};

export const resolveScheduleWorkspaceScopeId = (
  context: ScheduleWorkspaceContext,
  userdata: AdmissionUserData,
) =>
  context.groupContext?.group.id ??
  (context.mode === "admin"
    ? "admission"
    : (userdata.represented_groups[0] ??
      userdata.committee_groups[0] ??
      "admission"));
