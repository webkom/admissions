import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  Timer,
  Layers,
} from "lucide-react";
import { dateRangeDates, formatDateHeader, makeSlotKey } from "../scheduleUtils";
import cn from "src/utils/cn";
import {
  Stepper,
  TimeSegmentInput,
  type TimeValue,
  sectionLabelClass,
} from "../ui";

const MAX_RANGE_DAYS = 21;

const DURATION_PRESETS = [15, 20, 30] as const;

interface AdminScheduleConfigProps {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: Set<string>;
  onSave?: (config: ScheduleConfigInput) => Promise<void>;
  onSaveSuccess?: () => void;
  sessionDuration: number;
  candidateCount: number;
  interviewerCount: number;
}

export interface ScheduleConfigInput {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: string[];
  sessionDuration: number;
}


const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  startDate,
  endDate,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  enabledSlots,
  onSave,
  onSaveSuccess,
  sessionDuration,
  candidateCount,
  interviewerCount,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);

  const [pendingStart, setPendingStart] = useState<TimeValue>({
    h: Math.floor(dayStartMinute / 60),
    m: dayStartMinute % 60,
  });
  const [pendingEnd, setPendingEnd] = useState<TimeValue>({
    h: Math.floor(dayEndMinute / 60),
    m: dayEndMinute % 60,
  });
  const [pendingDuration, setPendingDuration] = useState(sessionDuration);
  const [customDurationInput, setCustomDurationInput] = useState("");
  const [isCustomDuration, setIsCustomDuration] = useState(
    !DURATION_PRESETS.includes(sessionDuration as (typeof DURATION_PRESETS)[number]),
  );

  const [pendingChunkSize, setPendingChunkSize] = useState(chunkSize);
  const [pendingChunkBreak, setPendingChunkBreak] = useState(chunkBreakMinutes);

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const [draftSlots, setDraftSlots] = useState<Set<string>>(
    () => new Set(enabledSlots),
  );

  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    setDraftSlots(new Set(enabledSlots));
  }, [startDate, endDate, enabledSlots]);

  useEffect(() => {
    setPendingStart({
      h: Math.floor(dayStartMinute / 60),
      m: dayStartMinute % 60,
    });
    setPendingEnd({
      h: Math.floor(dayEndMinute / 60),
      m: dayEndMinute % 60,
    });
  }, [dayEndMinute, dayStartMinute]);

  useEffect(() => {
    setPendingDuration(sessionDuration);
    const isPreset = DURATION_PRESETS.includes(
      sessionDuration as (typeof DURATION_PRESETS)[number],
    );
    setIsCustomDuration(!isPreset);
    if (!isPreset) setCustomDurationInput(String(sessionDuration));
  }, [sessionDuration]);

  useEffect(() => {
    setPendingChunkSize(chunkSize);
  }, [chunkSize]);

  useEffect(() => {
    setPendingChunkBreak(chunkBreakMinutes);
  }, [chunkBreakMinutes]);

  const startMinute = pendingStart.h * 60 + pendingStart.m;
  const endMinute = pendingEnd.h * 60 + pendingEnd.m;
  const isInvalidRange = startMinute >= endMinute;
  const hasPendingChanges =
    localStartDate !== startDate ||
    localEndDate !== endDate ||
    pendingDuration !== sessionDuration ||
    pendingChunkSize !== chunkSize ||
    pendingChunkBreak !== chunkBreakMinutes ||
    startMinute !== dayStartMinute ||
    endMinute !== dayEndMinute ||
    draftSlots.size !== enabledSlots.size ||
    [...draftSlots].some((k) => !enabledSlots.has(k));

  const dates = React.useMemo(
    () => dateRangeDates(localStartDate, localEndDate).slice(0, MAX_RANGE_DAYS),
    [localStartDate, localEndDate],
  );

  const timeSlots = React.useMemo(() => {
    if (isInvalidRange) return [];
    const slots = [];
    const step = pendingDuration > 0 ? pendingDuration : 60;

    let currentMinute = startMinute;
    while (currentMinute < endMinute) {
      for (let i = 0; i < pendingChunkSize && currentMinute < endMinute; i++) {
        slots.push(currentMinute);
        currentMinute += step;
      }
      currentMinute += pendingChunkBreak;
    }
    return slots;
  }, [
    startMinute,
    endMinute,
    pendingDuration,
    isInvalidRange,
    pendingChunkSize,
    pendingChunkBreak,
  ]);

  const chunks = React.useMemo(() => {
    const res = [];
    for (let i = 0; i < timeSlots.length; i += pendingChunkSize) {
      res.push(timeSlots.slice(i, i + pendingChunkSize));
    }
    return res;
  }, [timeSlots, pendingChunkSize]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const applyToggle = useCallback(
    (
      date: string,
      chunk: number[],
      mode: "add" | "remove",
      currentSlots: Set<string>,
    ) => {
      const newSlots = new Set(currentSlots);
      chunk.forEach((minute) => {
        const key = makeSlotKey(date, minute);
        if (mode === "add") newSlots.add(key);
        else newSlots.delete(key);
      });
      setDraftSlots(newSlots);
    },
    [],
  );

  const handleMouseDown = (date: string, chunk: number[]) => {
    const isAnyEnabled = chunk.some((m) =>
      draftSlots.has(makeSlotKey(date, m)),
    );
    const newMode = isAnyEnabled ? "remove" : "add";
    setDragMode(newMode);
    setIsDragging(true);
    applyToggle(date, chunk, newMode, draftSlots);
  };

  const handleMouseEnter = (date: string, chunk: number[]) => {
    if (isDragging) applyToggle(date, chunk, dragMode, draftSlots);
  };

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  const handleSave = async () => {
    if (!onSave || pendingDuration === 0 || isInvalidRange) return;
    setIsSaving(true);
    try {
      const nextConfig = {
        startDate: localStartDate,
        endDate: localEndDate,
        dayStartMinute: startMinute,
        dayEndMinute: endMinute,
        chunkSize: pendingChunkSize,
        chunkBreakMinutes: pendingChunkBreak,
        enabledSlots: Array.from(draftSlots),
        sessionDuration: pendingDuration,
      };
      await onSave(nextConfig);
      onSaveSuccess?.();
    } finally {
      setIsSaving(false);
    }
  };

  const selectAllForDay = (date: string) => {
    const newSlots = new Set(draftSlots);
    timeSlots.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    setDraftSlots(newSlots);
  };

  const clearAllForDay = (date: string) => {
    const newSlots = new Set(draftSlots);
    timeSlots.forEach((m) => newSlots.delete(makeSlotKey(date, m)));
    setDraftSlots(newSlots);
  };

  const selectAll = () => {
    const newSlots = new Set<string>();
    dates.forEach((date) => {
      timeSlots.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    });
    setDraftSlots(newSlots);
  };

  const clearAll = () => setDraftSlots(new Set());

  const dateRangeValid =
    localStartDate && localEndDate && localStartDate <= localEndDate;
  const columns = dates.length + 1;

  const dateInputClass =
    "cursor-pointer rounded-lg border border-border-soft bg-surface-base px-3 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus:border-brand focus:outline-none focus:shadow-[0_0_0_3px_var(--color-brand-ring)]";

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="rounded-panel border border-border bg-surface-base">
        {/* Header */}
        <div className="rounded-t-panel px-6 pb-5 pt-6">
          <header className="mb-6">
            <h2 className="m-0 text-[15px] font-bold text-text-primary">
              Rammer for intervjuperioden
            </h2>
            <p className="m-0 mt-1 max-w-[40rem] text-ui leading-relaxed text-text-muted">
              Definer datoperiode, daglig tidsrom og intervjustruktur. Aktiver
              deretter individuelle tidslommer i kartet nedenfor.
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Date range */}
            <section>
              <span className={sectionLabelClass}>
                <CalendarDays
                  size={11}
                  className="mr-1 inline-block align-[-1px]"
                />
                Intervjuperiode
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="period-start"
                  type="date"
                  value={localStartDate}
                  className={dateInputClass}
                  onChange={(e) => setLocalStartDate(e.target.value)}
                />
                <span className="select-none text-sm text-text-disabled">
                  →
                </span>
                <input
                  type="date"
                  value={localEndDate}
                  min={localStartDate}
                  className={dateInputClass}
                  onChange={(e) => setLocalEndDate(e.target.value)}
                />
                {!dateRangeValid && (
                  <span className="text-xs font-semibold text-brand">
                    Ugyldig datoperiode
                  </span>
                )}
              </div>
            </section>

            {/* Time range */}
            <section>
              <span className={sectionLabelClass}>
                <Clock size={11} className="mr-1 inline-block align-[-1px]" />
                Tidsrom per dag
              </span>
              <div className="flex items-center gap-2">
                <TimeSegmentInput
                  id="start-time"
                  value={pendingStart}
                  onChange={setPendingStart}
                />
                <span className="select-none text-sm text-text-disabled">
                  →
                </span>
                <TimeSegmentInput
                  value={pendingEnd}
                  onChange={setPendingEnd}
                />
                {isInvalidRange && (
                  <span className="text-xs font-semibold text-brand">
                    Ugyldig tidsrom
                  </span>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          {/* Duration presets */}
          <section className="mb-5">
            <span className={sectionLabelClass}>
              <Timer size={11} className="mr-1 inline-block align-[-1px]" />
              Intervjulengde
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {DURATION_PRESETS.map((preset) => {
                const active = !isCustomDuration && pendingDuration === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setPendingDuration(preset);
                      setIsCustomDuration(false);
                    }}
                    className={cn(
                      "rounded-[10px] border px-4 py-2.5 text-sm font-bold transition-[border-color,background,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-brand-strongBorder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                      active
                        ? "border-brand-activeBorder bg-brand-panel shadow-toggle text-text-primary"
                        : "border-border-soft bg-surface-base text-text-muted hover:text-text-primary",
                    )}
                  >
                    {preset}
                    <span className="ml-1 text-xs font-semibold opacity-70">
                      min
                    </span>
                  </button>
                );
              })}
              <div
                className={cn(
                  "inline-flex cursor-text items-center gap-1.5 rounded-[10px] border px-3 py-2 transition-[border-color,background,box-shadow] duration-150",
                  isCustomDuration
                    ? "border-brand-activeBorder bg-brand-panel shadow-toggle"
                    : "border-border-soft bg-surface-base hover:border-brand-strongBorder",
                )}
              >
                <input
                  type="number"
                  min="5"
                  max="120"
                  step="5"
                  placeholder="Egendefinert"
                  value={isCustomDuration ? customDurationInput : ""}
                  className="w-24 border-none bg-transparent p-0 text-sm font-bold text-text-primary [-moz-appearance:textfield] placeholder:font-normal placeholder:text-text-disabled focus:text-brand focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onChange={(e) => {
                    setCustomDurationInput(e.target.value);
                    setIsCustomDuration(true);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) setPendingDuration(val);
                  }}
                  onFocus={() => setIsCustomDuration(true)}
                />
                <span className="select-none text-xs font-semibold text-text-subtle">
                  min
                </span>
              </div>
            </div>
          </section>

          {/* Chunk structure */}
          <section className="mb-5">
            <span className={sectionLabelClass}>
              <Layers size={11} className="mr-1 inline-block align-[-1px]" />
              Intervjublokk (Inkludert tid man trenger etter intervju)
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border-soft bg-surface-muted px-4 py-3">
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-text-primary">
                    Intervjuer per blokk
                  </span>
                  <p className="m-0 mt-0.5 text-detail leading-snug text-text-muted">
                    Antall slotter på rad før pause.
                  </p>
                </div>
                <Stepper
                  value={pendingChunkSize}
                  min={1}
                  max={20}
                  step={1}
                  onStep={setPendingChunkSize}
                  aria-label="Intervjuer per blokk"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border-soft bg-surface-muted px-4 py-3">
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-text-primary">
                    Pause mellom blokker
                  </span>
                  <p className="m-0 mt-0.5 text-detail leading-snug text-text-muted">
                    Minutter fri etter hver blokk.
                  </p>
                </div>
                <Stepper
                  value={pendingChunkBreak}
                  min={0}
                  max={240}
                  step={5}
                  onStep={setPendingChunkBreak}
                  unit="min"
                  aria-label="Pause mellom blokker"
                />
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className="cursor-pointer rounded-md border border-border bg-surface-base px-3 py-1.5 text-ui font-semibold text-brand transition-[border-color,background,color] duration-150 hover:border-brand-strongBorder hover:bg-brand-soft hover:text-brand-dark"
                onClick={selectAll}
              >
                Velg alle
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-md border border-border bg-surface-base px-3 py-1.5 text-ui font-semibold text-brand transition-[border-color,background,color] duration-150 hover:border-brand-strongBorder hover:bg-brand-soft hover:text-brand-dark"
                onClick={clearAll}
              >
                Tøm alle
              </button>
            </div>

            <div className="flex items-center gap-3">
              {hasPendingChanges && !isSaving && (
                <span className="text-xs font-semibold italic text-text-faded">
                  Ulagrede endringer
                </span>
              )}
              {onSave && (
                <button
                  type="button"
                  className="cursor-pointer whitespace-nowrap rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleSave}
                  disabled={
                    isSaving ||
                    pendingDuration === 0 ||
                    isInvalidRange ||
                    !dateRangeValid
                  }
                >
                  {isSaving ? "Lagrer..." : "Lagre oppsett"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Slot grid */}
      <div className="min-w-0 select-none overflow-x-auto rounded-lg border border-border bg-surface-muted p-3">
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
            const isAllSelected =
              timeSlots.length > 0 &&
              timeSlots.every((m) => draftSlots.has(makeSlotKey(date, m)));
            const isSomeSelected = timeSlots.some((m) =>
              draftSlots.has(makeSlotKey(date, m)),
            );

            return (
              <div
                key={date}
                className="flex flex-col items-center gap-1 rounded-md border border-border-soft bg-surface-base px-1 py-2"
              >
                <div className="text-center text-label font-bold uppercase tracking-label text-text-muted">
                  {weekday}
                </div>
                <div className="text-center text-ui font-bold text-text-primary">
                  {dayMonth}
                </div>
                <label className="flex cursor-pointer items-center gap-1 text-label font-semibold text-text-subtle">
                  <input
                    type="checkbox"
                    disabled={timeSlots.length === 0}
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = isSomeSelected && !isAllSelected;
                      }
                    }}
                    onChange={() => {
                      if (isAllSelected) clearAllForDay(date);
                      else selectAllForDay(date);
                    }}
                  />
                  Alle
                </label>
              </div>
            );
          })}

          {chunks.length === 0 ? (
            <div
              className={cn(
                "text-label font-bold uppercase tracking-label text-text-subtle",
                "col-[1/-1] px-4 py-10 text-center text-text-disabled",
              )}
            >
              {dates.length === 0
                ? "Velg en datoperiode for å se tidsplanen."
                : "Ingen slotter — endre tidsrom og lagre."}
            </div>
          ) : (
            chunks.map((chunk, chunkIdx) => (
              <React.Fragment key={chunkIdx}>
                <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                  {formatTime(chunk[0])}
                </div>
                {dates.map((date) => {
                  const enabledInChunk = chunk.filter((m) =>
                    draftSlots.has(makeSlotKey(date, m)),
                  );
                  const isAllEnabled = enabledInChunk.length === chunk.length;
                  const isSomeEnabled = enabledInChunk.length > 0;

                  return (
                    <div
                      key={`${date}-${chunkIdx}`}
                      onMouseDown={() => handleMouseDown(date, chunk)}
                      onMouseEnter={() => handleMouseEnter(date, chunk)}
                      className={cn(
                        "flex min-h-[40px] cursor-pointer flex-col gap-[2px] rounded-[5px] border p-1 transition-[background-color,border-color] duration-100",
                        isAllEnabled
                          ? "border-brand bg-brand text-text-white hover:bg-brand-hover"
                          : isSomeEnabled
                            ? "border-brand-activeBorder bg-brand-soft hover:bg-brand-muted"
                            : "border-border-soft bg-surface-base hover:border-brand-panelBorder hover:bg-brand-soft",
                      )}
                    >
                      <div className="flex flex-1 flex-wrap gap-[2px]">
                        {chunk.map((m) => (
                          <div
                            key={m}
                            className={cn(
                              "h-1 flex-1 rounded-[1px]",
                              draftSlots.has(makeSlotKey(date, m))
                                ? isAllEnabled
                                  ? "bg-white/40"
                                  : "bg-brand"
                                : "bg-border-faint",
                            )}
                          />
                        ))}
                      </div>
                      {isAllEnabled && (
                        <div className="flex flex-1 items-center justify-center">
                          <Check size={12} strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminScheduleConfig;
