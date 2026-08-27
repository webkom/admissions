import {
  CalendarCheck,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
} from "lucide-react";

import type {
  PublicationReadiness,
  WorkflowPhase,
  WorkflowStepDefinition,
} from "./types";

interface WorkflowStepParams {
  isAdmin: boolean;
  hasConfiguredAvailabilityWindows: boolean;
  hasDistributedPlan: boolean;
  myConflictReviewComplete: boolean;
  myProposalCandidateCount: number;
  hasSavedConfig: boolean;
  hasScheduleDraft: boolean;
  myAvailabilitySaved: boolean;
  myAvailabilityOptedOut?: boolean;
  availabilityParticipantCount: number;
  submittedAvailabilityCount: number;
  proposalConflictCount: number;
  workflowPhase: WorkflowPhase;
  publicationReadiness: PublicationReadiness;
}

export const buildWorkflowSteps = ({
  isAdmin,
  hasConfiguredAvailabilityWindows,
  hasDistributedPlan,
  myAvailabilitySaved,
  myAvailabilityOptedOut = false,
  availabilityParticipantCount,
  submittedAvailabilityCount,
  publicationReadiness,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    // Members record their own availability as soon as the recruiter opens
    // the interview windows, and otherwise only see the published plan.
    // Applicant data (candidates, reviews) is never part of their flow.
    return [
      {
        key: "my-availability",
        title: "Mine opplysninger",
        description: hasConfiguredAvailabilityWindows
          ? "Lagre når du kan sitte i intervju."
          : "Vent til opptaksansvarlig åpner intervjutider.",
        icon: CalendarRange,
        status: hasDistributedPlan
          ? "Ferdig"
          : hasConfiguredAvailabilityWindows
            ? myAvailabilitySaved
              ? "Ferdig"
              : "Pågår"
            : "Låst",
        tone:
          myAvailabilitySaved || hasDistributedPlan
            ? "success"
            : hasConfiguredAvailabilityWindows
              ? "warning"
              : "locked",
        complete: hasDistributedPlan || myAvailabilitySaved,
        locked: !hasConfiguredAvailabilityWindows && !hasDistributedPlan,
      },
      {
        key: "plan",
        title: "Intervjuplan",
        description: myAvailabilityOptedOut
          ? "Du har meldt at du ikke deltar."
          : "Se dine intervjuer når planen er publisert.",
        icon: CalendarCheck,
        // A member who opted out has no stake in the plan and must not see
        // it, so the step stays locked however far the workflow has come.
        status: myAvailabilityOptedOut
          ? "Låst"
          : hasDistributedPlan
            ? "Ferdig"
            : "Låst",
        tone: myAvailabilityOptedOut
          ? "locked"
          : hasDistributedPlan
            ? "success"
            : "locked",
        complete: !myAvailabilityOptedOut && hasDistributedPlan,
        locked: myAvailabilityOptedOut || !hasDistributedPlan,
      },
    ];
  }

  const availabilityComplete =
    availabilityParticipantCount > 0 &&
    submittedAvailabilityCount >= availabilityParticipantCount;
  const foundationReady =
    hasConfiguredAvailabilityWindows &&
    myAvailabilitySaved &&
    availabilityComplete;
  const planLocked = !foundationReady && !hasDistributedPlan;
  const draftReadyForPublish = publicationReadiness.ready;

  return [
    {
      key: "config",
      title: "Grunnlag",
      description: "Sett rammene og samle tilgjengelighet.",
      icon: LayoutPanelTop,
      status: hasDistributedPlan || availabilityComplete ? "Ferdig" : "Pågår",
      tone: hasDistributedPlan || availabilityComplete ? "success" : "warning",
      complete: availabilityComplete || hasDistributedPlan,
    },
    {
      // Draft and publish are one step: generate, review, publish - and after
      // a partial publish, keep planning the remaining days in the same place.
      key: "solver",
      keys: ["solver", "plan"],
      title: "Plan",
      description: hasDistributedPlan
        ? "Publisert. Utvid publiseringen eller planlegg resten her."
        : "Lag planutkastet, kontroller det og publiser.",
      icon: Sparkles,
      status: planLocked
        ? "Låst"
        : hasDistributedPlan || draftReadyForPublish
          ? hasDistributedPlan
            ? "Publisert"
            : "Klar til å publisere"
          : "Pågår",
      tone: planLocked
        ? "locked"
        : hasDistributedPlan || draftReadyForPublish
          ? "success"
          : "muted",
      complete: hasDistributedPlan,
      locked: planLocked,
    },
  ];
};
