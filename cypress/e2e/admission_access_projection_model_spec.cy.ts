import {
  getLandingAccessActions,
  getLandingAccessLinks,
  resolveScheduleWorkspaceContext,
  resolveScheduleWorkspaceScopeId,
} from "../../frontend/src/utils/admissionAccess";
import { formatApiError } from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import { buildWorkflowSteps } from "../../frontend/src/routes/SchedulePage/workflowSteps";
import {
  derivePublicationReadiness,
  requiresConflictCollectionTask,
} from "../../frontend/src/routes/SchedulePage/workflowState";
import type { AdmissionUserData } from "../../frontend/src/types";

const groupContext = (
  id: string,
  name: string,
  overrides: Partial<
    NonNullable<AdmissionUserData["group_contexts"]>[number]
  > = {},
) => ({
  group: { id, name },
  membership_role: "member" as const,
  membership_roles: ["member" as const],
  sources: { admission_group: true, admin_group: false },
  actions: {
    open_member_workspace: true,
    administer_group_applications: false,
  },
  ...overrides,
});

const userdata: AdmissionUserData = {
  actor_id: "actor-1",
  has_application: false,
  is_privileged: true,
  is_admin: true,
  is_recruiter: true,
  committee_role: "leader",
  committee_groups: ["C1", "C2"],
  represented_groups: ["C2"],
  group_contexts: [
    groupContext("c1", "C1"),
    groupContext("c2", "C2", {
      membership_role: "recruiting",
      membership_roles: ["recruiting"],
      sources: { admission_group: true, admin_group: true },
      actions: {
        open_member_workspace: true,
        administer_group_applications: true,
      },
    }),
  ],
  admission_actions: {
    administer_all_applications: true,
    administer_schedule: true,
    authority_group_ids: ["c2"],
  },
  resource_scopes: {
    schedule: "admission",
    availability: "admission_user",
  },
};

describe("admission access projection", () => {
  it("keeps C1 member and C2 admin/recruiter actions separate", () => {
    const actions = getLandingAccessActions(userdata);
    const links = getLandingAccessLinks("host-2026", userdata);

    expect(actions.administerAllApplications).to.equal(true);
    expect(actions.administerSchedule).to.equal(true);
    expect(
      actions.authorityContexts.map((context) => context.group.id),
    ).to.deep.equal(["c2"]);
    expect(
      actions.groupApplicationContexts.map((context) => context.group.id),
    ).to.deep.equal(["c2"]);
    expect(
      actions.memberWorkspaceContexts.map((context) => context.group.id),
    ).to.deep.equal(["c1", "c2"]);
    expect(links).to.deep.equal({
      applicationAdmin: [
        {
          key: "applications-c2",
          label: "Administrer søknader · C2",
          to: "/host-2026/admin/?group=c2",
        },
      ],
      scheduleAdmin: [
        {
          key: "schedule-admin-c2",
          label: "Planlegg intervjuer · C2",
          to: "/host-2026/schedule?mode=admin&group=c2",
        },
      ],
      scheduleMember: [
        {
          key: "schedule-member-c1",
          label: "Registrer tilgjengelighet · C1",
          to: "/host-2026/schedule?mode=member&group=c1",
        },
        {
          key: "schedule-member-c2",
          label: "Registrer tilgjengelighet · C2",
          to: "/host-2026/schedule?mode=member&group=c2",
        },
      ],
    });
  });

  it("creates one explicit admin route per authority committee", () => {
    const multiAuthorityUser = {
      ...userdata,
      group_contexts: [
        userdata.group_contexts?.[0],
        userdata.group_contexts?.[1],
      ].filter(
        (
          context,
        ): context is NonNullable<
          AdmissionUserData["group_contexts"]
        >[number] => Boolean(context),
      ),
      admission_actions: {
        ...userdata.admission_actions,
        authority_group_ids: ["c1", "c2"],
      },
    };

    const links = getLandingAccessLinks("host-2026", multiAuthorityUser);

    expect(
      links.applicationAdmin.map(({ label, to }) => ({ label, to })),
    ).to.deep.equal([
      {
        label: "Administrer søknader · C1",
        to: "/host-2026/admin/?group=c1",
      },
      {
        label: "Administrer søknader · C2",
        to: "/host-2026/admin/?group=c2",
      },
    ]);
    expect(
      links.scheduleAdmin.map(({ label, to }) => ({ label, to })),
    ).to.deep.equal([
      {
        label: "Planlegg intervjuer · C1",
        to: "/host-2026/schedule?mode=admin&group=c1",
      },
      {
        label: "Planlegg intervjuer · C2",
        to: "/host-2026/schedule?mode=admin&group=c2",
      },
    ]);
    expect(
      links.scheduleMember.map(({ label, to }) => ({ label, to })),
    ).to.deep.equal([
      {
        label: "Registrer tilgjengelighet · C1",
        to: "/host-2026/schedule?mode=member&group=c1",
      },
      {
        label: "Registrer tilgjengelighet · C2",
        to: "/host-2026/schedule?mode=member&group=c2",
      },
    ]);
  });

  it("keeps committee application-admin routes alongside admission-wide access", () => {
    const mixedScopeUser: AdmissionUserData = {
      ...userdata,
      group_contexts: [
        groupContext("c1", "C1", {
          actions: {
            open_member_workspace: true,
            administer_group_applications: true,
          },
        }),
        userdata.group_contexts?.[1],
      ].filter(
        (
          context,
        ): context is NonNullable<
          AdmissionUserData["group_contexts"]
        >[number] => Boolean(context),
      ),
    };

    expect(
      getLandingAccessLinks("host-2026", mixedScopeUser).applicationAdmin,
    ).to.deep.equal([
      {
        key: "applications-c2",
        label: "Administrer søknader · C2",
        to: "/host-2026/admin/?group=c2",
      },
      {
        key: "applications-c1",
        label: "Administrer søknader · C1",
        to: "/host-2026/admin/?group=c1",
      },
    ]);
  });

  it("uses unscoped admin routes when authority comes from a separate admin group", () => {
    const adminGroupOnlyUser: AdmissionUserData = {
      ...userdata,
      group_contexts: [
        groupContext("admissions-admin", "Admission admins", {
          membership_role: "leader",
          membership_roles: ["leader"],
          sources: { admission_group: false, admin_group: true },
          actions: {
            open_member_workspace: false,
            administer_group_applications: false,
          },
        }),
      ],
      admission_actions: {
        administer_all_applications: true,
        administer_schedule: true,
        authority_group_ids: ["admissions-admin"],
      },
    };

    expect(
      getLandingAccessLinks("host-2026", adminGroupOnlyUser),
    ).to.deep.equal({
      applicationAdmin: [
        {
          key: "applications-all",
          label: "Administrer søknader",
          to: "/host-2026/admin/",
        },
      ],
      scheduleAdmin: [
        {
          key: "schedule-admin",
          label: "Planlegg intervjuer",
          to: "/host-2026/schedule?mode=admin",
        },
      ],
      scheduleMember: [],
    });
    expect(
      resolveScheduleWorkspaceContext({
        userdata: adminGroupOnlyUser,
        mode: "admin",
        groupId: "admissions-admin",
      }),
    ).to.include({ mode: null, valid: false, invalid: true });
    expect(
      resolveScheduleWorkspaceContext({
        userdata: adminGroupOnlyUser,
        mode: "admin",
        groupId: null,
      }),
    ).to.include({ mode: "admin", valid: true, invalid: false });
  });

  it("keeps unscoped admin drafts separate from committee drafts", () => {
    const unscopedAdmin = resolveScheduleWorkspaceContext({
      userdata,
      mode: "admin",
      groupId: null,
    });
    const committeeMember = resolveScheduleWorkspaceContext({
      userdata,
      mode: "member",
      groupId: "c2",
    });

    expect(resolveScheduleWorkspaceScopeId(unscopedAdmin, userdata)).to.equal(
      "admission",
    );
    expect(resolveScheduleWorkspaceScopeId(committeeMember, userdata)).to.equal(
      "c2",
    );
  });

  it("fails closed for an invalid schedule context while allowing deliberate member mode", () => {
    const multiCommitteeMember: AdmissionUserData = {
      ...userdata,
      admission_actions: {
        administer_all_applications: false,
        administer_schedule: false,
        authority_group_ids: [],
      },
    };
    expect(
      resolveScheduleWorkspaceContext({
        userdata: multiCommitteeMember,
        mode: null,
        groupId: null,
      }),
    ).to.include({
      mode: null,
      valid: false,
      invalid: false,
      requiresCommitteeSelection: true,
    });
    expect(
      resolveScheduleWorkspaceContext({
        userdata,
        mode: "member",
        groupId: "c1",
      }),
    ).to.include({ mode: "member", valid: true, invalid: false });
    expect(
      resolveScheduleWorkspaceContext({
        userdata,
        mode: "admin",
        groupId: "c1",
      }),
    ).to.include({ mode: null, valid: false, invalid: true });
    expect(
      resolveScheduleWorkspaceContext({
        userdata,
        mode: "admin",
        groupId: "c2",
      }),
    ).to.deep.include({
      mode: "admin",
      valid: true,
      invalid: false,
      groupContext: userdata.group_contexts?.[1],
    });
  });

  it("keeps an open collection ahead of draft actions and publication", () => {
    const readiness = derivePublicationReadiness({
      schedule: [
        { candidate_id: "candidate-1", candidate: "Ada", time: 480, panel: [] },
      ],
      candidateIds: ["candidate-1"],
      candidateScopeResolved: true,
      conflictReviewSummary: {
        resolved: true,
        candidateCount: 1,
        requiredReviewerCount: 1,
        completeReviewerCount: 1,
        incompleteReviewerCount: 0,
        remainingPairCount: 0,
        isComplete: true,
      },
      proposalConflictCount: 0,
      reviewParticipants: [],
      conflictCollectionReady: false,
    });
    const steps = buildWorkflowSteps({
      isAdmin: true,
      hasConfiguredAvailabilityWindows: false,
      hasDistributedPlan: false,
      myConflictReviewComplete: false,
      myConflictCandidateCount: 0,
      hasSavedConfig: false,
      hasScheduleDraft: true,
      myAvailabilitySaved: false,
      availabilityParticipantCount: 0,
      submittedAvailabilityCount: 0,
      proposalConflictCount: 0,
      conflictCollectionOpen: true,
      workflowPhase: "draft",
      publicationReadiness: readiness,
    });

    expect(readiness.ready).to.equal(false);
    expect(steps[1]).to.include({ status: "Pågår", locked: false });
    expect(steps[2]).to.include({ status: "Låst", locked: true });
  });

  it("keeps member input active until the current conflict scope is complete", () => {
    const steps = buildWorkflowSteps({
      isAdmin: false,
      hasConfiguredAvailabilityWindows: true,
      hasDistributedPlan: false,
      myConflictReviewComplete: false,
      myConflictCandidateCount: 2,
      hasSavedConfig: true,
      hasScheduleDraft: true,
      myAvailabilitySaved: true,
      availabilityParticipantCount: 1,
      submittedAvailabilityCount: 1,
      proposalConflictCount: 0,
      conflictCollectionOpen: true,
      workflowPhase: "draft",
      publicationReadiness: {
        ...derivePublicationReadiness({
          schedule: [
            {
              candidate_id: "candidate-1",
              candidate: "Ada",
              time: 480,
              panel: [],
            },
          ],
          candidateIds: ["candidate-1"],
          candidateScopeResolved: true,
          conflictReviewSummary: {
            resolved: true,
            candidateCount: 1,
            requiredReviewerCount: 1,
            completeReviewerCount: 0,
            incompleteReviewerCount: 1,
            remainingPairCount: 1,
            isComplete: false,
          },
          proposalConflictCount: 0,
          reviewParticipants: [],
          conflictCollectionReady: false,
        }),
      },
    });

    expect(steps[0]).to.include({
      status: "Pågår",
      complete: false,
      locked: false,
    });
  });

  it("does not reopen conflict collection for an already published plan", () => {
    const collection = {
      started: false,
      open: false,
      stale: false,
      complete: false,
      participantCount: 0,
      completedCount: 0,
      needsAction: true,
    };
    const savedSchedule = {
      schedule: [
        { candidate_id: "candidate-1", candidate: "Ada", time: 480, panel: [] },
      ],
      is_distributed: true,
    } as NonNullable<
      Parameters<typeof requiresConflictCollectionTask>[0]["savedSchedule"]
    >;

    expect(
      requiresConflictCollectionTask({ savedSchedule, collection }),
    ).to.equal(false);
    expect(
      requiresConflictCollectionTask({
        savedSchedule: { ...savedSchedule, is_distributed: false },
        collection,
      }),
    ).to.equal(true);
  });

  it("formats API errors without raw field keys", () => {
    expect(
      formatApiError({
        panel_size: ["Velg minst én intervjuer."],
        detail: "Ugyldig oppsett.",
      }),
    ).to.equal("Velg minst én intervjuer. Ugyldig oppsett.");
  });
});
