import type { PublicationReadiness } from "./types";

interface ScheduleStageSummary<Kind extends string> {
  kind: Kind;
  title: string;
  description: string;
}

type FoundationStage =
  | "framework"
  | "availability"
  | "coverage_waiting"
  | "coverage_ready";

export const foundationFrameworkPresentation = {
  title: "Sett rammene for intervjuene",
  subtitle: "Tre steg. Du kan endre alt senere.",
} as const;

export const deriveFoundationStage = ({
  hasConfiguredAvailabilityWindows,
  ownAvailabilityComplete,
  availabilityReady,
}: {
  hasConfiguredAvailabilityWindows: boolean;
  ownAvailabilityComplete: boolean;
  availabilityReady: boolean;
  submittedCount: number;
  participantCount: number;
}): ScheduleStageSummary<FoundationStage> => {
  if (!hasConfiguredAvailabilityWindows) {
    return {
      kind: "framework",
      title: foundationFrameworkPresentation.title,
      description: "",
    };
  }

  if (!ownAvailabilityComplete) {
    return {
      kind: "availability",
      title: "Legg inn din tilgjengelighet",
      description:
        "Velg blokkene du kan intervjue i. Etter lagring får du oversikt over hele intervjugruppen.",
    };
  }

  if (!availabilityReady) {
    return {
      kind: "coverage_waiting",
      title: "Vent på de siste svarene",
      description:
        "Du kan kontrollere dekningen nå. Planutkastet blir tilgjengelig når alle deltakende intervjuere har svart.",
    };
  }

  return {
    kind: "coverage_ready",
    title: "Grunnlaget er klart",
    description:
      "Alle deltakende intervjuere har svart. Neste steg er å lage planutkastet.",
  };
};

export const derivePendingProposalDecision = ({
  isStale,
  hasExpired,
}: {
  isStale: boolean;
  hasExpired: boolean;
}) => {
  const mustRegenerate = isStale || hasExpired;
  return {
    canApply: !mustRegenerate,
    primaryAction: mustRegenerate
      ? ("discard_and_regenerate" as const)
      : ("apply" as const),
    primaryLabel: mustRegenerate ? "Forkast og lag nytt" : "Bruk forslaget",
    showAdjustAction: !mustRegenerate,
  };
};

export type PublicationStage =
  | "blocked_review"
  | "waiting_for_reviews"
  | "publish"
  | "published";

export type PublicationStageAction =
  | "return_to_draft"
  | "review_own_check"
  | "publish"
  | "open_published_plan";

export interface PublicationStagePresentation
  extends ScheduleStageSummary<PublicationStage> {
  primaryAction: PublicationStageAction | null;
  secondaryActions: PublicationStageAction[];
}

export const derivePublicationStage = ({
  isPublished,
  readiness,
  currentReviewRequired = false,
  currentReviewComplete = false,
}: {
  isPublished: boolean;
  readiness: PublicationReadiness;
  currentReviewRequired?: boolean;
  currentReviewComplete?: boolean;
}): PublicationStagePresentation => {
  if (isPublished) {
    return {
      kind: "published",
      title: "Planen er publisert",
      description: "Intervjuplanen er klar for oppfølging.",
      primaryAction: "open_published_plan",
      secondaryActions: [],
    };
  }

  if (!readiness.ready && currentReviewRequired && !currentReviewComplete) {
    return {
      kind: "blocked_review",
      title: "Din inhabilitetssjekk gjenstår",
      description:
        "Kontroller kandidatene du kan møte i intervju før planen kan publiseres.",
      primaryAction: "review_own_check",
      secondaryActions: ["return_to_draft"],
    };
  }

  if (
    !readiness.ready &&
    readiness.draftSaved &&
    readiness.allCandidatesScheduled &&
    readiness.proposalConflictCount === 0 &&
    !readiness.reviewResolved &&
    (!currentReviewRequired || currentReviewComplete)
  ) {
    return {
      kind: "waiting_for_reviews",
      title: "Venter på de siste bekreftelsene",
      description:
        "Planen går videre automatisk når alle intervjuere har kontrollert kandidatene sine.",
      primaryAction: null,
      secondaryActions: currentReviewRequired ? ["review_own_check"] : [],
    };
  }

  if (!readiness.ready) {
    return {
      kind: "blocked_review",
      title: "Planen er ikke klar for publisering",
      description:
        "Gå tilbake til planutkastet og løs det ene forholdet som stopper publisering.",
      primaryAction: "return_to_draft",
      secondaryActions: [],
    };
  }

  return {
    kind: "publish",
    title: "Klar for publisering",
    description:
      "Alle krav er oppfylt. Velg synlighet for kandidatnavn og publiser planen.",
    primaryAction: "publish",
    secondaryActions: ["return_to_draft"],
  };
};
