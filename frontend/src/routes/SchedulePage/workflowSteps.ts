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
  myConflictCandidateCount: number;
  hasSavedConfig: boolean;
  hasScheduleDraft: boolean;
  myAvailabilitySaved: boolean;
  availabilityParticipantCount: number;
  submittedAvailabilityCount: number;
  proposalConflictCount: number;
  conflictCollectionOpen?: boolean;
  workflowPhase: WorkflowPhase;
  publicationReadiness: PublicationReadiness;
}

export const buildWorkflowSteps = ({
  isAdmin,
  hasConfiguredAvailabilityWindows,
  hasDistributedPlan,
  myConflictReviewComplete,
  myConflictCandidateCount,
  hasScheduleDraft,
  myAvailabilitySaved,
  availabilityParticipantCount,
  submittedAvailabilityCount,
  conflictCollectionOpen = false,
  publicationReadiness,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    const proposedCandidatesReady =
      myConflictCandidateCount === 0 || myConflictReviewComplete;
    const memberInputComplete =
      hasDistributedPlan ||
      (myAvailabilitySaved && hasScheduleDraft && proposedCandidatesReady);
    return [
      {
        key: "my-availability",
        title: "Mine opplysninger",
        description: hasConfiguredAvailabilityWindows
          ? "Lagre tilgjengelighet og kontroller foreslåtte kandidater."
          : "Vent til opptaksansvarlig åpner intervjutider.",
        icon: CalendarRange,
        status: hasDistributedPlan
          ? "Ferdig"
          : hasConfiguredAvailabilityWindows
            ? memberInputComplete
              ? "Ferdig"
              : "Pågår"
            : "Låst",
        tone:
          memberInputComplete || myAvailabilitySaved
            ? "success"
            : hasConfiguredAvailabilityWindows
              ? "warning"
              : "locked",
        complete: memberInputComplete,
        locked: !hasConfiguredAvailabilityWindows && !hasDistributedPlan,
      },
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
  const planDraftLocked =
    !foundationReady && !hasDistributedPlan && !conflictCollectionOpen;
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
      key: "solver",
      title: "Planutkast",
      description: conflictCollectionOpen
        ? "Fullfør kandidatkontrollen før du fortsetter."
        : "Generer, kontroller kandidater og løs avvik.",
      icon: Sparkles,
      status: planDraftLocked
        ? "Låst"
        : conflictCollectionOpen
          ? "Pågår"
          : hasDistributedPlan || draftReadyForPublish
            ? "Ferdig"
            : "Pågår",
      tone: planDraftLocked
        ? "locked"
        : conflictCollectionOpen
          ? "warning"
          : hasDistributedPlan || draftReadyForPublish
            ? "success"
            : "muted",
      complete:
        !conflictCollectionOpen && (draftReadyForPublish || hasDistributedPlan),
      locked: planDraftLocked,
    },
    {
      key: "plan",
      title: hasDistributedPlan ? "Gjennomføring" : "Publisering",
      description: hasDistributedPlan
        ? "Inviter, eksporter og følg opp intervjuene."
        : "Se over utkastet og publiser endelige tider.",
      icon: CalendarCheck,
      status: hasDistributedPlan
        ? "Ferdig"
        : draftReadyForPublish
          ? "Pågår"
          : "Låst",
      tone: hasDistributedPlan
        ? "success"
        : draftReadyForPublish
          ? "muted"
          : "locked",
      complete: hasDistributedPlan,
      locked: !draftReadyForPublish && !hasDistributedPlan,
    },
  ];
};
