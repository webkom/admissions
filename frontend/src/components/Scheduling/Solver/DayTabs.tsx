import React from "react";
import { formatDateHeader } from "../scheduleUtils";
import { SegmentedControl } from "../../ui";

interface DayTabsProps {
  dates: string[];
  /** Number of interviews per day, in the same order as `dates`. */
  countsByDay: number[];
  /** Active day; null means "Alle". */
  selectedDayIndex: number | null;
  onSelectDay: (dayIndex: number | null) => void;
  /** Aria label for the tablist; describes what the days refer to. */
  ariaLabel?: string;
}

const DayTabs: React.FC<DayTabsProps> = ({
  dates,
  countsByDay,
  selectedDayIndex,
  onSelectDay,
  ariaLabel = "Velg dag i planutkastet",
}) => {
  if (dates.length === 0) return null;

  const totalCount = countsByDay.reduce((acc, count) => acc + count, 0);

  const items = [
    {
      key: "all",
      label: "Alle",
      count: totalCount,
    },
    ...dates.map((date, dayIndex) => {
      const header = formatDateHeader(date);
      return {
        key: String(dayIndex),
        label: `${header.weekday} ${header.dayMonth}`,
        count: countsByDay[dayIndex] ?? 0,
      };
    }),
  ];

  return (
    <div data-cy="day-tabs" className="flex items-center">
      <SegmentedControl<string>
        value={selectedDayIndex === null ? "all" : String(selectedDayIndex)}
        onChange={(val) => onSelectDay(val === "all" ? null : Number(val))}
        items={items}
        aria-label={ariaLabel}
      />
    </div>
  );
};

export default DayTabs;
