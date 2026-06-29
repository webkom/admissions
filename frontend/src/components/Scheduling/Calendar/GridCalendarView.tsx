import React, { useMemo } from "react";
import { Lock } from "lucide-react";
import type { ScheduleItem } from "../../../types";
import {
  buildBlockTimeChunks,
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";

interface GridCalendarViewProps {
  schedule: ScheduleItem[];
  dates: string[];
  sessionDuration: number;
  dayStartMinute?: number;
  dayEndMinute?: number;
  chunkSize?: number;
  chunkBreakMinutes?: number;
  /** When provided, cells whose slot is not in the set are shown as unavailable. */
  availableSlots?: Set<string>;
  renderItem?: (item: ScheduleItem, scheduleIndex: number) => React.ReactNode;
}

const GridCalendarView: React.FC<GridCalendarViewProps> = ({
  schedule,
  dates,
  sessionDuration,
  dayStartMinute = 8 * 60,
  dayEndMinute = 18 * 60,
  chunkSize = 1,
  chunkBreakMinutes = 0,
  availableSlots,
  renderItem,
}) => {
  const minutes = useMemo(() => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute,
      dayEndMinute,
      sessionDuration,
      chunkSize,
      chunkBreakMinutes,
    });
    const chunkMinutes = chunks.map((c) => c[0]);
    const scheduleMinutes = new Set<number>();
    schedule.forEach((item) => {
      scheduleMinutes.add(
        decodeScheduleTime(item.time, sessionDuration).minute,
      );
    });
    const allMinutes = new Set([
      ...chunkMinutes,
      ...Array.from(scheduleMinutes),
    ]);
    return Array.from(allMinutes).sort((a, b) => a - b);
  }, [
    schedule,
    sessionDuration,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    chunkBreakMinutes,
  ]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, { item: ScheduleItem; index: number }[]>();
    schedule.forEach((item, index) => {
      const { dayIndex, minute } = decodeScheduleTime(
        item.time,
        sessionDuration,
      );
      const key = `${dayIndex}-${minute}`;
      const existing = map.get(key) ?? [];
      existing.push({ item, index });
      map.set(key, existing);
    });
    return map;
  }, [schedule, sessionDuration]);

  const defaultRenderItem = (item: ScheduleItem, index: number) => (
    <div
      key={`${item.candidate}-${index}`}
      className={cn(
        "flex flex-col gap-[0.3rem] rounded border bg-surface-base px-[0.6rem] py-2 shadow-sm",
        item.locked
          ? "border-brand border-l-[3px] border-l-brand ring-1 ring-inset ring-brand-border"
          : "border-brand-border border-l-2 border-l-brand",
      )}
    >
      <div className="flex items-center gap-1">
        {item.locked && (
          <Lock size={11} aria-label="Låst" className="flex-none text-brand" />
        )}
        <span className="truncate whitespace-nowrap text-xs font-bold text-text-primary">
          {item.candidate}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {item.panel.map((p, i) => (
          <span
            key={i}
            className="whitespace-nowrap rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-text-muted"
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border-soft bg-surface-base shadow-sm">
      <div
        className="grid gap-px bg-border-muted"
        style={{
          gridTemplateColumns: `80px repeat(${dates.length}, minmax(160px, 1fr))`,
          minWidth: `max(680px, ${dates.length * 160 + 80}px)`,
        }}
      >
        {/* Header row */}
        <div className="bg-surface-base" />
        {dates.map((date) => {
          const { weekday, dayMonth } = formatDateHeader(date);
          return (
            <div
              key={date}
              className="flex flex-col items-center justify-center bg-surface-base py-3"
            >
              <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                {weekday}
              </span>
              <span className="text-sm font-semibold text-text-primary">
                {dayMonth}
              </span>
            </div>
          );
        })}

        {/* Time rows */}
        {minutes.map((minute) => (
          <React.Fragment key={minute}>
            <div className="flex items-center justify-end bg-surface-base pr-4 text-xs font-bold tabular-nums text-text-muted">
              {formatMinutes(minute)}
            </div>
            {dates.map((date, dayIndex) => {
              const entries = scheduleMap.get(`${dayIndex}-${minute}`) ?? [];
              const isUnavailable =
                availableSlots !== undefined &&
                entries.length === 0 &&
                !availableSlots.has(makeSlotKey(date, minute));
              return (
                <div
                  key={`${dayIndex}-${minute}`}
                  title={
                    isUnavailable ? "Ikke tilgjengelig for intervju" : undefined
                  }
                  className={cn(
                    "flex min-h-[5rem] flex-col gap-1 p-1.5",
                    isUnavailable
                      ? "bg-surface-base [background-image:var(--pattern-unavailable)]"
                      : entries.length === 0
                        ? "bg-surface-base"
                        : "bg-brand-tint",
                  )}
                >
                  {entries.map(({ item, index }) =>
                    renderItem
                      ? renderItem(item, index)
                      : defaultRenderItem(item, index),
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default GridCalendarView;
