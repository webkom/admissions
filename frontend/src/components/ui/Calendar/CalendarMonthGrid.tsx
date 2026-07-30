import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

import {
  CalendarDay,
  formatAccessibleCalendarDate,
  formatCalendarMonth,
  moveCalendarDateByMonth,
  parseIsoDate,
  toIsoDate,
} from "./calendarDateUtils";

const WEEKDAY_LABELS = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"];

interface CalendarDayInteractions {
  ariaLabel: string;
  isToday: boolean;
  tabIndex: 0 | -1;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

interface CalendarMonthGridProps {
  displayedMonth: Date;
  days: CalendarDay[];
  focusedDate: string;
  today: string;
  previousMonthDisabled?: boolean;
  nextMonthDisabled?: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onFocusDate: (date: Date) => string | void;
  onSelectDate: (day: CalendarDay) => void;
  headerClassName: string;
  navigationButtonClassName: string;
  monthLabelClassName: string;
  monthLabelElement?: "h4" | "span";
  gridClassName?: string;
  weekdayClassName: string;
  weekClassName?: string;
  getCellClassName: (day: CalendarDay) => string | undefined;
  isDaySelected: (day: CalendarDay) => boolean;
  renderDay: (
    day: CalendarDay,
    interactions: CalendarDayInteractions,
  ) => React.ReactNode;
  onMonthNavigationKeyDown?: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    month: Date,
  ) => void;
}

export const CalendarMonthGrid: React.FC<CalendarMonthGridProps> = ({
  displayedMonth,
  days,
  focusedDate,
  today,
  previousMonthDisabled = false,
  nextMonthDisabled = false,
  onPreviousMonth,
  onNextMonth,
  onFocusDate,
  onSelectDate,
  headerClassName,
  navigationButtonClassName,
  monthLabelClassName,
  monthLabelElement: MonthLabel = "span",
  gridClassName,
  weekdayClassName,
  weekClassName = "grid grid-cols-7",
  getCellClassName,
  isDaySelected,
  renderDay,
  onMonthNavigationKeyDown,
}) => {
  const logicalFocusedDateRef = React.useRef(focusedDate);

  React.useLayoutEffect(() => {
    logicalFocusedDateRef.current = focusedDate;
  }, [focusedDate]);

  const moveFocus = (date: Date) => {
    const resolvedDate = onFocusDate(date);
    logicalFocusedDateRef.current = resolvedDate ?? toIsoDate(date);
  };

  const handleDayKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    day: CalendarDay,
  ) => {
    const date =
      parseIsoDate(logicalFocusedDateRef.current) ??
      parseIsoDate(focusedDate) ??
      day.date;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDate(day);
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
      moveFocus(
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset),
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const mondayIndex = (date.getDay() + 6) % 7;
      const offsetToEdge =
        event.key === "Home" ? -mondayIndex : 6 - mondayIndex;
      moveFocus(
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
      moveFocus(moveCalendarDateByMonth(date, event.key === "PageUp" ? -1 : 1));
    }
  };

  const weeks = Array.from(
    { length: Math.ceil(days.length / 7) },
    (_, weekIndex) => days.slice(weekIndex * 7, weekIndex * 7 + 7),
  );

  return (
    <>
      <div className={headerClassName}>
        <button
          type="button"
          aria-label="Forrige måned"
          disabled={previousMonthDisabled}
          className={navigationButtonClassName}
          onClick={onPreviousMonth}
          onKeyDown={(event) =>
            onMonthNavigationKeyDown?.(
              event,
              new Date(
                displayedMonth.getFullYear(),
                displayedMonth.getMonth() - 1,
                1,
              ),
            )
          }
        >
          <ChevronLeft size={iconSizes.standard} aria-hidden="true" />
        </button>
        <MonthLabel className={monthLabelClassName}>
          {formatCalendarMonth(displayedMonth)}
        </MonthLabel>
        <button
          type="button"
          aria-label="Neste måned"
          disabled={nextMonthDisabled}
          className={navigationButtonClassName}
          onClick={onNextMonth}
          onKeyDown={(event) =>
            onMonthNavigationKeyDown?.(
              event,
              new Date(
                displayedMonth.getFullYear(),
                displayedMonth.getMonth() + 1,
                1,
              ),
            )
          }
        >
          <ChevronRight size={iconSizes.standard} aria-hidden="true" />
        </button>
      </div>

      <div
        role="grid"
        aria-label={`Kalender for ${formatCalendarMonth(displayedMonth)}`}
        className={gridClassName}
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((weekday) => (
            <div key={weekday} role="columnheader" className={weekdayClassName}>
              {weekday}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.isoDate} role="row" className={weekClassName}>
            {week.map((day) => (
              <div
                key={day.isoDate}
                role="gridcell"
                aria-selected={isDaySelected(day)}
                className={cn(getCellClassName(day))}
              >
                {renderDay(day, {
                  ariaLabel: formatAccessibleCalendarDate(day.date),
                  isToday: day.isoDate === today,
                  tabIndex: day.isoDate === focusedDate ? 0 : -1,
                  onSelect: () => onSelectDate(day),
                  onKeyDown: (event) => handleDayKeyDown(event, day),
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
};
