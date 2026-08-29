// One-way scheduling flow — design decisions (see
// ~/.commandcode/plans/scheduling-flow.md for the full reasoning):
// D1 Adaptive day scope with hard-target semantics: the solver fills whole
//    days in order over the requested day_scope_through window and reports
//    filled_day_count; "Planlegg neste dag" is the only extend action.
// D2 Locked rows are strict by default; the rebalance_locked option demotes
//    draft locks to soft preferences server-side. Published days never move.
// D3 The plan re-solves automatically when the last inhabilitet review
//    completes, detected by polling the availability roster (the deciding
//    review arrives in another person's browser).
// D4 filled_day_count is the only added response field.
// D5 This derivation is the single plan-draft state machine; the separate
//    missing-placements screen and its dismissal flag were removed.

type PlanDraftWorkflowKind =
  | "published"
  | "pending_proposal"
  | "saving"
  | "save_conflict"
  | "save_error"
  | "solver_error"
  | "generating"
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
  hasPendingProposal?: boolean;
  loading?: boolean;
  saveState: "idle" | "saving" | "saved" | "error" | "conflict";
  hasSaveConflict: boolean;
  saveError: string;
  solverError: string;
  unplaceableCount: number;
  /** Filled days reported by the latest solve, when available. */
  filledDayCount?: number;
  /** Whether another framework day can be pulled into the scope. */
  extendDayAvailable?: boolean;
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
  hasPendingProposal = false,
  loading = false,
  saveState,
  hasSaveConflict,
  saveError,
  solverError,
  unplaceableCount,
  filledDayCount,
  extendDayAvailable = false,
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
  if (hasPendingProposal) {
    return {
      kind: "pending_proposal",
      tone: "neutral",
      title: "Velg hvilket utkast du vil beholde",
      description:
        "Det nye forslaget er klart, og det gjeldende utkastet er fortsatt urørt.",
    };
  }
  if (loading) {
    return {
      kind: "generating",
      tone: "neutral",
      title: "Lager planutkast",
      description:
        "Planleggingen pågår. Neste handling blir tilgjengelig når forslaget er klart.",
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
          ? `Venter på ${missingReviewerNames.join(
              ", ",
            )}. Planen lages på nytt automatisk når alle har svart.`
          : `Venter på ${pendingReviewerCount} bekreftelse${
              pendingReviewerCount === 1 ? "" : "r"
            }. Planen lages på nytt automatisk når alle har svart.`,
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
  if (unplaceableCount > 0) {
    // A delplan is a legitimate state, not a blocker: under progressive
    // publishing the remaining candidates are planned when more days open,
    // and the partial plan can be published as it is.
    const filledPrefix =
      typeof filledDayCount === "number" && filledDayCount > 0
        ? `${filledDayCount} ${
            filledDayCount === 1 ? "hel dag" : "hele dager"
          } er planlagt. `
        : "";
    return {
      kind: "placements_missing",
      tone: "neutral",
      title: `Delplan klar — ${candidateLabel(unplaceableCount)} planlegges senere`,
      description: extendDayAvailable
        ? `${filledPrefix}Publiser delplanen som den er, eller planlegg neste dag for å plassere resten.`
        : `${filledPrefix}Alle planlagte dager er brukt. Publiser delplanen som den er, plasser de siste manuelt, eller utvid rammene med flere dager.`,
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
