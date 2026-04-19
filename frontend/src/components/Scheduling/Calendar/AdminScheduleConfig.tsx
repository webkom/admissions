import React, { useState, useEffect, useRef, useCallback } from "react";
import styled, { css } from "styled-components";
import { Check } from "lucide-react";
import {
  primaryAction,
  scheduleGridShell,
  scheduleGridTimeLabel,
  scheduleLabel,
  scheduleSurface,
  secondaryAction,
} from "../shared";
import {
  dateRangeDates,
  formatDateHeader,
  makeSlotKey,
} from "../scheduleUtils";

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

const TimeSegmentInput: React.FC<TimeSegmentInputProps> = ({ value, onChange, id }) => {
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
    <TimeSegWrapper>
      <SegInput
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={hStr}
        placeholder="HH"
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
      <SegColon>:</SegColon>
      <SegInput
        ref={minRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={mStr}
        placeholder="MM"
        onChange={(e) => {
          const s = e.target.value.replace(/\D/g, "").slice(0, 2);
          setMStr(s);
          commitMinute(s);
        }}
        onFocus={(e) => e.target.select()}
      />
    </TimeSegWrapper>
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

  // Draft slot state — only flushed to parent on save
  const [draftSlots, setDraftSlots] = useState<Set<string>>(() => new Set(enabledSlots));

  const hasPendingChanges =
    localStartDate !== startDate ||
    localEndDate !== endDate ||
    draftSlots.size !== enabledSlots.size ||
    [...draftSlots].some((k) => !enabledSlots.has(k));

  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
    setDraftSlots(new Set(enabledSlots));
  }, [startDate, endDate]);

  const startMinute = pendingStart.h * 60 + pendingStart.m;
  const endMinute = pendingEnd.h * 60 + pendingEnd.m;
  const isInvalidRange = startMinute >= endMinute;

  // Grid uses local draft dates, not the committed parent dates
  const dates = React.useMemo(
    () => dateRangeDates(localStartDate, localEndDate).slice(0, MAX_RANGE_DAYS),
    [localStartDate, localEndDate],
  );

  const TIME_SLOTS = React.useMemo(() => {
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
      // Flush all draft state to parent before saving
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

  const handleDateRangeCommit = () => {
    // Only updates local state; parent is not notified until save
  };

  const selectAllForDay = (date: string) => {
    const newSlots = new Set(draftSlots);
    TIME_SLOTS.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    setDraftSlots(newSlots);
  };

  const clearAllForDay = (date: string) => {
    const newSlots = new Set(draftSlots);
    TIME_SLOTS.forEach((m) => newSlots.delete(makeSlotKey(date, m)));
    setDraftSlots(newSlots);
  };

  const selectAll = () => {
    const newSlots = new Set<string>();
    dates.forEach((date) => {
      TIME_SLOTS.forEach((m) => newSlots.add(makeSlotKey(date, m)));
    });
    setDraftSlots(newSlots);
  };

  const clearAll = () => setDraftSlots(new Set());

  const dateRangeValid = localStartDate && localEndDate && localStartDate <= localEndDate;

  return (
    <Container>
      <HeaderCard>
        <ControlBar>
          <ControlInputs>
            {/* Date range */}
            <FieldGroup>
              <FieldLabel>Intervjuperiode</FieldLabel>
              <FieldBody>
                <DateInput
                  type="date"
                  value={localStartDate}
                  onChange={(e) => setLocalStartDate(e.target.value)}
                  onBlur={handleDateRangeCommit}
                />
                <FieldArrow>→</FieldArrow>
                <DateInput
                  type="date"
                  value={localEndDate}
                  min={localStartDate}
                  onChange={(e) => setLocalEndDate(e.target.value)}
                  onBlur={handleDateRangeCommit}
                />
              </FieldBody>
            </FieldGroup>

            <FieldGroup>
              <FieldLabel>Tidsrom</FieldLabel>
              <FieldBody>
                <TimeSegmentInput
                  id="start-time"
                  value={pendingStart}
                  onChange={setPendingStart}
                />
                <FieldArrow>→</FieldArrow>
                <TimeSegmentInput value={pendingEnd} onChange={setPendingEnd} />
              </FieldBody>
            </FieldGroup>

            <FieldGroup>
              <FieldLabel htmlFor="session-duration">Varighet</FieldLabel>
              <FieldBody>
                <FieldInput
                  id="session-duration"
                  type="number"
                  min="5"
                  max="120"
                  step="5"
                  value={durationInput}
                  onChange={(e) => {
                    setDurationInput(e.target.value);
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setPendingDuration(val);
                    else if (e.target.value === "") setPendingDuration(0);
                  }}
                  onFocus={(e) => e.target.select()}
                />
                <FieldUnit>min</FieldUnit>
              </FieldBody>
            </FieldGroup>
          </ControlInputs>

          <ControlActions>
            {!dateRangeValid && (
              <ValidationHint>Ugyldig datoperiode</ValidationHint>
            )}
            {isInvalidRange && <ValidationHint>Ugyldig tidsrom</ValidationHint>}
            {hasPendingChanges && !isSaving && (
              <PendingHint>Ulagrede endringer</PendingHint>
            )}
            <ActionButton type="button" onClick={selectAll}>
              Velg alle
            </ActionButton>
            <ActionButton type="button" onClick={clearAll}>
              Tøm alle
            </ActionButton>
            {onSave && (
              <SaveButton
                type="button"
                onClick={handleSave}
                disabled={isSaving || pendingDuration === 0 || isInvalidRange || !dateRangeValid}
              >
                {isSaving ? "Lagrer..." : "Lagre oppsett"}
              </SaveButton>
            )}
          </ControlActions>
        </ControlBar>
      </HeaderCard>

      <GridToolbar>
        <ToolbarStats>
          <ToolbarStat>
            <strong>{dates.length}</strong> dager
          </ToolbarStat>
          <ToolbarDot />
          <ToolbarStat>
            <strong>{draftSlots.size}</strong> ledige slots
          </ToolbarStat>
          <ToolbarDot />
          <ToolbarStat>
            <strong>{candidateCount}</strong> kandidater
          </ToolbarStat>
          <ToolbarDot />
          <ToolbarStat>
            <strong>{interviewerCount}</strong> intervjuere
          </ToolbarStat>
        </ToolbarStats>
      </GridToolbar>

      <GridWrapper>
        <Grid $columns={dates.length + 1}>
          <div />
          {dates.map((date) => {
            const { weekday, dayMonth } = formatDateHeader(date);
            const isAllSelected =
              TIME_SLOTS.length > 0 &&
              TIME_SLOTS.every((m) => draftSlots.has(makeSlotKey(date, m)));
            const isSomeSelected = TIME_SLOTS.some((m) =>
              draftSlots.has(makeSlotKey(date, m)),
            );

            return (
              <DayHeader key={date}>
                <DayWeekday>{weekday}</DayWeekday>
                <DayDate>{dayMonth}</DayDate>
                <DayToggle>
                  <input
                    type="checkbox"
                    disabled={TIME_SLOTS.length === 0}
                    checked={isAllSelected}
                    ref={(input) => {
                      if (input)
                        input.indeterminate = isSomeSelected && !isAllSelected;
                    }}
                    onChange={() => {
                      if (isAllSelected) clearAllForDay(date);
                      else selectAllForDay(date);
                    }}
                  />
                  Alle
                </DayToggle>
              </DayHeader>
            );
          })}

          {TIME_SLOTS.length === 0 ? (
            <EmptyGrid>
              {dates.length === 0
                ? "Velg en datoperiode for å se tidsplanen."
                : "Ingen slotter — endre tidsrom og lagre."}
            </EmptyGrid>
          ) : (
            TIME_SLOTS.map((minute) => (
              <React.Fragment key={minute}>
                <TimeLabel>{formatTime(minute)}</TimeLabel>
                {dates.map((date) => {
                  const key = makeSlotKey(date, minute);
                  const isEnabled = draftSlots.has(key);
                  return (
                    <ConfigSlot
                      key={key}
                      $isEnabled={isEnabled}
                      onMouseDown={() => handleMouseDown(date, minute)}
                      onMouseEnter={() => handleMouseEnter(date, minute)}
                    >
                      {isEnabled && <Check size={12} strokeWidth={2.5} />}
                    </ConfigSlot>
                  );
                })}
              </React.Fragment>
            ))
          )}
        </Grid>
      </GridWrapper>
    </Container>
  );
};

export default AdminScheduleConfig;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  user-select: none;
  min-width: 0;
`;

const HeaderCard = styled.div`
  ${scheduleSurface};
  padding: 0.875rem 1rem;
`;

const ControlBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
`;

const Eyebrow = styled.span`
  ${scheduleLabel};
  flex-shrink: 0;
  margin-right: 0.25rem;
`;

const ControlInputs = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
`;

const ControlActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
  flex-wrap: wrap;
`;

const ValidationHint = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #b21207;
`;

const PendingHint = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: #a0a0a0;
  font-style: italic;
`;

const FieldGroup = styled.div`
  display: inline-flex;
  align-items: stretch;
  border: 1px solid #e4e4e4;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  height: 2rem;
`;

const FieldLabel = styled.label`
  display: flex;
  align-items: center;
  padding: 0 0.6rem;
  background: #f5f5f5;
  border-right: 1px solid #e4e4e4;
  ${scheduleLabel};
  white-space: nowrap;
  cursor: default;
  user-select: none;
`;

const FieldBody = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
`;

const FieldArrow = styled.span`
  color: #c8c8c8;
  font-size: 0.75rem;
  user-select: none;
  padding: 0 0.1rem;
`;

const DateInput = styled.input`
  border: none;
  background: transparent;
  font-size: 0.813rem;
  font-weight: 600;
  color: #111111;
  padding: 0;
  cursor: pointer;
  user-select: none;

  &:focus {
    outline: none;
    color: var(--lego-red-color);
  }

  &::-webkit-calendar-picker-indicator {
    opacity: 0.4;
    cursor: pointer;
  }
`;

const FieldInput = styled.input`
  width: 2.5rem;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: #111111;
  padding: 0;

  -moz-appearance: textfield;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &:focus {
    outline: none;
    color: var(--lego-red-color);
  }
`;

const FieldUnit = styled.span`
  color: #a0a0a0;
  font-size: 0.813rem;
  font-weight: 500;
  user-select: none;
`;

const TimeSegWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 1px;
`;

const SegInput = styled.input`
  width: 1.75rem;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: #111111;
  padding: 0;
  caret-color: var(--lego-red-color);

  &:focus {
    outline: none;
    color: var(--lego-red-color);
  }

  &::placeholder {
    color: #d0d0d0;
  }
`;

const SegColon = styled.span`
  color: #c8c8c8;
  font-size: 0.875rem;
  font-weight: 500;
  user-select: none;
  line-height: 1;
`;

const GridToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  padding: 0 0.25rem;
`;

const ActionButton = styled.button`
  ${secondaryAction};
  padding: 0.35rem 0.7rem;
  border-radius: 6px;
  font-size: 0.813rem;
  font-weight: 600;
  cursor: pointer;
`;

const ToolbarStats = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ToolbarStat = styled.span`
  ${scheduleLabel};
  color: #a0a0a0;

  strong {
    font-size: 0.813rem;
    font-weight: 700;
    color: #111111;
    font-variant-numeric: tabular-nums;
    text-transform: none;
    letter-spacing: 0;
  }
`;

const ToolbarDot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #d0d0d0;
  flex-shrink: 0;
`;

const GridWrapper = styled.div`
  ${scheduleGridShell};
  min-width: 0;
`;

const Grid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: 56px repeat(${(props) => props.$columns - 1}, minmax(70px, 1fr));
  gap: 5px;
  min-width: max(680px, ${(props) => (props.$columns - 1) * 70 + 56}px);
`;

const EmptyGrid = styled.div`
  grid-column: 1 / -1;
  padding: 2.5rem 1rem;
  text-align: center;
  ${scheduleLabel};
  color: #c0c0c0;
`;

const DayHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.5rem 0.25rem;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #e4e4e4;
`;

const DayWeekday = styled.div`
  ${scheduleLabel};
  text-align: center;
  color: #6b6b6b;
`;

const DayDate = styled.div`
  font-size: 0.813rem;
  font-weight: 700;
  color: #111111;
  text-align: center;
`;

const DayToggle = styled.label`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #a0a0a0;
  font-size: 0.688rem;
  font-weight: 600;
  cursor: pointer;
`;

const TimeLabel = styled.div`
  ${scheduleGridTimeLabel};
`;

const ConfigSlot = styled.div<{ $isEnabled: boolean }>`
  height: 2.25rem;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.1s ease, border-color 0.1s ease;
  cursor: pointer;

  ${(props) =>
    props.$isEnabled
      ? css`
          color: #ffffff;
          background: var(--lego-red-color);
          border: 1px solid var(--lego-red-color);

          &:hover {
            background: #9a1006;
          }
        `
      : css`
          background: #ffffff;
          border: 1px solid #e4e4e4;

          &:hover {
            border-color: rgba(178, 18, 7, 0.28);
            background: rgba(178, 18, 7, 0.03);
          }
        `}
`;

const SaveButton = styled.button`
  ${primaryAction};
  padding: 0.45rem 1rem;
  border-radius: 8px;
  font-size: 0.813rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
`;
