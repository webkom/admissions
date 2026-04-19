import React, { useState, useMemo } from "react";
import type { Interviewer } from "../types";
import { formatDateHeader, makeSlotKey, parseSlotKey } from "../scheduleUtils";
import {
  scheduleGridHeaderCellClass,
  scheduleGridShellClass,
  scheduleGridTimeLabelClass,
  scheduleInputClass,
  scheduleLabelClass,
  scheduleSurfaceClass,
} from "../shared";
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

  const setMode = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode !== "people") setSelectedIndividual(null);
  };

  const columns = dates.length + 1;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          scheduleSurfaceClass,
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
          <label className={scheduleLabelClass} htmlFor="person-filter">
            Person
          </label>
          <select
            id="person-filter"
            value={selectedIndividual || ""}
            className={cn(scheduleInputClass, "min-w-[170px] cursor-pointer")}
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

      <div className={cn(scheduleSurfaceClass, "min-w-0 p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className={cn(scheduleLabelClass, "mb-[0.35rem] block")}>
              Tilgjengelighet
            </span>
            <div className="flex items-center gap-[3px]">
              {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                <div
                  key={intensity}
                  className="h-3 w-[1.4rem] rounded-[3px]"
                  style={{
                    background:
                      intensity === 0
                        ? "#f0f0f0"
                        : `rgba(178, 18, 7, ${0.12 + intensity * 0.78})`,
                  }}
                />
              ))}
              <span className="ml-1.5 text-xs font-semibold text-[#a0a0a0]">
                0 til {maxCount}
              </span>
            </div>
          </div>
        </div>

        <div className={cn(scheduleGridShellClass, "min-w-0")}>
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
                    scheduleGridHeaderCellClass,
                    "flex-col gap-[0.1rem]",
                  )}
                >
                  <span>{weekday}</span>
                  <span className="block text-[0.688rem] font-semibold text-[#a0a0a0]">
                    {dayMonth}
                  </span>
                </div>
              );
            })}

            {timeSlots.map((minute) => (
              <React.Fragment key={minute}>
                <div className={scheduleGridTimeLabelClass}>{formatTime(minute)}</div>
                {dates.map((date) => {
                  const enabled = isSlotEnabled(date, minute);
                  const intensity = getHeatIntensity(date, minute);
                  const count = getAvailableCount(date, minute);
                  const background =
                    !enabled
                      ? "#f0f0f0"
                      : intensity === 0
                        ? "#ffffff"
                        : `rgba(178, 18, 7, ${0.12 + intensity * 0.78})`;
                  const borderColor = !enabled
                    ? "#e4e4e4"
                    : intensity === 0
                      ? "#e4e4e4"
                      : "rgba(178, 18, 7, 0.15)";

                  return (
                    <div
                      key={makeSlotKey(date, minute)}
                      className={cn(
                        "flex h-[2.4rem] items-center justify-center rounded-md border transition-[background-color] duration-100",
                        !enabled && "opacity-40",
                      )}
                      style={{ background, borderColor }}
                      title={enabled ? `${count} tilgjengelig` : "Ikke tilgjengelig"}
                    >
                      {enabled && count > 0 && (
                        <span
                          className="text-xs font-bold"
                          style={{
                            color: intensity < 0.45 ? "#b21207" : "#ffffff",
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

      <div className="flex flex-wrap gap-4 border-t border-[#e4e4e4] pt-3.5">
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
      "inline-flex items-center gap-[0.35rem] rounded-full border px-3 py-[0.35rem] text-[0.813rem] font-semibold transition-all duration-100",
      active
        ? "border-[rgba(178,18,7,0.18)] bg-[rgba(178,18,7,0.07)] text-[var(--lego-red-color)]"
        : "border-transparent bg-transparent text-[#6b6b6b] hover:border-[#e4e4e4] hover:bg-[#f0f0f0] hover:text-[#111111]",
    )}
    onClick={onClick}
  >
    {label}
    <span className="inline-flex h-[1.4rem] min-w-[1.4rem] items-center justify-center rounded-full bg-[rgba(0,0,0,0.06)] px-[0.3rem] text-[0.688rem] font-bold">
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
    <span className={scheduleLabelClass}>{label}</span>
    <span className="text-sm font-bold text-[#111111]">{value}</span>
  </div>
);

export default AvailabilityHeatmap;
