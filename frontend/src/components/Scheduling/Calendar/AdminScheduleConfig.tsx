import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check } from "lucide-react";
import { dateRangeDates, formatDateHeader, makeSlotKey } from "../scheduleUtils";
import cn from "src/utils/cn";

const MAX_RANGE_DAYS = 21;

interface TimeValue {
  h: number;
  m: number;
}

interface AdminScheduleConfigProps {
  startDate: string;
  endDate: string;
  onDateRangeChange: (start: string, end: string) => void;
  enabledSlots: Set<string>;
  onSlotsChange: (slots: Set<string>) => void;
  onSave?: () => Promise<void>;
  sessionDuration: number;
  onSessionDurationChange: (duration: number) => void;
  candidateCount: number;
  interviewerCount: number;
}

interface TimeSegmentInputProps {
  value: TimeValue;
  onChange: (v: TimeValue) => void;
  id?: string;
}

const fieldLabelClass =
  "flex items-center whitespace-nowrap border-r border-border-soft bg-surface-muted px-[0.6rem] py-0 text-label font-bold uppercase tracking-label text-text-subtle";

const fieldBodyClass = "flex items-center gap-1 px-2";

const plainInputClass =
  "border-none bg-transparent p-0 text-ui font-semibold text-text-primary focus:text-brand focus:outline-none";

const TimeSegmentInput: React.FC<TimeSegmentInputProps> = ({
  value,
  onChange,
  id,
}) => {
  const minRef = useRef<HTMLInputElement>(null);
  const [hStr, setHStr] = useState(String(value.h).padStart(2, "0"));
  const [mStr, setMStr] = useState(String(value.m).padStart(2, "0"));

  const commitHour = (s: string) => {
    const h = parseInt(s, 10);
    if (!isNaN(h) && h >= 0 && h <= 23) onChange({ h, m: value.m });
  };

  const commitMinute = (s: string) => {
    const m = parseInt(s, 10);
    if (!isNaN(m) && m >= 0 && m <= 59) onChange({ h: value.h, m });
  };

  return (
    <div className="flex items-center gap-px">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hStr}
        placeholder="HH"
        className="w-7 border-none bg-transparent p-0 text-center text-sm font-semibold text-text-primary caret-brand placeholder:text-text-disabled focus:text-brand focus:outline-none"
        onChange={(e) => {
          const s = e.target.value.replace(/\D/g, "").slice(0, 2);
          setHStr(s);
          commitHour(s);
          if (s.length === 2) minRef.current?.focus();
        }}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === ":" || e.key === " ") {
            e.preventDefault();
            minRef.current?.focus();
          }
        }}
      />
      <span className="select-none text-sm font-medium leading-none text-text-disabled">
        :
      </span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={mStr}
        placeholder="MM"
        className="w-7 border-none bg-transparent p-0 text-center text-sm font-semibold text-text-primary caret-brand placeholder:text-text-disabled focus:text-brand focus:outline-none"
        onChange={(e) => {
          const s = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMStr(s);
          commitMinute(s);
        }}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
};

const AdminScheduleConfig: React.FC<AdminScheduleConfigProps> = ({
  startDate,
  endDate,
  onDateRangeChange,
  enabledSlots,
  onSlotsChange,
  onSave,
  sessionDuration,
  onSessionDurationChange,
  candidateCount,
  interviewerCount,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"add" | "remove">("add");
  const [isSaving, setIsSaving] = useState(false);

  const [pendingStart, setPendingStart] = useState<TimeValue>({ h: 8, m: 0 });
  const [pendingEnd, setPendingEnd] = useState<TimeValue>({ h: 18, m: 0 });
  const [pendingDuration, setPendingDuration] = useState(sessionDuration);
  const [durationInput, setDurationInput] = useState(String(sessionDuration));

  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);
  const [draftSlots, setDraftSlots] = useState<Set<string>>(
    () => new Set(enabledSlots),
  );

  const hasPendingChanges =
    localStartDate !== startDate ||
    localEndDate !== endDate ||
    draftSlots.size !== enabledSlots.size ||
    [...draftSlots].some((k) => !enabledSlots.has(k));

  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    setDraftSlots(new Set(enabledSlots));
  }, [startDate, endDate, enabledSlots]);

  const startMinute = pendingStart.h * 60 + pendingStart.m;
  const endMinute = pendingEnd.h * 60 + pendingEnd.m;
  const isInvalidRange = startMinute >= endMinute;

  const dates = React.useMemo(
    () => dateRangeDates(localStartDate, localEndDate).slice(0, MAX_RANGE_DAYS),
    [localStartDate, localEndDate],
  );

  const timeSlots = React.useMemo(() => {
    if (isInvalidRange) return [];
    const slots = [];
    const step = pendingDuration > 0 ? pendingDuration : 60;
    for (let m = startMinute; m < endMinute; m += step) {
      slots.push(m);
    }
    return slots;
  }, [startMinute, endMinute, pendingDuration, isInvalidRange]);

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  };

  const applyToggle = useCallback(
    (date: string, minute: number, mode: "add" | "remove", currentSlots: Set<string>) => {
      const key = makeSlotKey(date, minute);
      const newSlots = new Set(currentSlots);
      if (mode === "add") newSlots.add(key);
      else newSlots.delete(key);
      setDraftSlots(newSlots);
    },
    [],
  );

  const handleMouseDown = (date: string, minute: number) => {
    const key = makeSlotKey(date, minute);
    const newMode = draftSlots.has(key) ? "remove" : "add";
    setDragMode(newMode);
    setIsDragging(true);
    applyToggle(date, minute, newMode, draftSlots);
  };

  const handleMouseEnter = (date: string, minute: number) => {
    if (isDragging) applyToggle(date, minute, dragMode, draftSlots);
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
      onSlotsChange(draftSlots);
      if (localStartDate && localEndDate && localStartDate <= localEndDate) {
        onDateRangeChange(localStartDate, localEndDate);
      }
      onSessionDurationChange(pendingDuration);
      await onSave();
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

  return (
    <div className="flex min-w-0 select-none flex-col gap-2.5">
      <div className="rounded-panel border border-border bg-surface-base p-[0.875rem_1rem]">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-border-soft bg-surface-base">
              <label className={fieldLabelClass}>Intervjuperiode</label>
              <div className={fieldBodyClass}>
                <input
                  type="date"
                  value={localStartDate}
                  className={cn(plainInputClass, "cursor-pointer select-none")}
                  onChange={(e) => setLocalStartDate(e.target.value)}
                />
                <span className="select-none px-[0.1rem] text-xs text-text-disabled">
                  →
                </span>
                <input
                  type="date"
                  value={localEndDate}
                  min={localStartDate}
                  className={cn(plainInputClass, "cursor-pointer select-none")}
                  onChange={(e) => setLocalEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-border-soft bg-surface-base">
              <label className={fieldLabelClass}>Tidsrom</label>
              <div className={fieldBodyClass}>
                <TimeSegmentInput
                  id="start-time"
                  value={pendingStart}
                  onChange={setPendingStart}
                />
                <span className="select-none px-[0.1rem] text-xs text-text-disabled">
                  →
                </span>
                <TimeSegmentInput value={pendingEnd} onChange={setPendingEnd} />
              </div>
            </div>

            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-border-soft bg-surface-base">
              <label className={fieldLabelClass} htmlFor="session-duration">
                Varighet
              </label>
              <div className={fieldBodyClass}>
                <input
                  id="session-duration"
                  type="number"
                  min="5"
                  max="120"
                  step="5"
                  value={durationInput}
                  className="w-10 border-none bg-transparent p-0 text-center text-sm font-semibold text-text-primary [-moz-appearance:textfield] focus:text-brand focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onChange={(e) => {
                    setDurationInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setPendingDuration(val);
                    else if (e.target.value === "") setPendingDuration(0);
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <span className="select-none text-ui font-medium text-text-subtle">
                  min
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {!dateRangeValid && (
              <span className="text-xs font-semibold text-brand">
                Ugyldig datoperiode
              </span>
            )}
            {isInvalidRange && (
              <span className="text-xs font-semibold text-brand">
                Ugyldig tidsrom
              </span>
            )}
            {hasPendingChanges && !isSaving && (
              <span className="text-xs font-semibold italic text-text-faded">
                Ulagrede endringer
              </span>
            )}
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

      <div className="flex items-center justify-end gap-4 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarStat value={String(dates.length)} label="dager" />
          <ToolbarDot />
          <ToolbarStat value={String(draftSlots.size)} label="ledige slots" />
          <ToolbarDot />
          <ToolbarStat value={String(candidateCount)} label="kandidater" />
          <ToolbarDot />
          <ToolbarStat value={String(interviewerCount)} label="intervjuere" />
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

          {timeSlots.length === 0 ? (
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
            timeSlots.map((minute) => (
              <React.Fragment key={minute}>
                <div className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet">
                  {formatTime(minute)}
                </div>
                {dates.map((date) => {
                  const key = makeSlotKey(date, minute);
                  const isEnabled = draftSlots.has(key);
                  return (
                    <div
                      key={key}
                      onMouseDown={() => handleMouseDown(date, minute)}
                      onMouseEnter={() => handleMouseEnter(date, minute)}
                      className={cn(
                        "flex h-9 cursor-pointer items-center justify-center rounded-[5px] border transition-[background-color,border-color] duration-100",
                        isEnabled
                          ? "border-brand bg-brand text-text-white hover:bg-brand-hover"
                          : "border-border-soft bg-surface-base hover:border-brand-panelBorder hover:bg-brand-soft",
                      )}
                    >
                      {isEnabled && <Check size={12} strokeWidth={2.5} />}
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

interface ToolbarStatProps {
  value: string;
  label: string;
}

const ToolbarStat = ({ value, label }: ToolbarStatProps) => (
  <span className="text-label font-bold uppercase tracking-label text-text-faded">
    <strong className="text-ui font-bold normal-case tracking-normal text-text-primary [font-variant-numeric:tabular-nums]">
      {value}
    </strong>{" "}
    {label}
  </span>
);

const ToolbarDot = () => (
  <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-border-muted" />
);

export default AdminScheduleConfig;
