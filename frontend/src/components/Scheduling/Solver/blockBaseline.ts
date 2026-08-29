import type { ScheduleItem, SchedulePanelMember } from "../types";
import { memberKey } from "./panelDiff";

/**
 * The result of comparing one slot's panel against the block's modal panel.
 *
 *  - "exact": the slot panel is identical to the baseline. Render nothing
 *    in the diff column.
 *  - "swap": exactly one member replaced by one other. Render a single
 *    "A ⇄ B" tag.
 *  - "asymmetric": 2+ members differ, or 1 added without 1 removed (or
 *    vice versa). Render a "+A / −B" style tag.
 *  - "fallback": no modal baseline exists for this block. The caller must
 *    render the slot's full panel inline; this kind is never paired with
 *    a diff tag.
 */
export type BlockPanelDiffKind = "exact" | "swap" | "asymmetric" | "fallback";

export interface BlockPanelDiff {
  kind: BlockPanelDiffKind;
  /** Members present in the slot panel but not in the baseline. */
  added: SchedulePanelMember[];
  /** Members present in the baseline but not in the slot panel. */
  removed: SchedulePanelMember[];
}

const sortMembers = (members: SchedulePanelMember[]): SchedulePanelMember[] =>
  [...members].sort((left, right) => left.name.localeCompare(right.name, "nb"));

const canonicalKey = (members: SchedulePanelMember[]): string =>
  sortMembers(members)
    .map((m) => memberKey(m))
    .join("|");

/**
 * Find the modal (most common) exact N-member panel across the given
 * slots. When multiple panels are tied, ties are broken alphabetically
 * by member name for determinism. Returns `null` only when no slots have
 * assigned panel members.
 */
export const calculateBlockBaseline = (
  slots: ScheduleItem[],
  panelSize: number,
): SchedulePanelMember[] | null => {
  if (slots.length === 0) return null;
  const counts = new Map<
    string,
    { panel: SchedulePanelMember[]; count: number }
  >();
  for (const slot of slots) {
    const sorted = sortMembers(slot.panel);
    if (sorted.length === 0) continue;
    const key = canonicalKey(sorted);
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { panel: sorted, count: 1 });
  }
  if (counts.size === 0) return null;
  // Sort: highest count first; ties broken by the panel whose first
  // member is alphabetically first, then by the rest. This keeps the
  // baseline deterministic across re-renders. Prefer panels matching
  // the expected panel size.
  const matchingSize = Array.from(counts.values()).filter(
    (item) => item.panel.length === panelSize,
  );
  const candidates =
    matchingSize.length > 0 ? matchingSize : Array.from(counts.values());

  const ranked = candidates.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    for (let i = 0; i < left.panel.length; i += 1) {
      const cmp = left.panel[i].name.localeCompare(
        right.panel[i]?.name ?? "",
        "nb",
      );
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  const top = ranked[0];
  if (!top) return null;
  return top.panel;
};

/**
 * Compare a slot's panel against the block's modal baseline.
 *
 * Returns `{ kind: "fallback" }` when `baseline` is `null` so the caller
 * can render the slot's full panel inline.
 */
export const getBlockPanelDiff = (
  baseline: SchedulePanelMember[] | null,
  slotPanel: SchedulePanelMember[],
): BlockPanelDiff => {
  if (baseline === null) {
    return { kind: "fallback", added: [], removed: [] };
  }
  const baselineKeys = new Set(baseline.map(memberKey));
  const slotKeys = new Set(slotPanel.map(memberKey));
  const added = slotPanel.filter(
    (member) => !baselineKeys.has(memberKey(member)),
  );
  const removed = baseline.filter((member) => !slotKeys.has(memberKey(member)));
  const changeCount = added.length + removed.length;
  let kind: BlockPanelDiffKind = "exact";
  if (changeCount === 0) {
    kind = "exact";
  } else if (changeCount === 2 && added.length === 1 && removed.length === 1) {
    kind = "swap";
  } else {
    kind = "asymmetric";
  }
  return { kind, added, removed };
};
