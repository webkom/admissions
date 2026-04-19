import React, { useState, useMemo } from "react";
import type { Interviewer } from "../types";
import { formatDateHeader, makeSlotKey, parseSlotKey } from "../scheduleUtils";
import cn from "src/utils/cn";

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  dates: string[];
  startHour?: number;
  endHour?: number;
  sessionDuration: number;
}

type FilterMode = "all" | "male" | "female" | "people";

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
  dates,
  startHour = 8,
  endHour = 18,
  sessionDuration,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIndividual, setSelectedIndividual] = useState<string | null>(
    null,
  );

  const startMinute = startHour * 60;
  const endMinute = endHour * 60;

  const timeSlots = useMemo(() => {
    const slots = [];
    const step = sessionDuration > 0 ? sessionDuration : 60;
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, sessionDuration]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const filteredInterviewers = useMemo(() => {
    switch (filterMode) {
      case "male":
        return interviewers.filter((i) => i.gender === "M");
      case "female":
        return interviewers.filter((i) => i.gender === "F");
      case "people":
        return selectedIndividual
          ? interviewers.filter((i) => i.id === selectedIndividual)
          : interviewers;
      default:
        return interviewers;
    }
  }, [interviewers, filterMode, selectedIndividual]);

  const slotAvailability = useMemo(() => {
    const counts = new Map<string, number>();

    filteredInterviewers.forEach((interviewer) => {
      interviewer.availability.forEach((slot) => {
        const dayIndex = Math.floor(slot / 24);
        const hour = slot % 24;
        const date = dates[dayIndex];
        if (!date) return;
        const key = makeSlotKey(date, hour * 60);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return counts;
  }, [filteredInterviewers, dates]);

  const maxCount = useMemo(
    () => Math.max(1, ...Array.from(slotAvailability.values())),
    [slotAvailability],
  );

  const bestSlotLabel = useMemo(() => {
    let bestKey: string | null = null;
    let bestValue = 0;

    slotAvailability.forEach((count, key) => {
      if (availableSlots.has(key) && count > bestValue) {
        bestValue = count;
        bestKey = key;
      }
    });

    if (!bestKey || bestValue === 0) return "Ingen dekning";

    const { date, minute } = parseSlotKey(bestKey);
    const { weekday } = formatDateHeader(date);
    return `${weekday} ${formatTime(minute)}`;
  }, [availableSlots, slotAvailability]);

  const getHeatIntensity = (date: string, minute: number): number => {
    const count = slotAvailability.get(makeSlotKey(date, minute)) || 0;
    return count / maxCount;
  };

  const getAvailableCount = (date: string, minute: number): number =>
    slotAvailability.get(makeSlotKey(date, minute)) || 0;

  const isSlotEnabled = (date: string, minute: number): boolean =>
    availableSlots.has(makeSlotKey(date, minute));

  const getHeatPercent = (intensity: number) => Math.round(12 + intensity * 78);

  const getHeatBackground = (enabled: boolean, intensity: number) => {
    if (!enabled) return "var(--color-surface-subtle)";
    if (intensity === 0) return "var(--color-surface-base)";
    return `color-mix(in srgb, var(--color-brand) ${getHeatPercent(intensity)}%, var(--color-surface-base))`;
  };

  const getHeatBorder = (enabled: boolean, intensity: number) => {
    if (!enabled || intensity === 0) return "var(--color-border-soft)";
    return "var(--color-brand-border)";
  };

  const setMode = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode !== "people") setSelectedIndividual(null);
  };

  const columns = dates.length + 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          "rounded-panel border border-border bg-surface-base",
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3.5",
        )}
      >
        <div className="flex flex-wrap gap-1.5">
          <FilterButton
            active={filterMode === "all"}
            onClick={() => setMode("all")}
            label="Alle"
            count={interviewers.length}
          />
          <FilterButton
            active={filterMode === "male"}
            onClick={() => setMode("male")}
            label="Menn"
            count={interviewers.filter((i) => i.gender === "M").length}
          />
          <FilterButton
            active={filterMode === "female"}
            onClick={() => setMode("female")}
            label="Kvinner"
            count={interviewers.filter((i) => i.gender === "F").length}
          />
        </div>

        <div className="flex items-center gap-2">
          <label
            className="text-label font-bold uppercase tracking-label text-text-subtle"
            htmlFor="person-filter"
          >
            Person
          </label>
          <select
            id="person-filter"
            value={selectedIndividual || ""}
            className={cn(
              "rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-medium text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft",
              "min-w-[170px] cursor-pointer",
            )}
            onChange={(e) => {
              const value = e.target.value || null;
              setSelectedIndividual(value);
              setFilterMode(value ? "people" : "all");
            }}
          >
            <option value="">Velg person...</option>
            {interviewers.map((interviewer) => (
              <option key={interviewer.id} value={interviewer.id}>
                {interviewer.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-w-0 rounded-panel border border-border bg-surface-base p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="mb-[0.35rem] block text-label font-bold uppercase tracking-label text-text-subtle">
              Tilgjengelighet
            </span>
            <div className="flex items-center gap-[3px]">
              {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                <div
                  key={intensity}
                  className="h-3 w-[1.4rem] rounded-[3px]"
                  style={{ background: getHeatBackground(true, intensity) }}
                />
              ))}
              <span className="ml-1.5 text-xs font-semibold text-text-faded">
                0 til {maxCount}
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
          <div
            className="grid gap-[5px]"
            style={{
              gridTemplateColumns: `56px repeat(${columns - 1}, minmax(70px, 1fr))`,
              minWidth: `max(680px, ${(columns - 1) * 70 + 56}px)`,
            }}
          >
            <div />
            {dates.map((date) => {
              const { weekday, dayMonth } = formatDateHeader(date);
              return (
                <div
                  key={date}
                  className={cn(
                    "flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-base text-label font-bold uppercase tracking-label text-text-muted",
                    "flex-col gap-[0.1rem]",
                  )}
                >
                  <span>{weekday}</span>
                  <span className="block text-label font-semibold text-text-subtle">
                    {dayMonth}
                  </span>
                </div>
              );
            })}

            {timeSlots.map((minute) => (
              <React.Fragment key={minute}>
                <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                  {formatTime(minute)}
                </div>
                {dates.map((date) => {
                  const enabled = isSlotEnabled(date, minute);
                  const intensity = getHeatIntensity(date, minute);
                  const count = getAvailableCount(date, minute);

                  return (
                    <div
                      key={makeSlotKey(date, minute)}
                      className={cn(
                        "flex h-[2.4rem] items-center justify-center rounded-md border transition-[background-color] duration-100",
                        !enabled && "opacity-40",
                      )}
                      style={{
                        background: getHeatBackground(enabled, intensity),
                        borderColor: getHeatBorder(enabled, intensity),
                      }}
                      title={enabled ? `${count} tilgjengelig` : "Ikke tilgjengelig"}
                    >
                      {enabled && count > 0 && (
                        <span
                          className="text-xs font-bold"
                          style={{
                            color:
                              intensity < 0.45
                                ? "var(--color-brand)"
                                : "var(--color-white)",
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-border-soft pt-3.5">
        <SummaryCard label="Aktive intervjuere" value={String(filteredInterviewers.length)} />
        <SummaryCard label="Dekning" value={`${slotAvailability.size} slotter`} />
        <SummaryCard label="Beste åpne luke" value={bestSlotLabel} />
      </div>
    </div>
  );
};

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}

const FilterButton = ({ active, onClick, label, count }: FilterButtonProps) => (
  <button
    type="button"
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-ui font-semibold transition-all duration-100",
      active
        ? "border-brand-strongBorder bg-brand-tint text-brand"
        : "border-transparent bg-transparent text-text-muted hover:border-border-soft hover:bg-surface-subtle hover:text-text-primary",
    )}
    onClick={onClick}
  >
    {label}
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/5 px-1 text-label font-bold">
      {count}
    </span>
  </button>
);

interface SummaryCardProps {
  label: string;
  value: string;
}

const SummaryCard = ({ label, value }: SummaryCardProps) => (
  <div className="inline-flex items-baseline gap-[0.4rem]">
    <span className="text-label font-bold uppercase tracking-label text-text-subtle">
      {label}
    </span>
    <span className="text-sm font-bold text-text-primary">{value}</span>
  </div>
);

export default AvailabilityHeatmap;
