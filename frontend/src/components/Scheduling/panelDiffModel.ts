import type { SchedulePanelMember } from "../../types";
import { getBlockPanelDiff } from "./Solver/blockBaseline";

/**
 * What the Panel column should say, and whether the reader is in it.
 *
 * Interviewers scan the published plan for the rows that are theirs. Two of
 * the three renderings name nobody at all - "Standardpanel" is the common
 * case - so "is this mine?" has to be decided here rather than left to the
 * reader's eye. Kept separate from the component because the *decision* is
 * the part worth testing, and because a removed member needs comparing
 * against the diff rather than the seated panel.
 */

export interface PanelDiffSegment {
  text: string;
  /** The member this segment names, or null for a separator. */
  member: SchedulePanelMember | null;
  isCurrentUser: boolean;
}

export type PanelDiffView =
  /** No repeating block panel: list the slot's panel as chips. */
  | {
      kind: "roster";
      members: Array<{ member: SchedulePanelMember; isCurrentUser: boolean }>;
      isCurrentUser: boolean;
    }
  /** The slot matches the block's standard panel. */
  | { kind: "standard"; memberNames: string[]; isCurrentUser: boolean }
  /** The slot deviates: one compact tag naming the difference. */
  | {
      kind: "deviation";
      segments: PanelDiffSegment[];
      label: string;
      isCurrentUser: boolean;
    };

export const derivePanelDiffView = ({
  baseline,
  panel,
  isCurrentUser,
}: {
  baseline: SchedulePanelMember[] | null;
  panel: SchedulePanelMember[];
  isCurrentUser?: (member: SchedulePanelMember) => boolean;
}): PanelDiffView => {
  const diff = getBlockPanelDiff(baseline, panel);
  const mine = (member: SchedulePanelMember) =>
    Boolean(isCurrentUser?.(member));

  if (diff.kind === "fallback") {
    const members = panel.map((member) => ({
      member,
      isCurrentUser: mine(member),
    }));
    return {
      kind: "roster",
      members,
      isCurrentUser: members.some((entry) => entry.isCurrentUser),
    };
  }

  if (diff.kind === "exact") {
    return {
      kind: "standard",
      memberNames: panel.map((member) => member.name),
      isCurrentUser: panel.some(mine),
    };
  }

  const separator = (text: string): PanelDiffSegment => ({
    text,
    member: null,
    isCurrentUser: false,
  });
  const named = (
    member: SchedulePanelMember,
    text: string,
  ): PanelDiffSegment => ({ text, member, isCurrentUser: mine(member) });

  const isSwap =
    diff.kind === "swap" ||
    (diff.added.length === 1 && diff.removed.length === 1);
  const segments: PanelDiffSegment[] =
    isSwap && diff.added[0] && diff.removed[0]
      ? [
          named(diff.added[0], diff.added[0].name),
          separator(" ⇄ "),
          named(diff.removed[0], diff.removed[0].name),
        ]
      : [
          ...diff.added.map((member) => named(member, `+${member.name}`)),
          ...diff.removed.map((member) => named(member, `−${member.name}`)),
        ].flatMap((segment, index) =>
          index === 0 ? [segment] : [separator(" "), segment],
        );

  return {
    kind: "deviation",
    segments,
    label: segments.map((segment) => segment.text).join(""),
    isCurrentUser: segments.some((segment) => segment.isCurrentUser),
  };
};
