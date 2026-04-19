import React, { useMemo } from "react";
import type { ScheduleItem } from "../../../types";
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
    <div className="min-w-0 w-full overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
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
            <div
              key={date}
              className="flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-base text-label font-bold uppercase tracking-label text-text-muted"
            >
              <span>{weekday}</span>
              <span className="block text-label font-semibold text-text-subtle">
                {dayMonth}
              </span>
            </div>
          );
        })}

        {hours.map((hourLabel) => {
          const hour = parseInt(hourLabel, 10);
          return (
            <React.Fragment key={hourLabel}>
              <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                {hourLabel}
              </div>
              {dates.map((_, dayIndex) => {
                const items = scheduleMap.get(`${dayIndex}-${hour}`) ?? [];
                return (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cn(
                      "flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1",
                      items.length > 0
                        ? "border-border-soft bg-surface-base"
                        : "border-border-faint bg-surface-muted",
                    )}
                  >
                    {items.map((item, index) => (
                      <div
                        key={`${item.candidate}-${index}`}
                        className="flex flex-col gap-[0.3rem] rounded border border-border-soft border-l-2 border-l-brand bg-surface-base px-[0.6rem] py-2"
                      >
                        <div className="truncate whitespace-nowrap text-xs font-bold text-text-primary">
                          {item.candidate}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {item.panel.map((p, i) => (
                            <span
                              key={i}
                              className={cn(
                                "whitespace-nowrap rounded-full border px-1.5 py-0.5 text-label",
                                p.is_overtime
                                  ? "border-brand-panelBorder bg-brand-badge text-brand"
                                  : "border-transparent bg-surface-subtle text-text-muted",
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
