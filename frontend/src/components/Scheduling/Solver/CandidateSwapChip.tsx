import React from "react";
import { EditablePanelChip } from "../ui";
import type { ScheduleItem } from "../types";

export type { CandidateSwapTarget } from "./candidateSwapTargets";
import type { CandidateSwapTarget } from "./candidateSwapTargets";

/** Sentinel option id. Every other id in this menu is a schedule index, so
 *  the free-the-slot entry needs one that can never collide with one. */
const UNASSIGN_OPTION_ID = "unassign";

interface CandidateSwapChipProps {
  item: ScheduleItem;
  scheduleIndex: number;
  /** Other placed candidates this row can swap time slots with, earliest
   *  first. Same-time rows (joint-interview partners) are excluded. */
  targets: CandidateSwapTarget[];
  formatTimeLabel: (time: number) => string;
  onSwap: (sourceScheduleIndex: number, targetScheduleIndex: number) => void;
  /** Empties this slot outright. Offered because a cancelled interview
   *  often has nobody to swap in - without it the only way out was to
   *  swap with an unrelated candidate and cancel theirs instead. */
  onUnassign?: (scheduleIndex: number) => void;
  conflict?: boolean;
}

/** The candidate cell of the plan list. The name doubles as a menu trigger:
 *  searching and picking another placed candidate exchanges the two between
 *  their time slots, while panels stay on their respective slots to preserve
 *  the interviewer group dynamic. Same search dropdown as replacing an
 *  interviewer. */
const CandidateSwapChip = ({
  item,
  scheduleIndex,
  targets,
  formatTimeLabel,
  onSwap,
  onUnassign,
  conflict,
}: CandidateSwapChipProps) => {
  const swapOptions = targets.map((target) => {
    const prefix = target.isConflictFree ? "✓ " : "⚠️ ";
    const statusNote = target.status === "confirmed" ? " (Bekreftet)" : "";
    const dayNote = target.isSameDay ? " (i dag)" : "";
    const label = `${prefix}${target.name} — ${formatTimeLabel(target.time)}${statusNote || dayNote}`;
    return {
      id: String(target.scheduleIndex),
      name: label,
      disabled: !target.isConflictFree,
      disabledReason: target.conflictReason,
    };
  });

  // Last, not first: emptying the slot is the fallback for when none of the
  // swaps above will do, and it should never be the entry the keyboard
  // highlights by default.
  const options = onUnassign
    ? [
        {
          id: UNASSIGN_OPTION_ID,
          name: `—`,
        },
        ...swapOptions,
      ]
    : swapOptions;

  return (
    <EditablePanelChip
      variant="plain"
      label={item.candidate}
      conflict={conflict}
      options={options.length > 0 ? options : undefined}
      onSelect={(_, id) => {
        if (id === UNASSIGN_OPTION_ID) {
          onUnassign?.(scheduleIndex);
          return;
        }
        const targetScheduleIndex = Number(id);
        if (Number.isFinite(targetScheduleIndex)) {
          onSwap(scheduleIndex, targetScheduleIndex);
        }
      }}
      title={
        onUnassign
          ? "Bytt plass med en annen kandidat, eller gjør luken ledig"
          : "Bytt plass med en annen kandidat (foreslår automatisk konfliktfrie bytter)"
      }
      searchPlaceholder="Søk kandidat…"
      emptyLabel={
        targets.length > 0
          ? "Ingen treff på søket"
          : "Ingen andre kandidater i planen"
      }
    />
  );
};

export default CandidateSwapChip;
