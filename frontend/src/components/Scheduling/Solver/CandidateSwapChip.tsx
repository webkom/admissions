import React, { useState } from "react";
import { EditablePanelChip } from "../ui";
import type { ScheduleItem } from "../types";
import TwoStepSwapMenu from "./twoStepSwapMenu";

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
  /** When true, the popover renders a stacked "Bytt ut" + "Bytt inn" pair
   *  instead of a single searchable target list. Selecting "Bytt ut" auto-
   *  focuses the "Bytt inn" search input. Used only in the planutkast. */
  twoStep?: boolean;
}

/** The candidate cell of the plan list. The name doubles as a menu
 *  trigger: picking another candidate exchanges the two candidates between
 *  their time slots, while panels remain on their respective slots to preserve
 *  the interviewer group dynamic. */
const CandidateSwapChip = ({
  item,
  scheduleIndex,
  targets,
  formatTimeLabel,
  onSwap,
  conflict,
  twoStep = false,
}: CandidateSwapChipProps) => {
  const [twoStepOpen, setTwoStepOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  if (twoStep) {
    return (
      <>
        <button
          ref={setAnchorEl}
          type="button"
          title="Bytt plass med en annen kandidat (foreslår automatisk konfliktfrie bytter)"
          aria-haspopup="dialog"
          aria-expanded={twoStepOpen}
          onClick={() => setTwoStepOpen((prev) => !prev)}
          className="cursor-pointer truncate rounded-md text-left text-sm font-semibold text-text-primary underline-offset-2 hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          {item.candidate}
        </button>
        {twoStepOpen && (
          <TwoStepSwapMenu
            anchor={anchorEl}
            sourceName={item.candidate}
            targets={targets}
            formatTimeLabel={formatTimeLabel}
            searchPlaceholder="Søk kandidat…"
            emptyLabel="Ingen treff på søket"
            onClose={() => setTwoStepOpen(false)}
            onPickTarget={(targetScheduleIndex) => {
              setTwoStepOpen(false);
              onSwap(scheduleIndex, targetScheduleIndex);
            }}
          />
        )}
      </>
    );
  }

  return (
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
};

export default CandidateSwapChip;
