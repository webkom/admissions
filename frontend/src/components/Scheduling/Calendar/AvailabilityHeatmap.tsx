import React, { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { Interviewer } from "../types";
import {
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SegmentedControl,
  CustomSelect,
} from "../ui";

interface AvailabilityHeatmapProps {
  interviewers: Interviewer[];
  availableSlots: Set<string>;
  dates: string[];
  dayStartMinute?: number;
  dayEndMinute?: number;
  sessionDuration: number;
}

type FilterMode = "all" | "male" | "female" | "people";

const AvailabilityHeatmap: React.FC<AvailabilityHeatmapProps> = ({
  interviewers,
  availableSlots,
  dates,
  dayStartMinute = 8 * 60,
  dayEndMinute = 18 * 60,
  sessionDuration,
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedIndividual, setSelectedIndividual] = useState<string | null>(
    null,
  );

  const step = sessionDuration > 0 ? sessionDuration : 60;
  const startMinute = dayStartMinute;
  const endMinute = dayEndMinute;

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, step]);

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
        const { dayIndex, minute } = decodeScheduleTime(slot, sessionDuration);
        const date = dates[dayIndex];
        if (!date) return;
        const key = makeSlotKey(date, minute);
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });

    return counts;
  }, [filteredInterviewers, dates, sessionDuration]);

  const maxCount = useMemo(
    () => Math.max(1, ...Array.from(slotAvailability.values())),
    [slotAvailability],
  );

  const getHeatIntensity = (date: string, minute: number): number => {
    const count = slotAvailability.get(makeSlotKey(date, minute)) || 0;
    return count / maxCount;
  };

  const getAvailableCount = (date: string, minute: number): number =>
    slotAvailability.get(makeSlotKey(date, minute)) || 0;

  const isSlotEnabled = (date: string, minute: number): boolean =>
    availableSlots.has(makeSlotKey(date, minute));

  const getHeatPercent = (intensity: number) => Math.round(24 + intensity * 66);

  const getHeatBackground = (enabled: boolean, intensity: number) => {
    if (!enabled) return "var(--color-surface-base)";
    if (intensity === 0) return "var(--color-surface-base)";
    return `color-mix(in oklch, var(--color-brand) ${getHeatPercent(intensity)}%, var(--color-surface-base))`;
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
    <SchedulePanel className="min-w-0">
      <SchedulePanelHeader
        icon={BarChart3}
        title="Fordeling av tilgjengelighet"
        actions={
          <div className="flex items-center gap-2">
            <label
              className="text-detail font-medium text-text-muted"
              htmlFor="person-filter"
            >
              Person
            </label>
            <CustomSelect
              id="person-filter"
              value={selectedIndividual || ""}
              className="min-w-44"
              placeholder="Velg person…"
              onChange={(v) => {
                const value = v || null;
                setSelectedIndividual(value);
                setFilterMode(value ? "people" : "all");
              }}
              options={[
                { value: "", label: "Velg person…" },
                ...interviewers.map((interviewer) => ({
                  value: interviewer.id,
                  label: interviewer.name,
                })),
              ]}
            />
          </div>
        }
      />

      <SchedulePanelBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl<"all" | "male" | "female">
            aria-label="Filtrer tilgjengelighet etter kjønn"
            value={
              filterMode === "all" ||
              filterMode === "male" ||
              filterMode === "female"
                ? filterMode
                : ("all" as const)
            }
            onChange={(next) => setMode(next)}
            items={[
              {
                key: "all",
                label: "Alle",
                count: interviewers.length,
              },
              {
                key: "male",
                label: "Menn",
                count: interviewers.filter((i) => i.gender === "M").length,
              },
              {
                key: "female",
                label: "Kvinner",
                count: interviewers.filter((i) => i.gender === "F").length,
              },
            ]}
          />

          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <div>
              <span className="mb-1.5 block text-detail font-medium text-text-muted">
                Tilgjengelighet
              </span>
              <div className="flex items-center gap-1">
                {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
                  <div
                    key={intensity}
                    className="h-3 w-6 rounded-sm border"
                    style={{
                      background: getHeatBackground(true, intensity),
                      borderColor: getHeatBorder(true, intensity),
                    }}
                  />
                ))}
                <span className="ml-1.5 text-xs font-semibold text-text-faded">
                  0 til {maxCount}
                </span>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-detail font-medium text-text-muted">
                Forklaring
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-faded">
                  <span
                    className="h-3 w-6 rounded-sm border"
                    style={{
                      background: getHeatBackground(true, 0),
                      borderColor: getHeatBorder(true, 0),
                    }}
                  />
                  Ingen ledige
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-text-faded">
                  <span
                    className="h-3 w-6 rounded-sm border border-border-soft opacity-60"
                    style={{
                      backgroundImage: "var(--pattern-unavailable)",
                      backgroundColor: "var(--color-surface-base)",
                    }}
                  />
                  Ikke tilgjengelig
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
          <div
            className="grid gap-1"
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
                    "flex min-h-9 items-center justify-center rounded-md border border-border bg-surface-base text-detail font-semibold text-text-muted",
                    "flex-col gap-0.5",
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
                <div className="flex items-center justify-end pr-2 text-label font-semibold tabular-nums text-text-subtle">
                  {formatMinutes(minute)}
                </div>
                {dates.map((date) => {
                  const enabled = isSlotEnabled(date, minute);
                  const intensity = getHeatIntensity(date, minute);
                  const count = getAvailableCount(date, minute);
                  const cellTitle = enabled
                    ? `${formatDateHeader(date).weekday} ${
                        formatDateHeader(date).dayMonth
                      } klokken ${formatMinutes(minute)}: ${count} tilgjengelige`
                    : `${formatDateHeader(date).weekday} ${
                        formatDateHeader(date).dayMonth
                      } klokken ${formatMinutes(minute)}: stengt`;

                  return (
                    <div
                      key={makeSlotKey(date, minute)}
                      role="img"
                      tabIndex={0}
                      aria-label={cellTitle}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-md border transition-[background-color] duration-100 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus",
                        !enabled && "opacity-60",
                      )}
                      style={{
                        backgroundColor: getHeatBackground(enabled, intensity),
                        backgroundImage: !enabled
                          ? "var(--pattern-unavailable)"
                          : undefined,
                        borderColor: getHeatBorder(enabled, intensity),
                      }}
                      title={cellTitle}
                    >
                      {enabled && count > 0 && (
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{
                            color:
                              intensity < 0.55
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
      </SchedulePanelBody>
    </SchedulePanel>
  );
};

export default AvailabilityHeatmap;
