import React, { useState, useEffect, useCallback } from "react";
import {
  CalendarDays,
  Check,
  Clock,
  Timer,
  Layers,
  LayoutPanelTop,
} from "lucide-react";
import {
  buildBlockTimeChunks,
  buildBlockTimeSlots,
  dateRangeDates,
  enabledWindowsToSlots,
  formatDateHeader,
  makeSlotKey,
  normalizeEnabledWindows,
  parseSlotKey,
  slotsToEnabledWindows,
} from "../scheduleUtils";
import cn from "src/utils/cn";
import {
  Stepper,
  TimeSegmentInput,
  type TimeValue,
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  actionButtonBase,
  actionButtonPrimary,
  actionButtonGhost,
} from "../ui";
import type { EnabledWindow } from "../types";

const MAX_RANGE_DAYS = 21;
const DURATION_PRESETS = [15, 20, 30] as const;
const PAUSE_PRESETS = [30, 60] as const;

const SectionLabel: React.FC<{
  icon: React.ElementType;
  label: string;
}> = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-1.5 pb-2">
    <Icon size={12} className="text-text-subtle" />
    <span className="text-xs font-bold uppercase tracking-wide text-text-subtle">
      {label}
    </span>
  </div>
);

const Divider = () => <hr className="border-t border-border-faint" />;

const parseSlotDate = (key: string) => parseSlotKey(key).date;

interface AdminScheduleConfigProps {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  hasScheduleDraft?: boolean;
  lastSavedAt?: string;
  onSave?: (config: ScheduleConfigInput) => Promise<void>;
  onSaveSuccess?: () => void;
  sessionDuration: number;
}

export interface ScheduleConfigInput {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: string[];
  enabledWindows: EnabledWindow[];
  sessionDuration: number;
}

const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  startDate,
  endDate,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  enabledWindows,
  enabledSlots,
  hasScheduleDraft = false,
  lastSavedAt,
  onSave,
  onSaveSuccess,
  sessionDuration,
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
    !DURATION_PRESETS.includes(
      sessionDuration as (typeof DURATION_PRESETS)[number],
    ),
  );

  const [pendingChunkSize, setPendingChunkSize] = useState(chunkSize);
  const [pendingChunkBreak, setPendingChunkBreak] = useState(chunkBreakMinutes);
  const [customPauseInput, setCustomPauseInput] = useState("");
  const [isCustomPause, setIsCustomPause] = useState(false);

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const [draftWindows, setDraftWindows] = useState<EnabledWindow[]>(() =>
    normalizeEnabledWindows(
      enabledWindows.length > 0
        ? enabledWindows
        : slotsToEnabledWindows(enabledSlots, sessionDuration),
    ),
  );

  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    setDraftWindows(
      normalizeEnabledWindows(
        enabledWindows.length > 0
          ? enabledWindows
          : slotsToEnabledWindows(enabledSlots, sessionDuration),
      ),
    );
  }, [startDate, endDate, enabledSlots, enabledWindows, sessionDuration]);

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
    const isPreset = PAUSE_PRESETS.includes(
      chunkBreakMinutes as (typeof PAUSE_PRESETS)[number],
    );
    setIsCustomPause(!isPreset);
    if (!isPreset) setCustomPauseInput(String(chunkBreakMinutes));
  }, [chunkBreakMinutes]);

  const startMinute = pendingStart.h * 60 + pendingStart.m;
  const endMinute = pendingEnd.h * 60 + pendingEnd.m;
  const isInvalidRange = startMinute >= endMinute;
  const draftSlots = React.useMemo(
    () => new Set(enabledWindowsToSlots(draftWindows, pendingDuration)),
    [draftWindows, pendingDuration],
  );
  const normalizedEnabledWindows = React.useMemo(
    () =>
      normalizeEnabledWindows(
        enabledWindows.length > 0
          ? enabledWindows
          : slotsToEnabledWindows(enabledSlots, sessionDuration),
      ),
    [enabledSlots, enabledWindows, sessionDuration],
  );
  const blockShapeChange =
    pendingChunkBreak !== chunkBreakMinutes ||
    ((pendingChunkBreak > 0 || chunkBreakMinutes > 0) &&
      pendingChunkSize !== chunkSize);

  const dates = React.useMemo(
    () => dateRangeDates(localStartDate, localEndDate).slice(0, MAX_RANGE_DAYS),
    [localStartDate, localEndDate],
  );

  const timeSlots = React.useMemo(() => {
    if (isInvalidRange) return [];
    return buildBlockTimeSlots({
      dayStartMinute: startMinute,
      dayEndMinute: endMinute,
      sessionDuration: pendingDuration,
      chunkSize: pendingChunkSize,
      chunkBreakMinutes: pendingChunkBreak,
    });
  }, [
    startMinute,
    endMinute,
    pendingDuration,
    pendingChunkSize,
    pendingChunkBreak,
    isInvalidRange,
  ]);

  const shapedDraftSlots = React.useMemo(() => {
    const next = new Set<string>();
    dates.forEach((date) => {
      timeSlots.forEach((minute) => {
        const key = makeSlotKey(date, minute);
        if (draftSlots.has(key)) next.add(key);
      });
    });
    return next;
  }, [dates, draftSlots, timeSlots]);

  const normalizedDraftWindows = React.useMemo(
    () => slotsToEnabledWindows(shapedDraftSlots, pendingDuration),
    [pendingDuration, shapedDraftSlots],
  );

  const hasPendingChanges =
    localStartDate !== startDate ||
    localEndDate !== endDate ||
    pendingDuration !== sessionDuration ||
    pendingChunkSize !== chunkSize ||
    pendingChunkBreak !== chunkBreakMinutes ||
    startMinute !== dayStartMinute ||
    endMinute !== dayEndMinute ||
    JSON.stringify(normalizedDraftWindows) !==
      JSON.stringify(normalizedEnabledWindows);
  const gridDefiningChange =
    localStartDate !== startDate ||
    localEndDate !== endDate ||
    pendingDuration !== sessionDuration ||
    blockShapeChange ||
    startMinute !== dayStartMinute ||
    endMinute !== dayEndMinute ||
    JSON.stringify(normalizedDraftWindows) !==
      JSON.stringify(normalizedEnabledWindows);
  const visualGroupingChange =
    pendingChunkSize !== chunkSize && !blockShapeChange;

  const chunks = React.useMemo(() => {
    if (isInvalidRange) return [];
    return buildBlockTimeChunks({
      dayStartMinute: startMinute,
      dayEndMinute: endMinute,
      sessionDuration: pendingDuration,
      chunkSize: pendingChunkSize,
      chunkBreakMinutes: pendingChunkBreak,
    });
  }, [
    startMinute,
    endMinute,
    pendingDuration,
    pendingChunkSize,
    pendingChunkBreak,
    isInvalidRange,
  ]);

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
      setDraftWindows(slotsToEnabledWindows(newSlots, pendingDuration));
    },
    [pendingDuration],
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
        enabledSlots: enabledWindowsToSlots(
          normalizedDraftWindows,
          pendingDuration,
        ),
        enabledWindows: normalizedDraftWindows,
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
    Array.from(newSlots).forEach((key) => {
      if (parseSlotDate(key) === date) newSlots.delete(key);
    });
    timeSlots.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    setDraftWindows(slotsToEnabledWindows(newSlots, pendingDuration));
  };

  const clearAllForDay = (date: string) => {
    const newSlots = new Set(draftSlots);
    Array.from(newSlots).forEach((key) => {
      if (parseSlotDate(key) === date) newSlots.delete(key);
    });
    setDraftWindows(slotsToEnabledWindows(newSlots, pendingDuration));
  };

  const selectAll = () => {
    const newSlots = new Set<string>();
    dates.forEach((date) => {
      timeSlots.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    });
    setDraftWindows(slotsToEnabledWindows(newSlots, pendingDuration));
  };

  const clearAll = () => setDraftWindows([]);

  const dateRangeValid =
    localStartDate && localEndDate && localStartDate <= localEndDate;
  const columns = dates.length + 1;

  const dateInputClass =
    "cursor-pointer rounded-lg border border-border-soft bg-surface-base px-3 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus:border-brand focus:outline-none focus:shadow-[0_0_0_3px_var(--color-brand-ring)]";

  return (
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[300px_1fr]">
      {/* ───── Settings column ───── */}
      <SchedulePanel>
        <SchedulePanelHeader
          icon={LayoutPanelTop}
          eyebrow="Admin · Oppsett"
          title="Rammer"
        />

        <SchedulePanelBody className="space-y-4">
          {/* Date range + Time range */}
          <div className="space-y-3">
            <SectionLabel icon={CalendarDays} label="Intervjuperiode" />
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="period-start"
                type="date"
                value={localStartDate}
                className={dateInputClass}
                onChange={(e) => setLocalStartDate(e.target.value)}
              />
              <span className="select-none text-sm text-text-disabled">→</span>
              <input
                type="date"
                value={localEndDate}
                min={localStartDate}
                className={dateInputClass}
                onChange={(e) => setLocalEndDate(e.target.value)}
              />
              {!dateRangeValid && (
                <span className="text-xs font-semibold text-brand">
                  Ugyldig periode
                </span>
              )}
            </div>

            <SectionLabel icon={Clock} label="Tidsrom per dag" />
            <div className="flex flex-wrap items-center gap-2">
              <TimeSegmentInput
                id="start-time"
                value={pendingStart}
                onChange={setPendingStart}
              />
              <span className="select-none text-sm text-text-disabled">→</span>
              <TimeSegmentInput value={pendingEnd} onChange={setPendingEnd} />
              {isInvalidRange && (
                <span className="text-xs font-semibold text-brand">
                  Ugyldig tidsrom
                </span>
              )}
            </div>
          </div>

          <Divider />

          {/* Duration */}
          <div className="space-y-2">
            <SectionLabel icon={Timer} label="Intervjulengde" />
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
          </div>

          <Divider />

          {/* Chunk config */}
          <div className="space-y-2">
            <SectionLabel icon={Layers} label="Intervjublokk" />

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-sm font-bold text-text-primary">
                  Størrelse på blokk
                </span>
                <span className="ml-1.5 text-xs text-text-muted">
                  antall intervju "på rad" før pause
                </span>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-text-primary">
                    Pause
                  </span>
                  <span className="ml-1.5 text-xs text-text-muted">
                    mellom blokker
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {PAUSE_PRESETS.map((preset) => {
                  const active = !isCustomPause && pendingChunkBreak === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setPendingChunkBreak(preset);
                        setIsCustomPause(false);
                        setCustomPauseInput("");
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
                    isCustomPause
                      ? "border-brand-activeBorder bg-brand-panel shadow-toggle"
                      : "border-border-soft bg-surface-base hover:border-brand-strongBorder",
                  )}
                >
                  <input
                    type="number"
                    min="0"
                    max="240"
                    step="1"
                    placeholder="Egendefinert"
                    value={isCustomPause ? customPauseInput : ""}
                    className="w-24 border-none bg-transparent p-0 text-sm font-bold text-text-primary [-moz-appearance:textfield] placeholder:font-normal placeholder:text-text-disabled focus:text-brand focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    onChange={(e) => {
                      setCustomPauseInput(e.target.value);
                      setIsCustomPause(true);
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 0) setPendingChunkBreak(val);
                    }}
                    onFocus={() => setIsCustomPause(true)}
                  />
                  <span className="select-none text-xs font-semibold text-text-subtle">
                    min
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SchedulePanelBody>

        <SchedulePanelFooter>
          <div className="flex flex-col gap-2">
            {hasPendingChanges && (
              <div className="max-w-[18rem] text-detail leading-snug text-text-muted">
                {gridDefiningChange && hasScheduleDraft
                  ? "Endringen påvirker tidsgrunnlaget og nullstiller eksisterende intervjuforslag."
                  : gridDefiningChange
                    ? "Endringen remapper tilgjengelighet til de nye tidslukene."
                    : visualGroupingChange
                      ? "Endringen påvirker bare hvordan tidslukene grupperes visuelt."
                      : "Konfigurasjonen har ulagrede endringer."}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hasPendingChanges && !isSaving && (
              <span className="rounded-full border border-brand-border bg-brand-muted px-2.5 py-1 text-label font-bold uppercase tracking-caps text-brand">
                Ulagrede endringer
              </span>
            )}
            {!hasPendingChanges && lastSavedAt && !isSaving && (
              <span className="rounded-full border border-success-border bg-success-bg px-2.5 py-1 text-label font-bold uppercase tracking-caps text-success">
                Lagret kl. {lastSavedAt}
              </span>
            )}
            {onSave && (
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonPrimary)}
                onClick={handleSave}
                disabled={
                  isSaving ||
                  pendingDuration === 0 ||
                  isInvalidRange ||
                  !dateRangeValid
                }
              >
                {isSaving ? "Lagrer..." : "Lagre"}
              </button>
            )}
          </div>
        </SchedulePanelFooter>
      </SchedulePanel>

      {/* ───── Slot grid column ───── */}
      <SchedulePanel>
        <SchedulePanelHeader
          icon={CalendarDays}
          eyebrow="Admin · Slotter"
          title="Aktive tidslommer"
          description="Klikk og dra for å åpne eller stenge intervjublokker."
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  actionButtonBase,
                  actionButtonGhost,
                  "px-3 py-1.5",
                )}
                onClick={selectAll}
              >
                Velg alle
              </button>
              <button
                type="button"
                className={cn(
                  actionButtonBase,
                  actionButtonGhost,
                  "px-3 py-1.5",
                )}
                onClick={clearAll}
              >
                Tøm alle
              </button>
            </div>
          }
        />
        <div className="min-w-0 select-none overflow-x-auto bg-surface-muted p-5 handheld:p-4">
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
                          input.indeterminate =
                            isSomeSelected && !isAllSelected;
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
      </SchedulePanel>
    </div>
  );
};

export default AdminScheduleConfig;
