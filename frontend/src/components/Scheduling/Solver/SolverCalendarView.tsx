import React, { useMemo } from "react";
import type { ScheduleItem } from "../../../types";
import { decodeScheduleTime, formatDateHeader } from "../scheduleUtils";
import cn from "src/utils/cn";

interface Props {
  schedule: ScheduleItem[];
  dates: string[];
  sessionDuration: number;
}

const SolverCalendarView: React.FC<Props> = ({
  schedule,
  dates,
  sessionDuration,
}) => {
  const minutes = useMemo(() => {
    if (schedule.length === 0) return [] as number[];
    const unique = new Set<number>();
    schedule.forEach((item) => {
      unique.add(decodeScheduleTime(item.time, sessionDuration).minute);
    });
    return Array.from(unique).sort((a, b) => a - b);
  }, [schedule, sessionDuration]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    schedule.forEach((item) => {
      const { dayIndex, minute } = decodeScheduleTime(
        item.time,
        sessionDuration,
      );
      const key = `${dayIndex}-${minute}`;
      const existing = map.get(key) ?? [];
      existing.push(item);
      map.set(key, existing);
    });
    return map;
  }, [schedule, sessionDuration]);

  const columns = dates.length + 1;

  const formatMinuteLabel = (minute: number) => {
    const hour = Math.floor(minute / 60);
    const minutePart = minute % 60;
    return `${hour}:${minutePart.toString().padStart(2, "0")}`;
  };

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

        {minutes.map((minute) => {
          return (
            <React.Fragment key={minute}>
              <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                {formatMinuteLabel(minute)}
              </div>
              {dates.map((_, dayIndex) => {
                const items = scheduleMap.get(`${dayIndex}-${minute}`) ?? [];
                return (
                  <div
                    key={`${dayIndex}-${minute}`}
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
                          {item.locked && (
                            <span className="ml-1 rounded-full border border-border-soft bg-surface-subtle px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-label text-text-subtle">
                              Låst
                            </span>
                          )}
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
