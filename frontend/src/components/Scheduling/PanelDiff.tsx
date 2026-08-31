import React from "react";
import type { SchedulePanelMember } from "../../types";
import { Chip } from "src/components/ui";
import cn from "src/utils/cn";
import { derivePanelDiffView } from "./panelDiffModel";

interface PanelDiffProps {
  /** The block's modal panel, or `null` when the block has no repeating
   *  panel - then the slot's full panel is shown inline. */
  baseline: SchedulePanelMember[] | null;
  panel: SchedulePanelMember[];
  /** Panel-member names to flag (inhabilitet / bias). Only rendered when the
   *  full panel is shown inline. */
  flaggedNames?: ReadonlySet<string>;
  /** Marks the reader's own seat. Interviewers scan the published plan for
   *  the rows that are theirs, and the compact branches below name nobody at
   *  all - "Standardpanel" would otherwise hide the one fact they came for.
   *  Applies whether or not the "Mine" filter is on. */
  isCurrentUser?: (member: SchedulePanelMember) => boolean;
}

const diffPillClass =
  "inline-flex max-w-full items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-label font-semibold shadow-xs";

/**
 * The Panel column, shared by the draft and published schedule tables:
 *
 *  - the block's panel repeats and this slot matches it -> a quiet
 *    "Standardpanel" note;
 *  - this slot deviates from the block panel -> one compact "+A −B" /
 *    "A ⇄ B" tag;
 *  - the block has no repeating panel -> the slot's full panel as chips.
 *
 * Which of the three applies, and whether the reader is named in it, is
 * decided in `derivePanelDiffView`.
 */
export const PanelDiff: React.FC<PanelDiffProps> = ({
  baseline,
  panel,
  flaggedNames,
  isCurrentUser,
}) => {
  const view = derivePanelDiffView({ baseline, panel, isCurrentUser });

  if (view.kind === "roster") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {view.members.map(({ member, isCurrentUser: isMine }, index) => (
          <Chip
            key={`${member.name}-${index}`}
            tone={
              flaggedNames?.has(member.name)
                ? "danger"
                : isMine
                  ? "brand"
                  : "muted"
            }
            className={cn(isMine && "font-bold")}
          >
            {member.name}
            {isMine && <span className="sr-only"> (deg)</span>}
          </Chip>
        ))}
      </div>
    );
  }

  if (view.kind === "standard") {
    // When the reader sits in the block's standard panel, the one fact they
    // came for is "I'm on this one" - so highlight their own name as a pill
    // rather than burying it under a "Standardpanel · deg" note.
    if (view.isCurrentUser && view.currentUserName) {
      return (
        <span
          title={`Standardpanel: ${view.memberNames.join(", ")}`}
          className={cn(
            diffPillClass,
            "border-brand-border bg-brand-soft font-bold text-brand",
          )}
        >
          {view.currentUserName}
          <span className="sr-only"> (deg) – standardpanel</span>
        </span>
      );
    }
    return (
      <span
        title={`Standardpanel: ${view.memberNames.join(", ")}`}
        className="text-ui text-text-muted"
      >
        Standardpanel
      </span>
    );
  }

  return (
    <span
      title={`Avviker fra blokkens standardpanel: ${view.label}`}
      className={cn(
        diffPillClass,
        view.isCurrentUser
          ? "border-brand-border bg-brand-soft text-brand"
          : "border-border-soft bg-surface-subtle text-text-primary",
      )}
    >
      <span className="truncate">
        {view.segments.map((segment, index) =>
          segment.isCurrentUser ? (
            <strong key={index} className="font-bold">
              {segment.text}
            </strong>
          ) : (
            <React.Fragment key={index}>{segment.text}</React.Fragment>
          ),
        )}
      </span>
    </span>
  );
};
