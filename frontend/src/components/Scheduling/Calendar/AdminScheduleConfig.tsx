import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check } from "lucide-react";
import {
  primaryActionClass,
  scheduleGridShellClass,
  scheduleGridTimeLabelClass,
  scheduleLabelClass,
  scheduleSurfaceClass,
  secondaryActionClass,
} from "../shared";
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

const fieldLabelClass = cn(
  scheduleLabelClass,
  "cursor-default select-none whitespace-nowrap border-r border-[#e4e4e4] bg-[#f5f5f5] px-[0.6rem] py-0 flex items-center",
);

const fieldBodyClass = "flex items-center gap-1 px-2";

const plainInputClass =
  "border-none bg-transparent p-0 text-[0.813rem] font-semibold text-[#111111] focus:text-[var(--lego-red-color)] focus:outline-none";

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
        className="w-7 border-none bg-transparent p-0 text-center text-sm font-semibold text-[#111111] caret-[var(--lego-red-color)] placeholder:text-[#d0d0d0] focus:text-[var(--lego-red-color)] focus:outline-none"
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
      <span className="select-none text-sm font-medium leading-none text-[#c8c8c8]">
        :
      </span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={mStr}
        placeholder="MM"
        className="w-7 border-none bg-transparent p-0 text-center text-sm font-semibold text-[#111111] caret-[var(--lego-red-color)] placeholder:text-[#d0d0d0] focus:text-[var(--lego-red-color)] focus:outline-none"
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
      <div className={cn(scheduleSurfaceClass, "p-[0.875rem_1rem]")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-[#e4e4e4] bg-white">
              <label className={fieldLabelClass}>Intervjuperiode</label>
              <div className={fieldBodyClass}>
                <input
                  type="date"
                  value={localStartDate}
                  className={cn(plainInputClass, "cursor-pointer select-none")}
                  onChange={(e) => setLocalStartDate(e.target.value)}
                />
                <span className="select-none px-[0.1rem] text-xs text-[#c8c8c8]">
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

            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-[#e4e4e4] bg-white">
              <label className={fieldLabelClass}>Tidsrom</label>
              <div className={fieldBodyClass}>
                <TimeSegmentInput
                  id="start-time"
                  value={pendingStart}
                  onChange={setPendingStart}
                />
                <span className="select-none px-[0.1rem] text-xs text-[#c8c8c8]">
                  →
                </span>
                <TimeSegmentInput value={pendingEnd} onChange={setPendingEnd} />
              </div>
            </div>

            <div className="inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-[#e4e4e4] bg-white">
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
                  className="w-10 border-none bg-transparent p-0 text-center text-sm font-semibold text-[#111111] [-moz-appearance:textfield] focus:text-[var(--lego-red-color)] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  onChange={(e) => {
                    setDurationInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setPendingDuration(val);
                    else if (e.target.value === "") setPendingDuration(0);
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <span className="select-none text-[0.813rem] font-medium text-[#a0a0a0]">
                  min
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {!dateRangeValid && (
              <span className="text-xs font-semibold text-[#b21207]">
                Ugyldig datoperiode
              </span>
            )}
            {isInvalidRange && (
              <span className="text-xs font-semibold text-[#b21207]">
                Ugyldig tidsrom
              </span>
            )}
            {hasPendingChanges && !isSaving && (
              <span className="text-xs font-semibold italic text-[#a0a0a0]">
                Ulagrede endringer
              </span>
            )}
            <button
              type="button"
              className={cn(
                secondaryActionClass,
                "cursor-pointer px-[0.7rem] py-[0.35rem] text-[0.813rem] font-semibold",
              )}
              onClick={selectAll}
            >
              Velg alle
            </button>
            <button
              type="button"
              className={cn(
                secondaryActionClass,
                "cursor-pointer px-[0.7rem] py-[0.35rem] text-[0.813rem] font-semibold",
              )}
              onClick={clearAll}
            >
              Tøm alle
            </button>
            {onSave && (
              <button
                type="button"
                className={cn(
                  primaryActionClass,
                  "cursor-pointer whitespace-nowrap px-4 py-[0.45rem] text-[0.813rem] font-bold",
                )}
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
            const isAllSelected =
              timeSlots.length > 0 &&
              timeSlots.every((m) => draftSlots.has(makeSlotKey(date, m)));
            const isSomeSelected = timeSlots.some((m) =>
              draftSlots.has(makeSlotKey(date, m)),
            );

            return (
              <div
                key={date}
                className="flex flex-col items-center gap-[0.2rem] rounded-md border border-[#e4e4e4] bg-white px-1 py-2"
              >
                <div className={cn(scheduleLabelClass, "text-center text-[#6b6b6b]")}>
                  {weekday}
                </div>
                <div className="text-center text-[0.813rem] font-bold text-[#111111]">
                  {dayMonth}
                </div>
                <label className="flex cursor-pointer items-center gap-1 text-[0.688rem] font-semibold text-[#a0a0a0]">
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
                scheduleLabelClass,
                "col-[1/-1] px-4 py-10 text-center text-[#c0c0c0]",
              )}
            >
              {dates.length === 0
                ? "Velg en datoperiode for å se tidsplanen."
                : "Ingen slotter — endre tidsrom og lagre."}
            </div>
          ) : (
            timeSlots.map((minute) => (
              <React.Fragment key={minute}>
                <div className={scheduleGridTimeLabelClass}>{formatTime(minute)}</div>
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
                          ? "border-[var(--lego-red-color)] bg-[var(--lego-red-color)] text-white hover:bg-[#9a1006]"
                          : "border-[#e4e4e4] bg-white hover:border-[rgba(178,18,7,0.28)] hover:bg-[rgba(178,18,7,0.03)]",
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
  <span className={cn(scheduleLabelClass, "text-[#a0a0a0]")}>
    <strong className="text-[0.813rem] font-bold normal-case tracking-normal text-[#111111] [font-variant-numeric:tabular-nums]">
      {value}
    </strong>{" "}
    {label}
  </span>
);

const ToolbarDot = () => <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-[#d0d0d0]" />;

export default AdminScheduleConfig;
