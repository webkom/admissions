import { CalendarCheck, LayoutPanelTop, Sparkles } from "lucide-react";

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
  availabilityParticipantCount,
  submittedAvailabilityCount,
  publicationReadiness,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    // Members only ever see the published plan: nothing else in the
    // schedule is for them.
    return [
      {
        key: "plan",
        title: "Intervjuplan",
        description: "Se dine intervjuer når planen er publisert.",
        icon: CalendarCheck,
        status: hasDistributedPlan ? "Ferdig" : "Låst",
        tone: hasDistributedPlan ? "success" : "locked",
        complete: hasDistributedPlan,
        locked: !hasDistributedPlan,
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
