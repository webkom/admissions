import React, { useEffect, useRef } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

import { useFocusTrap } from "../ConfirmDialog";
import {
  actionButtonBase,
  actionButtonNeutral,
  keyboardFocusRingClass,
} from "../ui";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

export interface PlanHealthModalEntry {
  key: string;
  scheduleIndex: number;
  candidateName: string;
  time: number;
  /** What is wrong, without the fix, e.g. "Ida står utenfor
   *  tilgjengeligheten sin". */
  problem: string;
  offenderName: string;
  offenderId?: string;
  offenderPanelIndex: number;
  suggestion?: { replacementId: string; replacementName: string } | null;
}

interface PlanHealthModalProps {
  title: string;
  intro: string;
  entries: PlanHealthModalEntry[];
  formatTime: (time: number) => string;
  onApplySubstitution: (entry: PlanHealthModalEntry) => void;
  onEditRow: (scheduleIndex: number) => void;
  onClose: () => void;
}

/** Quick-fix surface for the health-summary exceptions. Each affected
 *  interview lists what is wrong and offers one concrete fix: a suggested
 *  substitution when a valid replacement exists, otherwise a jump into the
 *  row's edit mode. */
const PlanHealthModal = ({
  title,
  intro,
  entries,
  formatTime,
  onApplySubstitution,
  onEditRow,
  onClose,
}: PlanHealthModalProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const titleId = "plan-health-modal-title";

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-overlay px-4 py-4 animate-overlay-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-cy="plan-health-modal"
        className="max-h-modal w-full max-w-lg overflow-y-auto rounded-panel border border-border bg-surface-base p-5 shadow-modal focus:outline-none animate-fade-in"
      >
        <h4 id={titleId} className="m-0 text-base font-bold text-text-primary">
          {title}
        </h4>
        <p className="m-0 mt-2 text-ui text-text-muted">{intro}</p>
        <ul className="m-0 mt-4 divide-y divide-border-soft p-0">
          {entries.length === 0 && (
            <li className="py-3 text-ui font-semibold text-success">
              Alt er ordnet opp i.
            </li>
          )}
          {entries.map((entry) => (
            <li
              key={entry.key}
              data-cy="plan-health-entry"
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="m-0 text-ui font-semibold text-text-primary">
                  {entry.candidateName} — {formatTime(entry.time)}
                </p>
                <p className="m-0 mt-1 text-detail text-text-muted">
                  {entry.problem}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {entry.suggestion && (
                  <button
                    type="button"
                    onClick={() => onApplySubstitution(entry)}
                    data-cy="plan-health-apply-fix"
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    <RefreshCw size={iconSizes.small} aria-hidden="true" />
                    Bytt {entry.offenderName} til{" "}
                    {entry.suggestion.replacementName}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEditRow(entry.scheduleIndex)}
                  className={`font-semibold text-brand hover:underline ${keyboardFocusRingClass}`}
                >
                  Åpne i redigering
                  <ArrowRight
                    size={iconSizes.tiny}
                    aria-hidden="true"
                    className="ml-1 inline"
                  />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`text-sm font-semibold text-text-muted hover:text-text-primary ${keyboardFocusRingClass}`}
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanHealthModal;
