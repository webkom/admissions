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
  /** Panel-member names to flag (inhabilitet / bias). A flagged name always
   *  gets a visible, named chip - "Standardpanel" or a compact diff tag would
   *  otherwise bury the one name opptaksansvarlig actually needs to swap out,
   *  which is the whole point of surfacing this at all. */
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
    // The block's standard panel is the same for every row it covers, but a
    // flag is not - it names an inhabilitet against *this row's* candidate,
    // which can differ slot to slot even though the seated panel does not.
    // "Standardpanel" would bury exactly the name opptaksansvarlig needs to
    // swap out, so a flagged row breaks out into the same named chips the
    // no-repeating-panel case already uses, red on the flagged seat.
    const flagged = panel.filter((member) => flaggedNames?.has(member.name));
    if (flagged.length > 0) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {panel.map((member, index) => {
            const isMine = Boolean(isCurrentUser?.(member));
            const isFlagged = flaggedNames?.has(member.name);
            return (
              <Chip
                key={`${member.name}-${index}`}
                tone={isFlagged ? "danger" : isMine ? "brand" : "muted"}
                className={cn(isMine && "font-bold")}
              >
                {member.name}
                {isMine && <span className="sr-only"> (deg)</span>}
              </Chip>
            );
          })}
        </div>
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

  const flaggedSegment = view.segments.find(
    (segment) => segment.member && flaggedNames?.has(segment.member.name),
  );
  return (
    <span
      title={
        flaggedSegment
          ? `${flaggedSegment.member?.name} er inhabil for denne kandidaten`
          : `Avviker fra blokkens standardpanel: ${view.label}`
      }
      className={cn(
        diffPillClass,
        flaggedSegment
          ? "border-danger-border bg-danger-bg text-danger"
          : view.isCurrentUser
            ? "border-brand-border bg-brand-soft text-brand"
            : "border-border-soft bg-surface-subtle text-text-primary",
      )}
    >
      <span className="truncate">
        {view.segments.map((segment, index) => {
          const isFlagged = Boolean(
            segment.member && flaggedNames?.has(segment.member.name),
          );
          const text =
            segment.isCurrentUser || isFlagged ? (
              <strong className={cn("font-bold", isFlagged && "text-danger")}>
                {segment.text}
              </strong>
            ) : (
              segment.text
            );
          return <React.Fragment key={index}>{text}</React.Fragment>;
        })}
      </span>
    </span>
  );
};
