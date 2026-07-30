import React from "react";
import { CalendarDays } from "lucide-react";
import { CalendarMonthGrid } from "src/components/ui/Calendar/CalendarMonthGrid";
import { CalendarPopoverDialog } from "src/components/ui/Calendar/CalendarPopoverDialog";
import {
  calendarDaysForMonth,
  moveMonth,
  osloTodayDate,
  osloTodayIsoDate,
  parseIsoDate,
  startOfMonth,
  toIsoDate,
  useAnchoredCalendarPopover,
} from "src/components/ui/Calendar";
import type { CalendarPopoverLayoutContext } from "src/components/ui/Calendar";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { addDays, dateRangeDates } from "../scheduleUtils";
import { SchedulingButton } from "../ui";

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

const compactViewportQuery =
  "(max-width: 39.9375rem), (max-height: 34.9375rem)";

const isShortInterviewPeriodViewport = () => window.innerHeight < 560;

const calculateInterviewPeriodDialogLayout = ({
  isCompact,
  triggerRect,
  viewportHeight,
  viewportWidth,
}: CalendarPopoverLayoutContext): React.CSSProperties => {
  if (isCompact || !triggerRect) return {};

  const viewportPadding = 12;
  const width = Math.min(430, viewportWidth - viewportPadding * 2);
  const estimatedHeight = 500;
  const availableBelow = viewportHeight - triggerRect.bottom - viewportPadding;
  const openAbove =
    availableBelow < estimatedHeight && triggerRect.top > availableBelow;
  const left = Math.max(
    viewportPadding,
    Math.min(triggerRect.left, viewportWidth - width - viewportPadding),
  );

  return {
    left,
    width,
    top: openAbove ? undefined : triggerRect.bottom + 8,
    bottom: openAbove ? viewportHeight - triggerRect.top + 8 : undefined,
    maxHeight: Math.max(
      0,
      Math.min(
        estimatedHeight,
        openAbove ? triggerRect.top - viewportPadding : availableBelow,
      ),
    ),
  };
};

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
  const titleId = React.useId();
  const hintId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [displayedMonth, setDisplayedMonth] = React.useState(() =>
    startOfMonth(parseIsoDate(startDate) ?? osloTodayDate()),
  );
  const [focusedDate, setFocusedDate] = React.useState(startDate);
  const [draftStartDate, setDraftStartDate] = React.useState(startDate);
  const [draftEndDate, setDraftEndDate] = React.useState<string | null>(
    endDate,
  );
  const [selectionPhase, setSelectionPhase] =
    React.useState<SelectionPhase>("start");
  const [hoveredDate, setHoveredDate] = React.useState<string | null>(null);

  const initialFocus = React.useCallback(
    (
      dialog: HTMLDivElement,
      { isShort }: { isShort: boolean },
    ): HTMLElement | null =>
      isShort
        ? dialog.querySelector<HTMLButtonElement>(
            'button[aria-label="Forrige måned"]',
          )
        : dialog.querySelector<HTMLButtonElement>(
            `[data-calendar-date="${startDate}"]`,
          ),
    [startDate],
  );
  const closePicker = React.useCallback(() => setIsOpen(false), []);
  const { closeAndRestoreFocus, dialogRef, dialogStyle, isCompact } =
    useAnchoredCalendarPopover({
      isOpen,
      triggerRef,
      compactViewportQuery,
      isShortViewport: isShortInterviewPeriodViewport,
      calculateLayout: calculateInterviewPeriodDialogLayout,
      initialFocus,
      onClose: closePicker,
    });

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

  const openPicker = () => {
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setSelectionPhase("start");
    setHoveredDate(null);
    setDisplayedMonth(startOfMonth(parseIsoDate(startDate) ?? osloTodayDate()));
    setFocusedDate(startDate);
    setIsOpen(true);
  };

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
      requestAnimationFrame(() => {
        dialogRef.current
          ?.querySelector<HTMLButtonElement>(
            `[data-calendar-date="${isoDate}"]`,
          )
          ?.focus();
      });
      return isoDate;
    },
    [maximumEndDate, selectionPhase],
  );

  const handleMonthNavigationKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    month: Date,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    focusDate(month);
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
          "group flex min-h-control-md w-full min-w-0 items-center gap-3 rounded-md border bg-surface-base px-3 py-2 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-brand-strongBorder hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
          invalid ? "border-danger" : "border-border-soft",
        )}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-brand-soft text-brand transition-colors group-hover:bg-brand-tint">
          <CalendarDays size={iconSizes.standard} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-tiny font-medium text-text-subtle">
            Fra og med – til og med
          </span>
          <span className="mt-0.5 block truncate text-sm font-bold text-text-primary">
            {formatRange(startDate, endDate)}
          </span>
        </span>
        {committedDayCount > 0 && (
          <span className="flex-none rounded-full border border-brand-border bg-brand-soft px-2 py-1 text-detail font-semibold tabular-nums text-brand-dark">
            {committedDayCount} {committedDayCount === 1 ? "dag" : "dager"}
          </span>
        )}
      </button>

      <CalendarPopoverDialog
        open={isOpen}
        dialogRef={dialogRef}
        isCompact={isCompact}
        dialogStyle={dialogStyle}
        titleId={titleId}
        describedById={hintId}
        dataCy="interview-period-dialog"
        className="fixed flex min-h-0 flex-col overflow-hidden border border-border bg-surface-base shadow-xl"
        compactClassName="inset-x-2 bottom-2 max-h-[calc(100dvh-1rem)] rounded-xl"
        onRequestClose={closeAndRestoreFocus}
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
              <p id={hintId} className="m-0 mt-1 text-detail text-text-muted">
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
          <CalendarMonthGrid
            displayedMonth={displayedMonth}
            days={days}
            focusedDate={focusedDate}
            today={osloTodayIsoDate()}
            nextMonthDisabled={nextMonthUnavailable}
            onPreviousMonth={() => focusDate(moveMonth(displayedMonth, -1))}
            onNextMonth={() => focusDate(nextDisplayedMonth)}
            onFocusDate={focusDate}
            onSelectDate={({ isoDate, date, isCurrentMonth }) => {
              selectDate(isoDate);
              if (!isCurrentMonth) setDisplayedMonth(startOfMonth(date));
            }}
            headerClassName="sticky top-0 z-20 -mx-1 mb-2 flex items-center justify-between bg-surface-base px-1 pb-1"
            navigationButtonClassName="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            monthLabelClassName="m-0 capitalize text-ui font-bold text-text-primary"
            monthLabelElement="h4"
            weekdayClassName="sticky top-10 z-10 flex h-7 items-center justify-center bg-surface-base text-tiny font-bold uppercase tracking-wide text-text-subtle"
            getCellClassName={({ isoDate }) => {
              const isStart = isoDate === draftStartDate;
              const isEnd = isoDate === previewEndDate;
              const isInsideRange =
                Boolean(draftStartDate && previewEndDate) &&
                isoDate > draftStartDate &&
                isoDate < (previewEndDate ?? "");
              return cn(
                "relative flex h-10 items-center justify-center",
                isInsideRange && "bg-brand-soft",
                isStart &&
                  previewEndDate &&
                  previewEndDate !== draftStartDate &&
                  "rounded-l-full bg-brand-soft",
                isEnd &&
                  draftStartDate !== previewEndDate &&
                  "rounded-r-full bg-brand-soft",
              );
            }}
            isDaySelected={({ isoDate }) =>
              isoDate === draftStartDate ||
              isoDate === previewEndDate ||
              (Boolean(draftStartDate && previewEndDate) &&
                isoDate > draftStartDate &&
                isoDate < (previewEndDate ?? ""))
            }
            renderDay={(
              { date, isoDate, isCurrentMonth },
              { ariaLabel, isToday, onKeyDown, onSelect, tabIndex },
            ) => {
              const isMaximumExceeded =
                selectionPhase === "end" &&
                Boolean(maximumEndDate) &&
                isoDate > (maximumEndDate ?? "");
              const isStart = isoDate === draftStartDate;
              const isEnd = isoDate === previewEndDate;
              const isSelected = isStart || isEnd;
              return (
                <button
                  type="button"
                  data-calendar-date={isoDate}
                  aria-label={ariaLabel}
                  aria-current={isToday ? "date" : undefined}
                  disabled={isMaximumExceeded}
                  tabIndex={tabIndex}
                  onClick={onSelect}
                  onMouseEnter={() => {
                    if (selectionPhase === "end") setHoveredDate(isoDate);
                  }}
                  onMouseLeave={() => setHoveredDate(null)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "relative z-10 flex h-9 w-9 scroll-mt-20 items-center justify-center rounded-full text-detail font-semibold tabular-nums transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus motion-reduce:transition-none",
                    isCurrentMonth ? "text-text-primary" : "text-text-disabled",
                    !isSelected &&
                      !isMaximumExceeded &&
                      "hover:-translate-y-px hover:bg-surface-muted",
                    isSelected &&
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
              );
            }}
            onMonthNavigationKeyDown={handleMonthNavigationKeyDown}
          />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft bg-surface-muted px-4 py-3">
          <button
            type="button"
            className="rounded-sm text-detail font-semibold text-text-muted underline-offset-2 hover:text-text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus"
            onClick={() => {
              const today = osloTodayIsoDate();
              setDraftStartDate(today);
              setDraftEndDate(null);
              setSelectionPhase("end");
              setDisplayedMonth(startOfMonth(osloTodayDate()));
              setFocusedDate(today);
            }}
          >
            Start i dag
          </button>
          <div className="ml-auto flex items-center gap-2">
            <SchedulingButton variant="quiet" onClick={closeAndRestoreFocus}>
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
      </CalendarPopoverDialog>
    </>
  );
};

export default InterviewPeriodPicker;
