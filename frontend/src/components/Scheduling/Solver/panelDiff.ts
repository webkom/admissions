import type { SchedulePanelMember } from "../types";

/** How a slot's panel relates to its block's baseline panel. */
export type PanelDiffKind = "exact" | "swap" | "partial" | "major";

export interface PanelDiff {
  kind: PanelDiffKind;
  /** Members present in the slot panel but not in the baseline. */
  added: SchedulePanelMember[];
  /** Members present in the baseline but not in the slot panel. */
  removed: SchedulePanelMember[];
}

export const memberKey = (member: SchedulePanelMember): string =>
  member.id ?? member.name;

/** Compare a slot panel against the block baseline:
 *  - exact: identical members (clean row, no diff UI)
 *  - swap: exactly one member replaced by one other (1-to-1 substitution)
 *  - partial: a small asymmetric change (legacy rows with odd panel sizes)
 *  - major: three or more members differ — render the actual panel instead
 *    of a diff tag
 */
export const getPanelDiff = (
  baselinePanel: SchedulePanelMember[],
  slotPanel: SchedulePanelMember[],
): PanelDiff => {
  const baselineKeys = new Set(baselinePanel.map(memberKey));
  const slotKeys = new Set(slotPanel.map(memberKey));
  const added = slotPanel.filter(
    (member) => !baselineKeys.has(memberKey(member)),
  );
  const removed = baselinePanel.filter(
    (member) => !slotKeys.has(memberKey(member)),
  );
  const changeCount = added.length + removed.length;

  let kind: PanelDiffKind = "exact";
  if (changeCount === 1) {
    kind = "partial";
  } else if (changeCount === 2) {
    kind = added.length === 1 && removed.length === 1 ? "swap" : "partial";
  } else if (changeCount >= 3) {
    kind = "major";
  }

  return { kind, added, removed };
};
