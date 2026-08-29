import React from "react";
import type { SchedulePanelMember } from "../../types";
import { Chip } from "src/components/ui";
import { getBlockPanelDiff } from "./Solver/blockBaseline";

interface PanelDiffProps {
  /** The block's modal panel, or `null` when the block has no repeating
   *  panel - then the slot's full panel is shown inline. */
  baseline: SchedulePanelMember[] | null;
  panel: SchedulePanelMember[];
  /** Panel-member names to flag (inhabilitet / bias). Only rendered when the
   *  full panel is shown inline. */
  flaggedNames?: ReadonlySet<string>;
}

const diffPillClass =
  "inline-flex max-w-full items-center whitespace-nowrap rounded-full border border-border-soft bg-surface-subtle px-2.5 py-0.5 text-xs font-semibold text-text-primary shadow-xs";

/**
 * The Panel column, shared by the draft and published schedule tables:
 *
 *  - the block's panel repeats and this slot matches it -> a quiet
 *    "Standardpanel" note;
 *  - this slot deviates from the block panel -> one compact "+A −B" /
 *    "A ⇄ B" tag;
 *  - the block has no repeating panel -> the slot's full panel as chips.
 */
export const PanelDiff: React.FC<PanelDiffProps> = ({
  baseline,
  panel,
  flaggedNames,
}) => {
  const diff = getBlockPanelDiff(baseline, panel);

  if (diff.kind === "fallback") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {panel.map((member, index) => (
          <Chip
            key={`${member.name}-${index}`}
            tone={flaggedNames?.has(member.name) ? "danger" : "muted"}
          >
            {member.name}
          </Chip>
        ))}
      </div>
    );
  }

  if (diff.kind === "exact") {
    return (
      <span
        title={`Standardpanel: ${panel.map((member) => member.name).join(", ")}`}
        className="text-sm text-text-muted"
      >
        Standardpanel
      </span>
    );
  }

  const added = diff.added.map((member) => member.name);
  const removed = diff.removed.map((member) => member.name);
  const isSwap =
    diff.kind === "swap" || (added.length === 1 && removed.length === 1);
  const label = isSwap
    ? `${added[0]} ⇄ ${removed[0]}`
    : [
        ...added.map((name) => `+${name}`),
        ...removed.map((name) => `−${name}`),
      ].join(" ");

  return (
    <span
      title={`Avviker fra blokkens standardpanel: ${label}`}
      className={diffPillClass}
    >
      <span className="truncate">{label}</span>
    </span>
  );
};
