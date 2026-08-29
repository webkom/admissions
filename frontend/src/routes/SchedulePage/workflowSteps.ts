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
  planFullyDistributed?: boolean;
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
  planFullyDistributed = false,
  myConflictReviewComplete,
  myProposalCandidateCount,
  myAvailabilitySaved,
  myAvailabilityOptedOut = false,
  availabilityParticipantCount,
  submittedAvailabilityCount,
  publicationReadiness,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    // Members record their own availability as soon as the recruiter opens
    // the interview windows, and otherwise only see the published plan.
    // Applicant data (candidates, reviews) is never part of their flow -
    // with one exception: their own inhabilitetssjekk. Publication waits on
    // every proposed interviewer confirming their pairings, so a member with
    // an unconfirmed review list has an actionable step before the plan can
    // be published. Without it the workflow deadlocks: the admin cannot
    // publish, and the member's plan stays locked forever.
    const myReviewOutstanding =
      !myAvailabilityOptedOut &&
      !hasDistributedPlan &&
      myProposalCandidateCount > 0 &&
      !myConflictReviewComplete;
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
          : myReviewOutstanding
            ? "Kontroller kandidatene du er foreslått til å intervjue."
            : "Se dine intervjuer når planen er publisert.",
        icon: CalendarCheck,
        // A member who opted out has no stake in the plan and must not see
        // it, so the step stays locked however far the workflow has come.
        status: myAvailabilityOptedOut
          ? "Låst"
          : hasDistributedPlan
            ? "Ferdig"
            : myReviewOutstanding
              ? "Pågår"
              : "Låst",
        tone: myAvailabilityOptedOut
          ? "locked"
          : hasDistributedPlan
            ? "success"
            : myReviewOutstanding
              ? "warning"
              : "locked",
        complete: !myAvailabilityOptedOut && hasDistributedPlan,
        locked:
          myAvailabilityOptedOut ||
          (!hasDistributedPlan && !myReviewOutstanding),
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
      // Once the whole plan is published the draft workspace is just a redirect
      // card, so send the click straight to the published plan. A partial
      // publish still needs the workspace to plan the remaining days.
      navigateKey: planFullyDistributed ? "plan" : "solver",
      title: "Plan",
      description: planFullyDistributed
        ? "Publisert. Åpne intervjuplanen for oppfølging."
        : hasDistributedPlan
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
