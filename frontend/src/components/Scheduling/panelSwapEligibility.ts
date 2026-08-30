import type { Interviewer, SchedulePanelMember } from "../../types";
import type { AssignmentAvailabilityStatus } from "./assignmentAvailability";
import type { PanelChipOption } from "./ui";

/**
 * Whether an interviewer may be swapped onto a panel seat, and if not, why.
 *
 * The rules match what the solver itself enforces, so a manual swap cannot
 * introduce a pairing the plan would later be blocked on:
 *
 *  - `on_panel`     – already sitting on this panel / block panel.
 *  - `inhabil`      – a registered inhabilitet against *any* candidate in the
 *                     block (a block shares one panel, so one clash is enough).
 *  - `unavailable`  – submitted availability that does not cover the slot(s)
 *                     being changed. An interviewer who has not submitted any
 *                     availability is *not* blocked on this ground — they may
 *                     still be a legitimate panel member (e.g. an admin group).
 *
 * The seat's current occupant is always selectable (re-picking them is a no-op).
 */
export type PanelSwapBlockReason = "on_panel" | "inhabil" | "unavailable";

export const panelSwapBlockLabel: Record<PanelSwapBlockReason, string> = {
  on_panel: "Allerede i panelet",
  inhabil: "Inhabil i blokken",
  unavailable: "Ikke tilgjengelig",
};

interface NamedRef {
  id?: string;
  name: string;
}

const isSameInterviewer = (a: NamedRef, b: NamedRef): boolean =>
  a.id && b.id ? a.id === b.id : a.name === b.name;

export interface PanelSwapEligibilityContext {
  /** The seat being changed. Re-selecting this person is never blocked. */
  replacing: NamedRef;
  /** Everyone currently seated (the slot's panel, or the block panel). */
  seatedPanel: ReadonlyArray<SchedulePanelMember>;
  /** Candidate ids of every interview in the same block. */
  blockCandidateIds: ReadonlySet<string>;
  /**
   * The interviewer's availability status for the slot(s) being changed. For a
   * per-slot swap this is that one slot; for a block-level swap the caller
   * reduces the block's slots to the worst status. Only
   * `outside_submitted_availability` blocks the swap.
   */
  availabilityStatusFor: (
    interviewer: Interviewer,
  ) => AssignmentAvailabilityStatus;
}

export const panelSwapBlockReason = (
  interviewer: Interviewer,
  ctx: PanelSwapEligibilityContext,
): PanelSwapBlockReason | null => {
  if (isSameInterviewer(ctx.replacing, interviewer)) return null;
  if (
    ctx.seatedPanel.some((member) => isSameInterviewer(member, interviewer))
  ) {
    return "on_panel";
  }
  if (
    interviewer.biased.some((candidateId) =>
      ctx.blockCandidateIds.has(candidateId),
    )
  ) {
    return "inhabil";
  }
  if (
    ctx.availabilityStatusFor(interviewer) === "outside_submitted_availability"
  ) {
    return "unavailable";
  }
  return null;
};

/** Build a searchable-dropdown option for `interviewer`, greyed out with a
 *  reason when the swap is not allowed. */
export const toPanelSwapOption = (
  interviewer: Interviewer,
  ctx: PanelSwapEligibilityContext,
): PanelChipOption => {
  const reason = panelSwapBlockReason(interviewer, ctx);
  return {
    id: interviewer.id,
    name: interviewer.name,
    disabled: reason !== null,
    disabledReason: reason ? panelSwapBlockLabel[reason] : undefined,
    disabledKind: reason ?? undefined,
  };
};
