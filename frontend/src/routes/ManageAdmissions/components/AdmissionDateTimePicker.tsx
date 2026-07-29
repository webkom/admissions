import React from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

import { CalendarMonthGrid } from "src/components/ui/Calendar/CalendarMonthGrid";
import { CalendarPopoverDialog } from "src/components/ui/Calendar/CalendarPopoverDialog";
import {
  calendarDaysForMonth,
  moveMonth,
  osloTodayIsoDate,
  parseIsoDate,
  startOfMonth,
  toIsoDate,
  useAnchoredCalendarPopover,
} from "src/components/ui/Calendar";
import type { CalendarPopoverLayoutContext } from "src/components/ui/Calendar";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

import { getAdmissionDateTimeIssue } from "../admissionDateDefaults";

interface AdmissionDateTimePickerProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  min?: string;
  minExclusive?: boolean;
  invalid?: boolean;
  error?: string;
  describedBy?: string;
  onBlur: () => void;
  onChange: (value: string) => void;
}

interface DateTimeParts {
  date: string;
  time: string;
}

type CalendarPopoverSide = "above" | "below";

const compactViewportQuery = "(max-width: 39.9375rem)";
const desktopCalendarMaxHeight = 390;
const isShortAdmissionDateTimeViewport = () => window.innerHeight < 400;

const splitDateTime = (value: string): DateTimeParts | null => {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (!parseIsoDate(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return { date, time };
};

const candidateDateTime = (date: string, time: string) => `${date}T${time}:00`;

const selectTimeSegment = (
  input: HTMLInputElement,
  position: number | null,
) => {
  if (input.value.length !== 5) {
    input.select();
    return;
  }
  if ((position ?? 0) <= 2) input.setSelectionRange(0, 2);
  else input.setSelectionRange(3, 5);
};

const formatDate = (value: string): string => {
  const date = parseIsoDate(value);
  if (!date) return "Ikke valgt";
  const today = osloTodayIsoDate();
  const formatted = new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return value === today ? `I dag, ${formatted}` : formatted;
};

const normalizeAdmissionTime = (value: string): string | null => {
  const compact = value.trim().replace(/\s/g, "");
  let hour: number;
  let minute: number;

  const colonMatch = compact.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colonMatch) {
    hour = Number(colonMatch[1]);
    minute = Number(colonMatch[2]);
  } else if (/^\d{1,2}$/.test(compact)) {
    hour = Number(compact);
    minute = 0;
  } else if (/^\d{3}$/.test(compact)) {
    hour = Number(compact.slice(0, 1));
    minute = Number(compact.slice(1));
  } else if (/^\d{4}$/.test(compact)) {
    hour = Number(compact.slice(0, 2));
    minute = Number(compact.slice(2));
  } else {
    return null;
  }

  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const AdmissionDateTimePicker: React.FC<AdmissionDateTimePickerProps> = ({
  id,
  label,
  value,
  placeholder,
  min,
  minExclusive = false,
  invalid = false,
  error,
  describedBy,
  onBlur,
  onChange,
}) => {
  const committedParts = splitDateTime(value);
  const suggestedParts = splitDateTime(placeholder ?? "");
  const initialDate =
    committedParts?.date ?? suggestedParts?.date ?? osloTodayIsoDate();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverSideRef = React.useRef<CalendarPopoverSide | null>(null);
  const titleId = React.useId();
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState(
    committedParts?.date ?? "",
  );
  const [timeText, setTimeText] = React.useState(committedParts?.time ?? "");
  const [timeError, setTimeError] = React.useState<string | null>(null);
  const [isEditingTime, setIsEditingTime] = React.useState(false);
  const [focusedDate, setFocusedDate] = React.useState(initialDate);
  const [displayedMonth, setDisplayedMonth] = React.useState(() =>
    startOfMonth(parseIsoDate(initialDate) ?? new Date()),
  );

  React.useEffect(() => {
    const parts = splitDateTime(value);
    if (!parts) return;
    setSelectedDate(parts.date);
    setTimeText(parts.time);
    setTimeError(null);
  }, [value]);

  const minParts = React.useMemo(() => splitDateTime(min ?? ""), [min]);
  const minDate = minParts?.date;
  const allDays = React.useMemo(
    () => calendarDaysForMonth(displayedMonth),
    [displayedMonth],
  );
  const needsSixthWeek = allDays.slice(35).some((day) => day.isCurrentMonth);
  const days = needsSixthWeek ? allDays : allDays.slice(0, 35);

  const getMinimumError = React.useCallback(
    (candidate: string): string | null => {
      if (
        !min ||
        (minExclusive
          ? candidate > min.slice(0, 19)
          : candidate >= min.slice(0, 19))
      ) {
        return null;
      }
      if (!minParts) return null;
      return `Tidspunktet må være ${minExclusive ? "etter" : "tidligst"} ${formatDate(
        minParts.date,
      )} kl. ${minParts.time}.`;
    },
    [min, minExclusive, minParts],
  );

  const validateAndCommit = React.useCallback(
    (date: string, time: string) => {
      if (!date || !time) {
        setTimeError(null);
        onChange("");
        return false;
      }

      const candidate = candidateDateTime(date, time);
      const dateTimeIssue = getAdmissionDateTimeIssue(candidate);
      if (dateTimeIssue === "invalid") {
        setTimeError(
          "Klokkeslettet finnes ikke i norsk tid på grunn av overgang til sommertid.",
        );
        onChange("");
        return false;
      }
      if (dateTimeIssue === "ambiguous") {
        setTimeError(
          "Klokkeslettet er tvetydig ved overgang til vintertid. Velg et annet klokkeslett.",
        );
        onChange("");
        return false;
      }

      const minimumError = getMinimumError(candidate);
      if (minimumError) {
        setTimeError(minimumError);
        onChange("");
        return false;
      }

      setTimeError(null);
      onChange(candidate);
      return true;
    },
    [getMinimumError, onChange],
  );

  React.useEffect(() => {
    if (
      !selectedDate ||
      !timeText ||
      !timeError?.startsWith("Tidspunktet må være")
    ) {
      return;
    }

    const candidate = candidateDateTime(selectedDate, timeText);
    if (getAdmissionDateTimeIssue(candidate)) return;

    const minimumError = getMinimumError(candidate);
    if (minimumError) {
      setTimeError((current) =>
        current === minimumError ? current : minimumError,
      );
      return;
    }

    setTimeError(null);
    onChange(candidate);
  }, [getMinimumError, onChange, selectedDate, timeError, timeText]);

  const closePicker = React.useCallback(
    (markTouched = true) => {
      setIsOpen(false);
      if (markTouched) onBlur();
    },
    [onBlur],
  );

  const calculateDialogLayout = React.useCallback(
    ({
      isCompact,
      isShort,
      triggerRect,
      viewportHeight,
      viewportWidth,
    }: CalendarPopoverLayoutContext): React.CSSProperties => {
      if (isCompact || !triggerRect) return {};

      const viewportPadding = 12;
      const width = Math.min(360, viewportWidth - viewportPadding * 2);
      if (isShort) {
        return {
          left: Math.max(viewportPadding, (viewportWidth - width) / 2),
          top: 8,
          width,
        };
      }
      const availableBelow =
        viewportHeight - triggerRect.bottom - viewportPadding;
      if (!popoverSideRef.current) {
        popoverSideRef.current =
          availableBelow < desktopCalendarMaxHeight &&
          triggerRect.top > availableBelow
            ? "above"
            : "below";
      }
      const left = Math.max(
        viewportPadding,
        Math.min(triggerRect.left, viewportWidth - width - viewportPadding),
      );
      const openAbove = popoverSideRef.current === "above";

      return {
        left,
        width,
        top: openAbove ? undefined : triggerRect.bottom + 8,
        bottom: openAbove ? viewportHeight - triggerRect.top + 8 : undefined,
      };
    },
    [],
  );
  const initialFocusTarget = React.useCallback(
    (dialog: HTMLDivElement): HTMLElement | null =>
      dialog.querySelector<HTMLButtonElement>(
        `[data-calendar-date="${focusedDate}"]`,
      ),
    [focusedDate],
  );
  const { closeAndRestoreFocus, dialogRef, dialogStyle, isCompact, isShort } =
    useAnchoredCalendarPopover({
      isOpen,
      triggerRef,
      compactViewportQuery,
      isShortViewport: isShortAdmissionDateTimeViewport,
      calculateLayout: calculateDialogLayout,
      initialFocus: initialFocusTarget,
      onClose: closePicker,
    });

  const openPicker = () => {
    popoverSideRef.current = null;
    const fallbackDate =
      selectedDate || suggestedParts?.date || osloTodayIsoDate();
    const availableDate =
      minDate && fallbackDate < minDate ? minDate : fallbackDate;
    setFocusedDate(availableDate);
    setDisplayedMonth(startOfMonth(parseIsoDate(availableDate) ?? new Date()));
    setIsOpen(true);
  };

  const focusDate = React.useCallback(
    (date: Date) => {
      const requestedDate = toIsoDate(date);
      const isoDate =
        minDate && requestedDate < minDate ? minDate : requestedDate;
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
    [minDate],
  );

  const selectDate = (isoDate: string) => {
    if (minDate && isoDate < minDate) return;
    setSelectedDate(isoDate);
    setFocusedDate(isoDate);
    const normalizedTime = normalizeAdmissionTime(timeText);
    validateAndCommit(isoDate, normalizedTime ?? "");
    closeAndRestoreFocus(Boolean(normalizedTime));
  };

  const commitTime = () => {
    const normalized = normalizeAdmissionTime(timeText);
    if (!normalized) {
      setTimeError(
        timeText.trim()
          ? "Skriv et gyldig klokkeslett mellom 00:00 og 23:59."
          : null,
      );
      onChange("");
      onBlur();
      return;
    }
    setTimeText(normalized);
    validateAndCommit(selectedDate, normalized);
    onBlur();
  };

  const stepTime = (direction: 1 | -1) => {
    const normalized = normalizeAdmissionTime(timeText);
    const currentMinutes = normalized
      ? Number(normalized.slice(0, 2)) * 60 + Number(normalized.slice(3, 5))
      : direction > 0
        ? 0
        : 15;
    const nextMinutes = Math.max(
      0,
      Math.min(23 * 60 + 59, currentMinutes + direction * 15),
    );
    const nextTime = `${String(Math.floor(nextMinutes / 60)).padStart(
      2,
      "0",
    )}:${String(nextMinutes % 60).padStart(2, "0")}`;
    setTimeText(nextTime);
    validateAndCommit(selectedDate, nextTime);
  };

  const displayedError = timeError ?? (isEditingTime ? undefined : error);
  const errorId = `${id}-error`;
  const fieldDescribedBy = cn(
    describedBy,
    displayedError ? errorId : undefined,
  );
  const dateInvalid = invalid || Boolean(displayedError);
  const today = osloTodayIsoDate();
  const todayUnavailable = Boolean(minDate && today < minDate);
  const cellSize = isShort ? "h-7 w-7" : "h-10 w-10";
  const gridCellHeight = isShort ? "h-7" : "h-10";

  return (
    <>
      <div
        className="grid w-full grid-cols-[minmax(0,1fr)_7.25rem] items-end gap-2"
        data-cy={`datetime-control-${id}`}
      >
        <label className="min-w-0">
          <span className="mb-1 block text-tiny font-semibold text-text-muted">
            Dato
          </span>
          <button
            ref={triggerRef}
            id={id}
            name={id}
            type="button"
            data-admission-field={id}
            data-cy={`date-trigger-${id}`}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-invalid={dateInvalid}
            aria-describedby={fieldDescribedBy}
            onClick={openPicker}
            className={cn(
              "flex min-h-control-md w-full min-w-0 items-center gap-2 rounded-md border bg-surface-base px-3 text-left text-ui transition-[border-color,box-shadow,background-color] duration-150 hover:border-brand-strongBorder hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
              dateInvalid ? "border-danger" : "border-border-soft",
            )}
          >
            <CalendarDays
              size={iconSizes.standard}
              aria-hidden="true"
              className="flex-none text-text-muted"
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-semibold",
                selectedDate ? "text-text-primary" : "text-text-muted",
              )}
            >
              {formatDate(selectedDate)}
            </span>
            <ChevronDown
              size={iconSizes.small}
              aria-hidden="true"
              className="flex-none text-text-subtle"
            />
          </button>
        </label>

        <label className="min-w-0">
          <span className="mb-1 block text-tiny font-semibold text-text-muted">
            Klokkeslett
          </span>
          <input
            id={`${id}-time`}
            name={`${id}-time`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            value={timeText}
            placeholder={suggestedParts?.time ?? "--:--"}
            aria-label={`${label}, klokkeslett`}
            aria-invalid={dateInvalid}
            aria-describedby={fieldDescribedBy}
            onFocus={(event) => {
              setIsEditingTime(true);
              selectTimeSegment(event.currentTarget, 0);
            }}
            onClick={(event) =>
              selectTimeSegment(
                event.currentTarget,
                event.nativeEvent.offsetX > event.currentTarget.clientWidth / 2
                  ? 3
                  : 0,
              )
            }
            onChange={(event) => {
              setTimeText(event.target.value);
              setTimeError(null);
              if (event.target.value !== committedParts?.time) onChange("");
            }}
            onBlur={() => {
              setIsEditingTime(false);
              commitTime();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                stepTime(event.key === "ArrowUp" ? 1 : -1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                commitTime();
              }
            }}
            className={cn(
              "min-h-control-md w-full rounded-md border bg-surface-base px-3 text-center text-ui font-semibold tabular-nums text-text-primary transition-[border-color,box-shadow] placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft",
              dateInvalid ? "border-danger" : "border-border-soft",
            )}
          />
        </label>
      </div>

      {displayedError && (
        <p
          id={errorId}
          role="alert"
          className="m-0 text-detail font-semibold text-danger"
        >
          {displayedError}
        </p>
      )}

      <CalendarPopoverDialog
        open={isOpen}
        dialogRef={dialogRef}
        isCompact={isCompact}
        dialogStyle={dialogStyle}
        titleId={titleId}
        dataCy={`date-dialog-${id}`}
        dataDisplayedMonth={toIsoDate(displayedMonth).slice(0, 7)}
        className="fixed overflow-hidden border border-border bg-surface-base shadow-xl"
        compactClassName="inset-x-2 bottom-2 rounded-xl"
        onRequestClose={() => closeAndRestoreFocus()}
      >
        <h3 id={titleId} className="sr-only">
          Velg dato for {label.toLocaleLowerCase("nb-NO")}
        </h3>

        <CalendarMonthGrid
          displayedMonth={displayedMonth}
          days={days}
          focusedDate={focusedDate}
          today={today}
          previousMonthDisabled={
            Boolean(minDate) &&
            toIsoDate(moveMonth(displayedMonth, -1)).slice(0, 7) <
              (minDate ?? "").slice(0, 7)
          }
          onPreviousMonth={() => focusDate(moveMonth(displayedMonth, -1))}
          onNextMonth={() => focusDate(moveMonth(displayedMonth, 1))}
          onFocusDate={focusDate}
          onSelectDate={({ isoDate }) => selectDate(isoDate)}
          headerClassName={cn(
            "flex items-center justify-between px-3",
            isShort ? "h-9" : "h-12",
          )}
          navigationButtonClassName={cn(
            "flex items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-30",
            isShort ? "h-8 w-8" : "h-10 w-10",
          )}
          monthLabelClassName="capitalize text-ui font-bold text-text-primary"
          gridClassName="px-3"
          weekdayClassName={cn(
            "flex items-center justify-center text-tiny font-bold uppercase tracking-wide text-text-subtle",
            isShort ? "h-5" : "h-7",
          )}
          getCellClassName={() =>
            cn("flex items-center justify-center", gridCellHeight)
          }
          isDaySelected={({ isoDate }) => isoDate === selectedDate}
          renderDay={(
            { date, isoDate, isCurrentMonth },
            { ariaLabel, isToday, onKeyDown, onSelect, tabIndex },
          ) => {
            const isSelected = isoDate === selectedDate;
            const isUnavailable = Boolean(minDate && isoDate < minDate);
            return isCurrentMonth ? (
              <button
                type="button"
                data-calendar-date={isoDate}
                aria-label={ariaLabel}
                aria-current={isToday ? "date" : undefined}
                disabled={isUnavailable}
                tabIndex={tabIndex}
                onClick={onSelect}
                onKeyDown={onKeyDown}
                className={cn(
                  "relative flex items-center justify-center rounded-full text-detail font-semibold tabular-nums transition-[background-color,color,transform,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus motion-reduce:transition-none",
                  cellSize,
                  !isSelected &&
                    !isUnavailable &&
                    "text-text-primary hover:-translate-y-px hover:bg-surface-muted",
                  isSelected &&
                    "bg-brand text-white shadow-sm hover:bg-brand-hover",
                  isToday &&
                    !isSelected &&
                    "ring-1 ring-inset ring-brand text-brand-dark",
                  isUnavailable &&
                    "cursor-not-allowed text-text-disabled opacity-30",
                )}
              >
                {date.getDate()}
              </button>
            ) : (
              <span aria-hidden="true" className={cellSize} />
            );
          }}
        />

        <div
          className={cn(
            "border-t border-border-soft px-3",
            isShort ? "py-1" : "py-2",
          )}
        >
          <button
            type="button"
            disabled={todayUnavailable}
            className="min-h-9 rounded-md px-2 text-detail font-semibold text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-35"
            onClick={() => selectDate(today)}
          >
            I dag
          </button>
        </div>
      </CalendarPopoverDialog>
    </>
  );
};

export default AdmissionDateTimePicker;
