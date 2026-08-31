import React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { addDays, dateRangeDates } from "../scheduleUtils";
import { SchedulingButton } from "../ui";
import {
  calendarDaysForMonth,
  formatAccessibleCalendarDate,
  formatCalendarMonth,
  moveCalendarDateByMonth,
  moveMonth,
  parseIsoDate,
  startOfMonth,
  toIsoDate,
} from "./calendarDateUtils";

type SelectionPhase = "start" | "end" | "complete";

interface InterviewPeriodPickerProps {
  startDate: string;
  endDate: string;
  maxDays: number;
  invalid?: boolean;
  describedBy?: string;
  onChangeStartDate: (value: string) => void;
  onChangeEndDate: (value: string) => void;
}

const WEEKDAY_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];
const compactViewportQuery =
  "(max-width: 39.9375rem), (max-height: 34.9375rem)";

const formatTriggerDate = (value: string, includeYear: boolean) => {
  const date = parseIsoDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: includeYear ? "numeric" : undefined,
  }).format(date);
};

const formatRange = (startDate: string, endDate: string) => {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return `${startDate} – ${endDate}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${formatTriggerDate(startDate, !sameYear)} – ${formatTriggerDate(
    endDate,
    true,
  )}`;
};

const InterviewPeriodPicker: React.FC<InterviewPeriodPickerProps> = ({
  startDate,
  endDate,
  maxDays,
  invalid = false,
  describedBy,
  onChangeStartDate,
  onChangeEndDate,
}) => {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const pendingFocusFrameRef = React.useRef<number | null>(null);
  const titleId = React.useId();
  const hintId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isCompact, setIsCompact] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(compactViewportQuery).matches,
  );
  const [displayedMonth, setDisplayedMonth] = React.useState(() =>
    startOfMonth(parseIsoDate(startDate) ?? new Date()),
  );
  const [focusedDate, setFocusedDate] = React.useState(startDate);
  const [draftStartDate, setDraftStartDate] = React.useState(startDate);
  const [draftEndDate, setDraftEndDate] = React.useState<string | null>(
    endDate,
  );
  const [selectionPhase, setSelectionPhase] =
    React.useState<SelectionPhase>("start");
  const [hoveredDate, setHoveredDate] = React.useState<string | null>(null);
  const [dialogStyle, setDialogStyle] = React.useState<React.CSSProperties>({});

  const committedDayCount = dateRangeDates(startDate, endDate, maxDays).length;
  const draftDayCount = draftEndDate
    ? dateRangeDates(draftStartDate, draftEndDate, maxDays).length
    : 0;
  const maximumEndDate = draftStartDate
    ? addDays(draftStartDate, maxDays - 1)
    : null;
  const previewEndDate =
    selectionPhase === "end" &&
    hoveredDate &&
    hoveredDate >= draftStartDate &&
    (!maximumEndDate || hoveredDate <= maximumEndDate)
      ? hoveredDate
      : draftEndDate;
  const days = React.useMemo(
    () => calendarDaysForMonth(displayedMonth),
    [displayedMonth],
  );
  const nextDisplayedMonth = moveMonth(displayedMonth, 1);
  const nextMonthUnavailable =
    selectionPhase === "end" &&
    Boolean(maximumEndDate) &&
    toIsoDate(nextDisplayedMonth) > (maximumEndDate ?? "");

  const closeAndRestoreFocus = React.useCallback(() => {
    setIsOpen(false);
    // Focused synchronously rather than a frame later. The trigger is always
    // mounted - only the dialog goes away - so there is nothing to wait for,
    // and setIsOpen is batched, so this still runs before the dialog is
    // unmounted from under the focused element. Deferring it meant that on a
    // loaded machine the focus() could land long after the dialog closed, by
    // which point the user may have moved on to another field: it would then
    // yank focus out of whatever they were editing. That is how it broke the
    // daily-time inputs - focus jumped back to this trigger mid-edit, the
    // emptied hour field took a blur, and TimeSegmentField's blur handler
    // restored the previous value over the top of what was being typed.
    triggerRef.current?.focus();
  }, []);

  const updateDialogLayout = React.useCallback(() => {
    const compact = window.matchMedia(compactViewportQuery).matches;
    setIsCompact(compact);
    if (compact) {
      setDialogStyle({});
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(430, window.innerWidth - viewportPadding * 2);
    const estimatedHeight = 500;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const openAbove =
      availableBelow < estimatedHeight && rect.top > availableBelow;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - width - viewportPadding),
    );

    setDialogStyle({
      left,
      width,
      top: openAbove ? undefined : rect.bottom + 8,
      bottom: openAbove ? window.innerHeight - rect.top + 8 : undefined,
      maxHeight: Math.max(
        0,
        Math.min(
          estimatedHeight,
          openAbove ? rect.top - viewportPadding : availableBelow,
        ),
      ),
    });
  }, []);

  const openPicker = () => {
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setSelectionPhase("start");
    setHoveredDate(null);
    setDisplayedMonth(startOfMonth(parseIsoDate(startDate) ?? new Date()));
    setFocusedDate(startDate);
    setIsOpen(true);
  };

  React.useLayoutEffect(() => {
    if (!isOpen) return undefined;
    updateDialogLayout();
    const frame = requestAnimationFrame(() => {
      const shortViewport = window.innerHeight < 560;
      const focusTarget = shortViewport
        ? dialogRef.current?.querySelector<HTMLButtonElement>(
            'button[aria-label="Forrige måned"]',
          )
        : dialogRef.current?.querySelector<HTMLButtonElement>(
            `[data-calendar-date="${startDate}"]`,
          );
      focusTarget?.focus();
    });
    const handleViewportChange = () => updateDialogLayout();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, startDate, updateDialogLayout]);

  React.useEffect(() => {
    if (!isOpen || !isCompact) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCompact, isOpen]);

  React.useEffect(
    () => () => {
      if (pendingFocusFrameRef.current !== null) {
        cancelAnimationFrame(pendingFocusFrameRef.current);
      }
    },
    [],
  );

  const selectDate = (isoDate: string) => {
    if (selectionPhase !== "end" || !draftStartDate) {
      setDraftStartDate(isoDate);
      setDraftEndDate(null);
      setSelectionPhase("end");
      setHoveredDate(null);
      setFocusedDate(isoDate);
      return;
    }

    if (isoDate < draftStartDate) {
      setDraftStartDate(isoDate);
      setDraftEndDate(null);
      setHoveredDate(null);
      setFocusedDate(isoDate);
      return;
    }
    if (maximumEndDate && isoDate > maximumEndDate) return;

    setDraftEndDate(isoDate);
    setSelectionPhase("complete");
    setHoveredDate(null);
    setFocusedDate(isoDate);
  };

  const applyRange = () => {
    if (!draftStartDate || !draftEndDate) return;
    onChangeStartDate(draftStartDate);
    onChangeEndDate(draftEndDate);
    closeAndRestoreFocus();
  };

  const focusDate = React.useCallback(
    (date: Date) => {
      const requestedDate = toIsoDate(date);
      const isoDate =
        selectionPhase === "end" &&
        maximumEndDate &&
        requestedDate > maximumEndDate
          ? maximumEndDate
          : requestedDate;
      const nextDate = parseIsoDate(isoDate) ?? date;
      setDisplayedMonth(startOfMonth(nextDate));
      setFocusedDate(isoDate);
      if (pendingFocusFrameRef.current !== null) {
        cancelAnimationFrame(pendingFocusFrameRef.current);
        pendingFocusFrameRef.current = null;
      }
      // Same-month navigation (the common case) targets a button that
      // already exists, so focus it immediately - it doesn't need the
      // grid to re-render first, and staying synchronous means rapid
      // keypresses (arrow-key repeat, or a throttled rAF under load)
      // can't land on a stale element because a still-pending focus
      // move hasn't happened yet. Only crossing a month boundary needs
      // the deferred rAF, since that button doesn't exist until the new
      // month's grid commits.
      const existingTarget =
        dialogRef.current?.querySelector<HTMLButtonElement>(
          `[data-calendar-date="${isoDate}"]`,
        );
      if (existingTarget) {
        existingTarget.focus();
        return;
      }
      pendingFocusFrameRef.current = requestAnimationFrame(() => {
        pendingFocusFrameRef.current = null;
        dialogRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-calendar-date="${isoDate}"]`,
          )
          ?.focus();
      });
    },
    [maximumEndDate, selectionPhase],
  );

  const handleDayKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    date: Date,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDate(toIsoDate(date));
      return;
    }
    const offsets: Partial<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const offset = offsets[event.key];
    if (offset !== undefined) {
      event.preventDefault();
      const next = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + offset,
      );
      focusDate(next);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const mondayIndex = (date.getDay() + 6) % 7;
      const offsetToEdge =
        event.key === "Home" ? -mondayIndex : 6 - mondayIndex;
      focusDate(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + offsetToEdge,
        ),
      );
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      focusDate(moveCalendarDateByMonth(date, event.key === "PageUp" ? -1 : 1));
    }
  };

  const handleMonthNavigationKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    month: Date,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    focusDate(month);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute("aria-hidden"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const statusText =
    selectionPhase === "start"
      ? "Velg ny startdato"
      : selectionPhase === "end"
        ? `Velg sluttdato, senest ${formatTriggerDate(
            maximumEndDate ?? "",
            true,
          )}`
        : draftDayCount === 1
          ? "Én intervjudag valgt"
          : `${draftDayCount} kalenderdager valgt`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-cy="interview-period-trigger"
        data-start-date={startDate}
        data-end-date={endDate}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onClick={openPicker}
        className={cn(
          // border-solid is explicit: lego-bricks resets `button { border: none }`,
          // and a width-only utility renders nothing against border-style: none.
          "group flex min-h-control-md w-full min-w-0 items-center gap-3 rounded-md border border-solid bg-surface-base px-3.5 py-2.5 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-brand-strongBorder hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
          invalid ? "border-danger" : "border-border-soft",
        )}
      >
        <span className="flex flex-none items-center justify-center text-brand">
          <CalendarDays size={iconSizes.standard} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-tiny font-medium text-text-subtle">
            Intervjuperiode
          </span>
          <span className="mt-0.5 block truncate text-ui font-bold text-text-primary">
            {formatRange(startDate, endDate)}
          </span>
        </span>
        {committedDayCount > 0 && (
          <span className="ml-2 flex-none rounded-full bg-brand-soft px-2.5 py-1 text-detail font-semibold tabular-nums text-brand-dark">
            {committedDayCount} {committedDayCount === 1 ? "dag" : "dager"}
          </span>
        )}
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[var(--modal-layer)]",
              isCompact ? "bg-overlay backdrop-blur-sm" : "bg-transparent",
            )}
            onPointerDown={closeAndRestoreFocus}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={hintId}
              data-cy="interview-period-dialog"
              className={cn(
                "fixed flex min-h-0 flex-col overflow-hidden border border-border bg-surface-base shadow-xl",
                isCompact
                  ? "inset-x-2 bottom-2 max-h-[calc(100dvh-1rem)] rounded-xl"
                  : "rounded-lg",
              )}
              style={dialogStyle}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={handleDialogKeyDown}
            >
              <header className="border-b border-border-soft px-4 pb-3 pt-4">
                <p className="m-0 text-label font-bold uppercase tracking-wide text-brand">
                  Intervjuperiode
                </p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3
                      id={titleId}
                      className="m-0 text-title font-semibold text-text-primary"
                    >
                      Velg start- og sluttdato
                    </h3>
                    <p
                      id={hintId}
                      className="m-0 mt-1 text-detail text-text-muted"
                    >
                      Perioden kan være opptil {maxDays} kalenderdager.
                    </p>
                  </div>
                  <span
                    data-cy="interview-period-status"
                    aria-live="polite"
                    className="max-w-[12rem] rounded-md bg-surface-muted px-2 py-1 text-right text-detail font-semibold text-text-muted"
                  >
                    {statusText}
                  </span>
                </div>
              </header>

              <div className="min-h-0 overflow-y-auto p-3">
                <div className="sticky top-0 z-20 -mx-1 mb-2 flex items-center justify-between bg-surface-base px-1 pb-1">
                  <button
                    type="button"
                    aria-label="Forrige måned"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    onClick={() => focusDate(moveMonth(displayedMonth, -1))}
                    onKeyDown={(event) =>
                      handleMonthNavigationKeyDown(
                        event,
                        moveMonth(displayedMonth, -1),
                      )
                    }
                  >
                    <ChevronLeft size={iconSizes.standard} aria-hidden="true" />
                  </button>
                  <h4 className="m-0 capitalize text-ui font-bold text-text-primary">
                    {formatCalendarMonth(displayedMonth)}
                  </h4>
                  <button
                    type="button"
                    aria-label="Neste måned"
                    disabled={nextMonthUnavailable}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    onClick={() => focusDate(nextDisplayedMonth)}
                    onKeyDown={(event) =>
                      handleMonthNavigationKeyDown(event, nextDisplayedMonth)
                    }
                  >
                    <ChevronRight
                      size={iconSizes.standard}
                      aria-hidden="true"
                    />
                  </button>
                </div>

                <div
                  role="grid"
                  aria-label={`Kalender for ${formatCalendarMonth(
                    displayedMonth,
                  )}`}
                  className="grid grid-cols-7"
                >
                  {WEEKDAY_LABELS.map((weekday) => (
                    <div
                      key={weekday}
                      role="columnheader"
                      className="sticky top-10 z-10 flex h-7 items-center justify-center bg-surface-base text-tiny font-bold uppercase tracking-wide text-text-subtle"
                    >
                      {weekday}
                    </div>
                  ))}
                  {days.map(({ date, isoDate, isCurrentMonth }) => {
                    const isMaximumExceeded =
                      selectionPhase === "end" &&
                      Boolean(maximumEndDate) &&
                      isoDate > (maximumEndDate ?? "");
                    const isStart = isoDate === draftStartDate;
                    const isEnd = isoDate === previewEndDate;
                    const isInsideRange =
                      Boolean(draftStartDate && previewEndDate) &&
                      isoDate > draftStartDate &&
                      isoDate < (previewEndDate ?? "");
                    const isSelected = isStart || isEnd || isInsideRange;
                    const isToday = isoDate === toIsoDate(new Date());

                    return (
                      <div
                        key={isoDate}
                        role="gridcell"
                        aria-selected={isSelected}
                        className={cn(
                          "relative flex h-10 items-center justify-center",
                          isInsideRange && "bg-brand-soft",
                          isStart &&
                            previewEndDate &&
                            previewEndDate !== draftStartDate &&
                            "rounded-l-full bg-brand-soft",
                          isEnd &&
                            draftStartDate !== previewEndDate &&
                            "rounded-r-full bg-brand-soft",
                        )}
                      >
                        <button
                          type="button"
                          data-calendar-date={isoDate}
                          aria-label={formatAccessibleCalendarDate(date)}
                          aria-current={isToday ? "date" : undefined}
                          disabled={isMaximumExceeded}
                          tabIndex={isoDate === focusedDate ? 0 : -1}
                          onClick={() => {
                            selectDate(isoDate);
                            if (!isCurrentMonth) {
                              setDisplayedMonth(startOfMonth(date));
                            }
                          }}
                          onMouseEnter={() => {
                            if (selectionPhase === "end") {
                              setHoveredDate(isoDate);
                            }
                          }}
                          onMouseLeave={() => setHoveredDate(null)}
                          onKeyDown={(event) => handleDayKeyDown(event, date)}
                          className={cn(
                            "relative z-10 flex h-9 w-9 scroll-mt-20 items-center justify-center rounded-full text-detail font-semibold tabular-nums transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus motion-reduce:transition-none",
                            isCurrentMonth
                              ? "text-text-primary"
                              : "text-text-disabled",
                            !isSelected &&
                              !isMaximumExceeded &&
                              "hover:-translate-y-px hover:bg-surface-muted",
                            (isStart || isEnd) &&
                              "bg-brand text-white shadow-sm hover:bg-brand-hover",
                            isMaximumExceeded &&
                              "cursor-not-allowed text-text-disabled opacity-35",
                          )}
                        >
                          {date.getDate()}
                          {isToday && !isStart && !isEnd && (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-1 h-1 w-1 rounded-full bg-brand"
                            />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft bg-surface-muted px-4 py-3">
                <button
                  type="button"
                  className="rounded-sm text-detail font-semibold text-text-muted underline-offset-2 hover:text-text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus"
                  onClick={() => {
                    const today = toIsoDate(new Date());
                    setDraftStartDate(today);
                    setDraftEndDate(null);
                    setSelectionPhase("end");
                    setDisplayedMonth(startOfMonth(new Date()));
                    setFocusedDate(today);
                  }}
                >
                  Start i dag
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <SchedulingButton
                    variant="quiet"
                    onClick={closeAndRestoreFocus}
                  >
                    Avbryt
                  </SchedulingButton>
                  <SchedulingButton
                    variant="primary"
                    data-cy="apply-interview-period"
                    disabled={!draftStartDate || !draftEndDate}
                    onClick={applyRange}
                  >
                    Bruk periode
                  </SchedulingButton>
                </div>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default InterviewPeriodPicker;
