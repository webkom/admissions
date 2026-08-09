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

const reviewerProgressLabel = (complete: number, required: number) =>
  `${complete} av ${required} ${required === 1 ? "intervjuer" : "intervjuere"} har svart`;

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
      description: "",
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
      tone: "danger",
      title: `${candidateLabel(unplaceableCount)} mangler intervju`,
      description:
        "Alle kandidater må få plass før kandidatkontrollen kan fullføres.",
    };
  }
  if (currentReviewRequired && !currentReviewComplete) {
    return {
      kind: "candidate_check_pending",
      tone: "warning",
      title: "Kandidatkontrollen pågår",
      description: `${reviewerProgressLabel(completeReviewerCount, requiredReviewerCount)}. Kontroller kandidatene du er foreslått til å intervjue.`,
    };
  }
  if (pendingReviewerCount > 0) {
    return {
      kind: "waiting_for_reviews",
      tone: "neutral",
      title: "Kandidatkontrollen pågår",
      description:
        missingReviewerNames.length > 0
          ? `${reviewerProgressLabel(completeReviewerCount, requiredReviewerCount)}. Venter på ${missingReviewerNames.join(", ")}.`
          : `${reviewerProgressLabel(completeReviewerCount, requiredReviewerCount)}.`,
    };
  }
  if (requiredReviewerCount === 0) {
    return {
      kind: "waiting_for_reviews",
      tone: "neutral",
      title: "Forbereder kandidatkontrollen",
      description: "",
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
      title: "Kontrollerer planutkastet",
      description: "",
    };
  }
  return {
    kind: "ready_to_publish",
    tone: "success",
    title: "Planutkastet er klart",
    description:
      "Alle kandidater er plassert og kandidatkontrollen er fullført.",
  };
};
