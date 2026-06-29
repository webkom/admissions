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
  formatMinutes,
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
  SaveButton,
  actionButtonBase,
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

const PresetChip: React.FC<{
  value: number;
  unit: string;
  active: boolean;
  onClick: () => void;
}> = ({ value, unit, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "rounded-[10px] border px-4 py-2.5 text-sm font-bold transition-[border-color,background,box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-y-px active:translate-y-0 active:scale-[0.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
      active
        ? "border-brand-activeBorder bg-brand-panel text-text-primary shadow-toggle"
        : "border-border-soft bg-surface-base text-text-muted hover:border-brand-strongBorder hover:text-text-primary",
    )}
  >
    {value}
    <span className="ml-1 text-xs font-semibold opacity-70">{unit}</span>
  </button>
);

const Field: React.FC<{
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}> = ({ icon, label, children }) => (
  <div className="rounded-xl border border-border-soft bg-surface-subtle p-4">
    <SectionLabel icon={icon} label={label} />
    {children}
  </div>
);

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
  onSave,
  onSaveSuccess,
  sessionDuration,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);
  const [saveTick, setSaveTick] = useState(0);

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

  // Shape the saved slots onto the current block grid. A block that overlaps
  // any previously-enabled time is filled completely — half-blocks are never
  // produced, so changing the time format snaps old data to whole blocks.
  const shapedDraftSlots = React.useMemo(() => {
    const next = new Set<string>();
    dates.forEach((date) => {
      chunks.forEach((chunk) => {
        const overlaps = chunk.some((minute) =>
          draftSlots.has(makeSlotKey(date, minute)),
        );
        if (!overlaps) return;
        chunk.forEach((minute) => next.add(makeSlotKey(date, minute)));
      });
    });
    return next;
  }, [dates, draftSlots, chunks]);

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

  const blockToggleMode = (date: string, chunk: number[]): "add" | "remove" =>
    chunk.some((m) => draftSlots.has(makeSlotKey(date, m))) ? "remove" : "add";

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    // Touch pointers capture implicitly on pointerdown; release so cells
    // under the moving finger receive pointerenter during the drag.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const newMode = blockToggleMode(date, chunk);
    setDragMode(newMode);
    setIsDragging(true);
    applyToggle(date, chunk, newMode, draftSlots);
  };

  const handlePointerEnter = (date: string, chunk: number[]) => {
    if (isDragging) applyToggle(date, chunk, dragMode, draftSlots);
  };

  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    applyToggle(date, chunk, blockToggleMode(date, chunk), draftSlots);
  };

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerUp]);

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
      setSaveTick((tick) => tick + 1);
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
    "cursor-pointer rounded-lg border border-border-soft bg-surface-base px-3 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 hover:border-brand-strongBorder focus:border-brand focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-ringSoft";

  return (
    <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[300px_1fr]">
      {/* Settings column */}
      <SchedulePanel>
        <SchedulePanelHeader icon={LayoutPanelTop} title="Rammer" />

        <SchedulePanelBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {/* Intervjuperiode */}
          <Field icon={CalendarDays} label="Intervjuperiode">
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
          </Field>

          <Field icon={Timer} label="Intervjulengde (inkludert pauser mellom)">
            <div className="flex flex-wrap items-center gap-2">
              {DURATION_PRESETS.map((preset) => (
                <PresetChip
                  key={preset}
                  value={preset}
                  unit="min"
                  active={!isCustomDuration && pendingDuration === preset}
                  onClick={() => {
                    setPendingDuration(preset);
                    setIsCustomDuration(false);
                  }}
                />
              ))}
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
          </Field>

          {/* Tidsrom per dag */}
          <Field icon={Clock} label="Tidsrom per dag">
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
          </Field>

          {/* Intervjublokk */}
          <Field icon={Layers} label="Intervjublokk">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-text-primary">
                  Størrelse på blokk
                </span>
                <Stepper
                  value={pendingChunkSize}
                  min={1}
                  max={20}
                  step={1}
                  onStep={setPendingChunkSize}
                  aria-label="Intervjuer per blokk"
                />
              </div>

              <div className="space-y-2 border-t border-border-faint pt-3">
                <span className="block text-sm font-bold text-text-primary">
                  Pause
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {PAUSE_PRESETS.map((preset) => (
                    <PresetChip
                      key={preset}
                      value={preset}
                      unit="min"
                      active={!isCustomPause && pendingChunkBreak === preset}
                      onClick={() => {
                        setPendingChunkBreak(preset);
                        setIsCustomPause(false);
                        setCustomPauseInput("");
                      }}
                    />
                  ))}
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
          </Field>
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
            {onSave && (
              <SaveButton
                isSaving={isSaving}
                saveTick={saveTick}
                onClick={handleSave}
                disabled={
                  pendingDuration === 0 || isInvalidRange || !dateRangeValid
                }
              >
                Lagre
              </SaveButton>
            )}
          </div>
        </SchedulePanelFooter>
      </SchedulePanel>

      {/* Slot grid column */}
      <SchedulePanel>
        <SchedulePanelHeader
          icon={CalendarDays}
          title="Aktive tidsluker"
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
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-label font-bold uppercase tracking-label text-text-subtle">
              Forklaring
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-faded">
              <span className="h-3.5 w-[1.6rem] rounded-[4px] border border-brand bg-brand" />
              Åpen for intervju
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-text-faded">
              <span
                className="h-3.5 w-[1.6rem] rounded-[4px] border border-border-faint opacity-60"
                style={{
                  backgroundImage: "var(--pattern-unavailable)",
                }}
              />
              Stengt
            </span>
          </div>
          <div
            className="grid touch-none gap-[5px]"
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
                timeSlots.every((m) =>
                  shapedDraftSlots.has(makeSlotKey(date, m)),
                );
              const isSomeSelected = timeSlots.some((m) =>
                shapedDraftSlots.has(makeSlotKey(date, m)),
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
                  <div className="flex items-center justify-end pr-2 text-label font-semibold tabular-nums text-text-subtle">
                    {formatMinutes(chunk[0])}
                  </div>
                  {dates.map((date) => {
                    const isEnabled = chunk.some((m) =>
                      shapedDraftSlots.has(makeSlotKey(date, m)),
                    );
                    const { weekday, dayMonth } = formatDateHeader(date);
                    const cellLabel = `${weekday} ${dayMonth} ${formatMinutes(
                      chunk[0],
                    )}–${formatMinutes(
                      chunk[chunk.length - 1] + pendingDuration,
                    )}`;

                    return (
                      <div
                        key={`${date}-${chunkIdx}`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isEnabled}
                        aria-label={cellLabel}
                        onPointerDown={(e) => handlePointerDown(e, date, chunk)}
                        onPointerEnter={() => handlePointerEnter(date, chunk)}
                        onKeyDown={(e) => handleCellKeyDown(e, date, chunk)}
                        className={cn(
                          "flex min-h-[40px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[5px] border p-1.5 transition-[background-color,border-color] duration-100",
                          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                          isEnabled
                            ? "border-brand bg-brand text-text-white hover:bg-brand-hover"
                            : "border-border-faint [background-image:var(--pattern-unavailable)] opacity-60 hover:opacity-100 hover:bg-surface-base hover:border-brand-border",
                        )}
                      >
                        <div className="flex h-1.5 w-full items-center gap-[3px]">
                          {chunk.map((m) => (
                            <div
                              key={m}
                              className={cn(
                                "h-full flex-1 rounded-full",
                                isEnabled
                                  ? "bg-white/55"
                                  : "bg-border-muted/50",
                              )}
                            />
                          ))}
                        </div>
                        {isEnabled && <Check size={12} strokeWidth={2.5} />}
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
