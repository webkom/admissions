import React, { useMemo, useState } from "react";
import { GripVertical, Lock } from "lucide-react";
import type { ScheduleItem } from "../../../types";
import {
  buildBlockTimeChunks,
  decodeScheduleTime,
  encodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import { calendarGrid, iconSizes } from "src/styles/designTokens";

interface GridCalendarViewProps {
  schedule: ScheduleItem[];
  dates: string[];
  sessionDuration: number;
  dayStartMinute?: number;
  dayEndMinute?: number;
  chunkSize?: number;
  chunkBreakMinutes?: number;
  availableSlots?: Set<string>;
  occupiedTimes?: ReadonlySet<number>;
  showAvailabilityLegend?: boolean;
  compactSchedule?: boolean;
  renderItem?: (item: ScheduleItem, scheduleIndex: number) => React.ReactNode;
  onMoveItem?: (scheduleIndex: number, nextTime: number) => void;
  moveDisabled?: boolean;
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
  occupiedTimes,
  showAvailabilityLegend = false,
  compactSchedule = false,
  renderItem,
  onMoveItem,
  moveDisabled = false,
}) => {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showFullPeriod, setShowFullPeriod] = useState(false);
  const scheduledDayIndexes = useMemo(
    () =>
      new Set(
        schedule.map(
          (item) => decodeScheduleTime(item.time, sessionDuration).dayIndex,
        ),
      ),
    [schedule, sessionDuration],
  );
  const visibleDays = useMemo(() => {
    const allDays = dates.map((date, dayIndex) => ({ date, dayIndex }));
    if (!compactSchedule || showFullPeriod || scheduledDayIndexes.size === 0) {
      return allDays;
    }
    return allDays.filter(({ dayIndex }) => scheduledDayIndexes.has(dayIndex));
  }, [compactSchedule, dates, scheduledDayIndexes, showFullPeriod]);
  const minutes = useMemo(() => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute,
      dayEndMinute,
      sessionDuration,
      chunkSize,
      chunkBreakMinutes,
    });
    const chunkMinutes = chunks.flat();
    const scheduleMinutes = new Set<number>();
    schedule.forEach((item) => {
      scheduleMinutes.add(
        decodeScheduleTime(item.time, sessionDuration).minute,
      );
    });
    const scheduledMinutes = Array.from(scheduleMinutes);
    const cropToSchedule =
      compactSchedule && !showFullPeriod && scheduledMinutes.length > 0;
    const firstScheduledMinute = Math.min(...scheduledMinutes);
    const lastScheduledMinute = Math.max(...scheduledMinutes);
    const visibleChunkMinutes = cropToSchedule
      ? chunkMinutes.filter(
          (minute) =>
            minute >= firstScheduledMinute && minute <= lastScheduledMinute,
        )
      : chunkMinutes;
    const allMinutes = new Set([...visibleChunkMinutes, ...scheduledMinutes]);
    return Array.from(allMinutes).sort((a, b) => a - b);
  }, [
    schedule,
    sessionDuration,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    chunkBreakMinutes,
    compactSchedule,
    showFullPeriod,
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
        "flex flex-col gap-1 rounded border bg-surface-base px-2.5 py-2 shadow-sm",
        item.locked
          ? "border-brand border-l-2 border-l-brand ring-1 ring-inset ring-brand-border"
          : "border-brand-border border-l-2 border-l-brand",
      )}
    >
      <div className="flex items-center gap-1">
        {item.locked && (
          <Lock
            size={iconSizes.tiny}
            aria-label="Låst"
            className="flex-none text-brand"
          />
        )}
        <span className="truncate whitespace-nowrap text-xs font-bold text-text-primary">
          {item.candidate}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {item.panel.map((p, i) => (
          <span
            key={i}
            className="whitespace-nowrap rounded-full bg-surface-subtle px-1.5 py-0.5 text-tiny font-semibold text-text-muted"
          >
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border-soft bg-surface-base shadow-sm">
      {(compactSchedule ||
        (showAvailabilityLegend && availableSlots !== undefined)) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-soft bg-surface-subtle px-4 py-2.5 text-detail font-semibold text-text-muted">
          {showAvailabilityLegend && availableSlots !== undefined && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <CalendarLegendItem label="Ledig" variant="available" />
              <CalendarLegendItem label="Planlagt" variant="scheduled" />
              <CalendarLegendItem
                label="Ikke tilgjengelig"
                variant="unavailable"
              />
            </div>
          )}
          {compactSchedule && (
            <button
              type="button"
              onClick={() => setShowFullPeriod((value) => !value)}
              className="ml-auto font-semibold text-brand underline-offset-2 hover:underline"
            >
              {showFullPeriod ? "Vis bare intervjuer" : "Vis hele perioden"}
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          className="grid gap-px bg-border-muted"
          style={{
            gridTemplateColumns: `${calendarGrid.scheduleTimeColumnWidth}px repeat(${visibleDays.length}, minmax(${calendarGrid.scheduleDayColumnMinWidth}px, 1fr))`,
            minWidth: compactSchedule
              ? `${visibleDays.length * calendarGrid.scheduleDayColumnMinWidth + calendarGrid.scheduleTimeColumnWidth}px`
              : `max(${calendarGrid.minimumWidth}px, ${visibleDays.length * calendarGrid.scheduleDayColumnMinWidth + calendarGrid.scheduleTimeColumnWidth}px)`,
          }}
        >
          <div className="bg-surface-subtle" />
          {visibleDays.map(({ date }) => {
            const { weekday, dayMonth } = formatDateHeader(date);
            return (
              <div
                key={date}
                className="flex flex-col items-center justify-center border-b-2 border-border-soft bg-surface-subtle py-3"
              >
                <span className="text-detail font-medium text-text-muted">
                  {weekday}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {dayMonth}
                </span>
              </div>
            );
          })}

          {minutes.map((minute) => {
            return (
              <React.Fragment key={minute}>
                <div className="flex min-h-20 flex-col items-end justify-center bg-surface-subtle pr-4 text-xs font-bold tabular-nums text-text-muted">
                  {formatMinutes(minute)}
                </div>
                {visibleDays.map(({ date, dayIndex }) => {
                  const entries =
                    scheduleMap.get(`${dayIndex}-${minute}`) ?? [];
                  const hasEntries = entries.length > 0;
                  const targetTime = encodeScheduleTime(
                    dayIndex,
                    minute,
                    sessionDuration,
                  );
                  const isOccupied =
                    occupiedTimes?.has(targetTime) ?? hasEntries;
                  const isUnavailable =
                    availableSlots !== undefined &&
                    !hasEntries &&
                    !availableSlots.has(makeSlotKey(date, minute));
                  const moveIndex = draggedIndex ?? selectedIndex;
                  const canDrop = Boolean(
                    onMoveItem &&
                      moveIndex !== null &&
                      !moveDisabled &&
                      !isUnavailable &&
                      !isOccupied,
                  );
                  const slotKey = `${dayIndex}-${minute}`;
                  const isDropTarget = dropTarget === slotKey;
                  return (
                    <div
                      key={slotKey}
                      title={
                        isUnavailable
                          ? "Ikke tilgjengelig for intervju"
                          : canDrop
                            ? selectedIndex !== null
                              ? "Klikk for å flytte intervjuet hit"
                              : "Dra et intervju hit"
                            : undefined
                      }
                      onClick={() => {
                        if (!canDrop || selectedIndex === null || !onMoveItem) {
                          return;
                        }
                        onMoveItem(selectedIndex, targetTime);
                        setSelectedIndex(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(event) => {
                        if (!canDrop) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTarget(slotKey);
                      }}
                      onDragLeave={(event) => {
                        if (
                          event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          return;
                        }
                        if (dropTarget === slotKey) setDropTarget(null);
                      }}
                      onDrop={(event) => {
                        if (!canDrop || !onMoveItem) return;
                        event.preventDefault();
                        const rawIndex =
                          event.dataTransfer.getData("text/plain");
                        const parsedIndex = Number(rawIndex);
                        const scheduleIndex = Number.isInteger(parsedIndex)
                          ? parsedIndex
                          : draggedIndex;
                        setDropTarget(null);
                        setDraggedIndex(null);
                        setSelectedIndex(null);
                        if (scheduleIndex === null) return;
                        onMoveItem(scheduleIndex, targetTime);
                      }}
                      className={cn(
                        "flex min-h-20 flex-col gap-1 border border-transparent p-1.5 transition-colors",
                        isUnavailable
                          ? "bg-surface-neutral [background-image:var(--pattern-unavailable)]"
                          : hasEntries
                            ? "border-border-soft bg-surface-subtle"
                            : "border-border-soft bg-surface-base",
                        isDropTarget &&
                          "border-brand-strongBorder bg-surface-subtle ring-2 ring-inset ring-brand-ring",
                        canDrop && selectedIndex !== null && "cursor-pointer",
                      )}
                    >
                      {entries.map(({ item, index }) => {
                        const content = renderItem
                          ? renderItem(item, index)
                          : defaultRenderItem(item, index);
                        if (!onMoveItem) return content;
                        return (
                          <div
                            key={`${item.candidate}-${item.time}-${index}`}
                            className={cn(
                              "flex min-w-0 items-stretch gap-1 rounded-md",
                              draggedIndex === index && "opacity-50",
                              selectedIndex === index &&
                                "ring-2 ring-brand-ring ring-offset-1",
                            )}
                          >
                            <button
                              type="button"
                              draggable={!moveDisabled}
                              disabled={moveDisabled}
                              aria-pressed={selectedIndex === index}
                              aria-label={`Flytt intervjuet for ${item.candidate}`}
                              title="Dra intervjuet, eller klikk og velg en ledig tidsluke"
                              onClick={() =>
                                setSelectedIndex((current) =>
                                  current === index ? null : index,
                                )
                              }
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(
                                  "text/plain",
                                  String(index),
                                );
                                setDraggedIndex(index);
                                setSelectedIndex(null);
                              }}
                              onDragEnd={() => {
                                setDraggedIndex(null);
                                setDropTarget(null);
                              }}
                              className={cn(
                                "flex w-5 flex-none cursor-grab items-center justify-center rounded border border-border-soft bg-surface-base text-text-faded hover:border-border-quiet hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50",
                                selectedIndex === index &&
                                  "border-brand-strongBorder text-brand ring-2 ring-brand-ring",
                              )}
                            >
                              <GripVertical
                                size={iconSizes.detail}
                                aria-hidden="true"
                              />
                            </button>
                            <div className="min-w-0 flex-1">{content}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const CalendarLegendItem: React.FC<{
  label: string;
  variant: "available" | "scheduled" | "unavailable";
}> = ({ label, variant }) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      aria-hidden="true"
      className={cn(
        "h-2.5 w-4 rounded-sm border",
        variant === "available" && "border-border-soft bg-surface-base",
        variant === "scheduled" && "border-border-soft bg-surface-subtle",
        variant === "unavailable" &&
          "border-border-soft bg-surface-neutral [background-image:var(--pattern-unavailable)]",
      )}
    />
    {label}
  </span>
);

export default GridCalendarView;
