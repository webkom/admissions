import {
  CalendarCheck,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
} from "lucide-react";

import type { ConflictReviewSummary, WorkflowStepDefinition } from "./types";

interface WorkflowStepParams {
  isAdmin: boolean;
  hasConfiguredAvailabilityWindows: boolean;
  hasDistributedPlan: boolean;
  conflictReviewSummary: ConflictReviewSummary;
  myConflictReviewComplete: boolean;
  myProposalCandidateCount: number;
  hasSavedConfig: boolean;
  hasScheduleDraft: boolean;
  myAvailabilitySaved: boolean;
  availabilityParticipantCount: number;
  submittedAvailabilityCount: number;
  proposalConflictCount: number;
}

export const buildWorkflowSteps = ({
  isAdmin,
  hasConfiguredAvailabilityWindows,
  hasDistributedPlan,
  conflictReviewSummary,
  myConflictReviewComplete,
  myProposalCandidateCount,
  hasSavedConfig,
  hasScheduleDraft,
  myAvailabilitySaved,
  availabilityParticipantCount,
  submittedAvailabilityCount,
  proposalConflictCount,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    const proposedCandidatesReady =
      myProposalCandidateCount === 0 || myConflictReviewComplete;
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
              : !myAvailabilitySaved
                ? "Tider mangler"
                : hasScheduleDraft && !proposedCandidatesReady
                  ? "Sjekk kandidater"
                  : hasScheduleDraft
                    ? "Ferdig"
                    : "Tider lagret"
            : "Ikke åpnet",
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
        status: hasDistributedPlan ? "Klar" : "Låst",
        tone: hasDistributedPlan ? "success" : "locked",
        complete: hasDistributedPlan,
        locked: !hasDistributedPlan,
      },
    ];
  }

  const availabilityComplete =
    availabilityParticipantCount > 0 &&
    submittedAvailabilityCount >= availabilityParticipantCount;
  const missingAvailabilityCount = Math.max(
    0,
    availabilityParticipantCount - submittedAvailabilityCount,
  );
  const draftReadyForPublish =
    hasScheduleDraft &&
    conflictReviewSummary.isComplete &&
    proposalConflictCount === 0;

  return [
    {
      key: "config",
      title: "Grunnlag",
      description: "Sett rammene og samle tilgjengelighet.",
      icon: LayoutPanelTop,
      status: hasDistributedPlan
        ? "Ferdig"
        : !hasSavedConfig
          ? "Sett opp"
          : availabilityComplete
            ? "Ferdig"
            : `${missingAvailabilityCount} mangler tider`,
      tone: hasDistributedPlan || availabilityComplete ? "success" : "warning",
      complete: availabilityComplete || hasDistributedPlan,
    },
    {
      key: "solver",
      title: "Planutkast",
      description: "Generer, kontroller kandidater og løs avvik.",
      icon: Sparkles,
      status: !hasSavedConfig
        ? "Låst"
        : hasDistributedPlan
          ? "Ferdig"
          : !availabilityComplete
            ? "Venter på tider"
            : !hasScheduleDraft
              ? "Klar"
              : proposalConflictCount > 0
                ? `${proposalConflictCount} må løses`
                : !conflictReviewSummary.isComplete
                  ? `${conflictReviewSummary.incompleteReviewerCount} må bekrefte`
                  : "Kontrollert",
      tone: !hasSavedConfig
        ? "locked"
        : hasDistributedPlan
          ? "success"
          : !availabilityComplete || proposalConflictCount > 0
            ? "warning"
            : hasScheduleDraft && conflictReviewSummary.isComplete
              ? "success"
              : "muted",
      complete: draftReadyForPublish || hasDistributedPlan,
      locked: !hasSavedConfig,
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
        : !hasScheduleDraft
          ? "Låst"
          : proposalConflictCount > 0
            ? "Løs inhabilitet"
            : !conflictReviewSummary.isComplete
              ? "Venter på kontroll"
              : "Klar",
      tone: hasDistributedPlan
        ? "success"
        : !hasScheduleDraft
          ? "locked"
          : draftReadyForPublish
            ? "success"
            : "warning",
      complete: hasDistributedPlan,
      locked: !hasScheduleDraft && !hasDistributedPlan,
    },
  ];
};
