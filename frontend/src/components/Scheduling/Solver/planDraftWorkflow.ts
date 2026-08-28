type PlanDraftWorkflowKind =
  | "published"
  | "saving"
  | "save_conflict"
  | "save_error"
  | "solver_error"
  | "placements_missing"
  | "candidate_check_pending"
  | "waiting_for_reviews"
  | "repair_required"
  | "ready_to_publish";

interface PlanDraftWorkflowState {
  kind: PlanDraftWorkflowKind;
  tone: "danger" | "warning" | "neutral" | "success";
  title: string;
  description: string;
}

interface PlanDraftWorkflowParams {
  isPublished?: boolean;
  saveState: "idle" | "saving" | "saved" | "error" | "conflict";
  hasSaveConflict: boolean;
  saveError: string;
  solverError: string;
  unplaceableCount: number;
  currentReviewRequired: boolean;
  currentReviewComplete: boolean;
  completeReviewerCount: number;
  requiredReviewerCount: number;
  pendingReviewerCount: number;
  missingReviewerNames: string[];
  assignmentConflictCount: number;
  publicationReady: boolean;
}

const candidateLabel = (count: number) =>
  `${count} kandidat${count === 1 ? "" : "er"}`;

const conflictLabel = (count: number) =>
  `${count} inhabilitet${count === 1 ? "" : "er"}`;

export const derivePlanDraftWorkflowState = ({
  isPublished = false,
  saveState,
  hasSaveConflict,
  saveError,
  solverError,
  unplaceableCount,
  currentReviewRequired,
  currentReviewComplete,
  completeReviewerCount,
  requiredReviewerCount,
  pendingReviewerCount,
  missingReviewerNames,
  assignmentConflictCount,
  publicationReady,
}: PlanDraftWorkflowParams): PlanDraftWorkflowState => {
  if (isPublished) {
    return {
      kind: "published",
      tone: "success",
      title: "Planen er publisert",
      description: "Åpne intervjuplanen for videre oppfølging.",
    };
  }
  if (hasSaveConflict || saveState === "conflict") {
    return {
      kind: "save_conflict",
      tone: "danger",
      title: "Planutkastet er endret et annet sted",
      description:
        saveError || "Last inn siste versjon før du fortsetter å redigere.",
    };
  }
  if (saveState === "error") {
    return {
      kind: "save_error",
      tone: "danger",
      title: "Kunne ikke lagre utkastet",
      description: saveError || "Prøv å lagre endringen på nytt.",
    };
  }
  if (saveState === "saving") {
    return {
      kind: "saving",
      tone: "neutral",
      title: "Lagrer utkastet",
      description: "Neste handling blir tilgjengelig når lagringen er ferdig.",
    };
  }
  if (solverError) {
    return {
      kind: "solver_error",
      tone: "danger",
      title: "Kunne ikke generere et nytt forslag",
      description: `${solverError} Det lagrede utkastet er beholdt.`,
    };
  }
  if (unplaceableCount > 0) {
    return {
      kind: "placements_missing",
      tone: "warning",
      title: `Delplan klar — ${candidateLabel(unplaceableCount)} mangler intervju`,
      description:
        "Aktiver flere dager for å plassere resten, eller juster planutkastet for hånd.",
    };
  }
  if (currentReviewRequired && !currentReviewComplete) {
    return {
      kind: "candidate_check_pending",
      tone: "warning",
      title: `Inhabilitetssjekk, ${completeReviewerCount} av ${requiredReviewerCount} har svart`,
      description:
        "Kontroller kandidatene du foreløpig er foreslått til å intervjue.",
    };
  }
  if (pendingReviewerCount > 0) {
    return {
      kind: "waiting_for_reviews",
      tone: "neutral",
      title: `Inhabilitetssjekk, ${completeReviewerCount} av ${requiredReviewerCount} har svart`,
      description:
        missingReviewerNames.length > 0
          ? `Venter på ${missingReviewerNames.join(", ")}.`
          : `Venter på ${pendingReviewerCount} bekreftelse${pendingReviewerCount === 1 ? "" : "r"}.`,
    };
  }
  if (requiredReviewerCount === 0) {
    return {
      kind: "waiting_for_reviews",
      tone: "neutral",
      title: "Inhabilitetssjekk klargjøres",
      description:
        "Neste steg blir tilgjengelig når inhabilitetssjekken er klar.",
    };
  }
  if (assignmentConflictCount > 0) {
    return {
      kind: "repair_required",
      tone: "danger",
      title: `${conflictLabel(assignmentConflictCount)} må løses`,
      description:
        "Alle har svart. Oppdater tildelingene før planen kan publiseres.",
    };
  }
  if (!publicationReady) {
    return {
      kind: "waiting_for_reviews",
      tone: "neutral",
      title: "Planutkastet kontrolleres",
      description: "Neste steg blir tilgjengelig når kontrollen er fullført.",
    };
  }
  return {
    kind: "ready_to_publish",
    tone: "success",
    title: "Planutkastet er klart",
    description:
      "Alle kandidater er plassert og inhabilitetssjekken er fullført.",
  };
};
