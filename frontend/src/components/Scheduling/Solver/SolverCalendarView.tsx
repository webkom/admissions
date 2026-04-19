import React, { useMemo } from "react";
import type { ScheduleItem } from "../../../types";
import {
  scheduleGridHeaderCellClass,
  scheduleGridShellClass,
  scheduleGridTimeLabelClass,
} from "../shared";
import { formatDateHeader } from "../scheduleUtils";
import cn from "src/utils/cn";

interface Props {
  schedule: ScheduleItem[];
  dates: string[];
}

const SolverCalendarView: React.FC<Props> = ({ schedule, dates }) => {
  const startHour = 8;
  const endHour = 18;

  const hours = useMemo(
    () =>
      Array.from(
        { length: endHour - startHour },
        (_, i) => `${i + startHour}:00`,
      ),
    [],
  );

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    schedule.forEach((item) => {
      const dayIndex = Math.floor(item.time / 24);
      const hour = item.time % 24;
      const key = `${dayIndex}-${hour}`;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    });
    return map;
  }, [schedule]);

  const columns = dates.length + 1;

  return (
    <div className={cn(scheduleGridShellClass, "min-w-0 w-full")}>
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `56px repeat(${columns - 1}, minmax(110px, 1fr))`,
          minWidth: `max(680px, ${(columns - 1) * 110 + 56}px)`,
        }}
      >
        <div />
        {dates.map((date) => {
          const { weekday, dayMonth } = formatDateHeader(date);
          return (
            <div key={date} className={scheduleGridHeaderCellClass}>
              <span>{weekday}</span>
              <span className="block text-[0.688rem] font-semibold text-[#a0a0a0]">
                {dayMonth}
              </span>
            </div>
          );
        })}

        {hours.map((hourLabel) => {
          const hour = parseInt(hourLabel, 10);
          return (
            <React.Fragment key={hourLabel}>
              <div className={scheduleGridTimeLabelClass}>{hourLabel}</div>
              {dates.map((_, dayIndex) => {
                const items = scheduleMap.get(`${dayIndex}-${hour}`) ?? [];
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1",
                      items.length > 0
                        ? "border-[#e4e4e4] bg-white"
                        : "border-[#ebebeb] bg-[#f5f5f5]",
                    )}
                  >
                    {items.map((item, index) => (
                      <div
                        key={`${item.candidate}-${index}`}
                        className="flex flex-col gap-[0.3rem] rounded border border-[#e4e4e4] border-l-2 border-l-[var(--lego-red-color)] bg-white px-[0.6rem] py-2"
                      >
                        <div className="truncate whitespace-nowrap text-xs font-bold text-[#111111]">
                          {item.candidate}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.panel.map((p, i) => (
                            <span
                              key={i}
                              className={cn(
                                "whitespace-nowrap rounded-full border px-1.5 py-[0.15rem] text-[0.688rem]",
                                p.is_overtime
                                  ? "border-[rgba(178,18,7,0.2)] bg-[rgba(178,18,7,0.08)] text-[#b21207]"
                                  : "border-transparent bg-[#f0f0f0] text-[#6b6b6b]",
                              )}
                              title={
                                p.is_overtime
                                  ? "Utenfor registrert tilgjengelighet"
                                  : undefined
                              }
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default SolverCalendarView;
