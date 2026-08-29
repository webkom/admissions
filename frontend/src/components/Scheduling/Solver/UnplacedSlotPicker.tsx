import React, { useEffect, useMemo, useRef } from "react";
import { useFocusTrap } from "../ConfirmDialog";
import { keyboardFocusRingClass } from "../ui";
import { formatSlotLabel } from "../scheduleUtils";
import type { Interviewer } from "../../../types";

export interface UnplacedSlotOption {
  time: number;
  status: "available" | "overtime" | "unavailable";
  /** Interviewers who are both non-biased against the candidate AND
   *  available for the slot. Drives the green dot. */
  availableInterviewerNames: string[];
  /** Interviewers who are non-biased but did not list the slot. Drives
   *  the amber dot (panel possible via overtime). */
  overtimeInterviewerNames: string[];
}

interface UnplacedSlotPickerProps {
  candidateName: string;
  candidateReason?: string;
  panelSize: number;
  options: UnplacedSlotOption[];
  dates: string[];
  sessionDuration: number;
  loading?: boolean;
  onPick: (time: number) => void;
  onClose: () => void;
}

const dotClass: Record<UnplacedSlotOption["status"], string> = {
  available: "bg-success",
  overtime: "bg-amber-500",
  unavailable: "bg-danger",
};

const dotLabel: Record<UnplacedSlotOption["status"], string> = {
  available: "Ledig panel",
  overtime: "Krever overtid",
  unavailable: "Ingen panel ledig",
};

const UnplacedSlotPicker = ({
  candidateName,
  candidateReason,
  panelSize,
  options,
  dates,
  sessionDuration,
  loading = false,
  onPick,
  onClose,
}: UnplacedSlotPickerProps) => {
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

  const groupedByDay = useMemo(() => {
    const groups = new Map<number, UnplacedSlotOption[]>();
    options.forEach((option) => {
      const dayIndex = Math.floor(option.time / (24 * 60));
      const list = groups.get(dayIndex) ?? [];
      list.push(option);
      groups.set(dayIndex, list);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a - b);
  }, [options]);

  const titleId = "unplaced-slot-picker-title";

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
        className="max-h-modal w-full max-w-lg overflow-y-auto rounded-panel border border-border bg-surface-base p-5 shadow-modal focus:outline-none animate-fade-in"
      >
        <h4 id={titleId} className="m-0 text-base font-bold text-text-primary">
          Plasser {candidateName}
        </h4>
        <p className="m-0 mt-2 text-ui text-text-muted">
          Velg en ledig tidsluke. Grønn = hele panelet ({panelSize}) er
          tilgjengelig. Gul = noen i panelet må ta overtid. Rød = ingen mulig
          panel.
        </p>
        {candidateReason && (
          <p className="m-0 mt-2 text-detail text-text-muted">
            Årsak: {candidateReason}
          </p>
        )}
        <div className="mt-4 space-y-4">
          {groupedByDay.length === 0 && (
            <p className="m-0 text-ui text-text-muted">
              Ingen åpne tidsluker i planen. Legg til flere dager eller åpne
              flere luker.
            </p>
          )}
          {groupedByDay.map(([dayIndex, dayOptions]) => {
            const dayDate = dates[dayIndex];
            const dayLabel = dayDate
              ? new Intl.DateTimeFormat("nb-NO", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(dayDate))
              : `Dag ${dayIndex + 1}`;
            return (
              <section key={dayIndex}>
                <h5 className="m-0 mb-2 text-detail font-bold uppercase tracking-wide text-text-subtle">
                  {dayLabel}
                </h5>
                <ul className="m-0 grid gap-2 p-0">
                  {dayOptions.map((option) => {
                    const disabled = option.status === "unavailable" || loading;
                    return (
                      <li key={option.time} className="list-none">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onPick(option.time)}
                          data-cy="unplaced-slot-option"
                          data-status={option.status}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border border-border-soft bg-surface-base px-3 py-2 text-left transition-colors hover:border-border-quiet hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-60 ${keyboardFocusRingClass}`}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              title={dotLabel[option.status]}
                              className={`inline-block h-2.5 w-2.5 flex-none rounded-full ${dotClass[option.status]}`}
                            />
                            <span className="text-ui font-semibold text-text-primary">
                              {formatSlotLabel(
                                option.time,
                                dates,
                                sessionDuration,
                              )}
                            </span>
                          </span>
                          <span className="text-detail text-text-muted">
                            {dotLabel[option.status]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`text-sm font-semibold text-text-muted hover:text-text-primary ${keyboardFocusRingClass}`}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Build the slot options for the picker from the same enabled slots the
 * editor uses, with a per-slot availability pre-check that mirrors the
 * greedy panel pick in `useScheduleDraft.assignUnplacedCandidate`.
 */
export const buildUnplacedSlotOptions = ({
  enabledTimeOptions,
  occupiedTimes,
  candidateId,
  candidateName,
  panelSize,
  interviewers,
  candidates,
}: {
  enabledTimeOptions: number[];
  occupiedTimes: Set<number>;
  candidateId?: string;
  candidateName: string;
  panelSize: number;
  interviewers: Interviewer[];
  candidates: { id: string; name: string; user_id?: string }[];
}): UnplacedSlotOption[] => {
  const candidate = candidates.find(
    (entry) =>
      (candidateId && entry.id === candidateId) || entry.name === candidateName,
  );
  const candidateUserId = candidate?.user_id;
  return enabledTimeOptions
    .filter((time) => !occupiedTimes.has(time))
    .map((time) => {
      const availableInterviewerNames: string[] = [];
      const overtimeInterviewerNames: string[] = [];
      interviewers.forEach((interviewer) => {
        if (candidateId && interviewer.biased.includes(candidateId)) {
          return;
        }
        if (candidateUserId && interviewer.id === candidateUserId) {
          return;
        }
        if (interviewer.availability.includes(time)) {
          availableInterviewerNames.push(interviewer.name);
        } else {
          overtimeInterviewerNames.push(interviewer.name);
        }
      });
      const status: UnplacedSlotOption["status"] =
        availableInterviewerNames.length >= panelSize
          ? "available"
          : availableInterviewerNames.length +
                overtimeInterviewerNames.length >=
              panelSize
            ? "overtime"
            : "unavailable";
      return {
        time,
        status,
        availableInterviewerNames,
        overtimeInterviewerNames,
      };
    });
};

export default UnplacedSlotPicker;
