import React from "react";
import { EditablePanelChip } from "../ui";
import type { ScheduleItem } from "../types";

export type { CandidateSwapTarget } from "./candidateSwapTargets";
import type { CandidateSwapTarget } from "./candidateSwapTargets";

interface CandidateSwapChipProps {
  item: ScheduleItem;
  scheduleIndex: number;
  /** Other placed candidates this row can swap time slots with, earliest
   *  first. Same-time rows (joint-interview partners) are excluded. */
  targets: CandidateSwapTarget[];
  formatTimeLabel: (time: number) => string;
  onSwap: (sourceScheduleIndex: number, targetScheduleIndex: number) => void;
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
  conflict,
}: CandidateSwapChipProps) => (
  <EditablePanelChip
    variant="plain"
    label={item.candidate}
    conflict={conflict}
    options={
      targets.length > 0
        ? targets.map((target) => {
            const prefix = target.isConflictFree ? "✓ " : "⚠️ ";
            const statusNote =
              target.status === "confirmed" ? " (Bekreftet)" : "";
            const dayNote = target.isSameDay ? " (i dag)" : "";
            const label = `${prefix}${target.name} — ${formatTimeLabel(target.time)}${statusNote || dayNote}`;
            return {
              id: String(target.scheduleIndex),
              name: label,
              disabled: !target.isConflictFree,
              disabledReason: target.conflictReason,
            };
          })
        : undefined
    }
    onSelect={(_, id) => {
      const targetScheduleIndex = Number(id);
      if (Number.isFinite(targetScheduleIndex)) {
        onSwap(scheduleIndex, targetScheduleIndex);
      }
    }}
    title="Bytt plass med en annen kandidat (foreslår automatisk konfliktfrie bytter)"
    searchPlaceholder="Søk kandidat…"
    emptyLabel={
      targets.length > 0
        ? "Ingen treff på søket"
        : "Ingen andre kandidater i planen"
    }
  />
);

export default CandidateSwapChip;
