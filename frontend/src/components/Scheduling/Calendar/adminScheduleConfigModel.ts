import type { EnabledWindow } from "../types";
import {
  addDays,
  dateRangeDates,
  makeSlotKey,
  normalizeEnabledWindows,
  parseSlotKey,
  slotsToEnabledWindows,
} from "../scheduleUtils";

export const MAX_RANGE_DAYS = 21;
export const DURATION_PRESETS = [15, 20, 30, 45] as const;
export const PAUSE_PRESETS = [0, 30, 45, 60] as const;
export const SESSION_DURATION_LIMITS = { min: 5, max: 240, step: 5 } as const;
export const CHUNK_BREAK_LIMITS = { min: 0, max: 240, step: 1 } as const;
export const CHUNK_SIZE_LIMITS = { min: 1, max: 20, step: 1 } as const;

export interface ScheduleConfigBaseline {
  startDate: string;
  endDate: string;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledWindows: EnabledWindow[];
  sessionDuration: number;
}

interface ScheduleConfigChangeStateInput {
  baseline: ScheduleConfigBaseline;
  startDate: string;
  endDate: string;
  startMinute: number;
  endMinute: number;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledWindows: EnabledWindow[];
  hasInvalidNumericInput: boolean;
}

export const parseIntegerInRange = (
  raw: string,
  min: number,
  max: number,
  step = 1,
) => {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) &&
    value >= min &&
    value <= max &&
    (value - min) % step === 0
    ? value
    : null;
};

export const isDurationPreset = (value: number) =>
  DURATION_PRESETS.includes(value as (typeof DURATION_PRESETS)[number]);

export const isPausePreset = (value: number) =>
  PAUSE_PRESETS.includes(value as (typeof PAUSE_PRESETS)[number]);

export const normalizeSourceWindows = (
  enabledWindows: EnabledWindow[],
  enabledSlots: Set<string>,
  sessionDuration: number,
) =>
  normalizeEnabledWindows(
    enabledWindows.length > 0
      ? enabledWindows
      : slotsToEnabledWindows(enabledSlots, sessionDuration),
  );

export const getDateRangeState = (startDate: string, endDate: string) => ({
  isValid:
    Boolean(startDate) &&
    Boolean(endDate) &&
    startDate <= endDate &&
    endDate <= addDays(startDate, MAX_RANGE_DAYS - 1),
  isTooLong:
    Boolean(startDate) &&
    Boolean(endDate) &&
    endDate > addDays(startDate, MAX_RANGE_DAYS - 1),
});

export const getInclusiveDateRangeDayCount = (
  startDate: string,
  endDate: string,
) => {
  if (!getDateRangeState(startDate, endDate).isValid) return 0;
  return dateRangeDates(startDate, endDate, MAX_RANGE_DAYS).length;
};

export const getTotalInterviewSlotCount = (
  isConfigurationValid: boolean,
  dayCount: number,
  slotsPerDay: number,
) => (isConfigurationValid ? dayCount * slotsPerDay : 0);

// A block that overlaps any previously enabled time is filled completely so
// changing the time format never produces half-blocks.
export const shapeDraftSlots = (
  dates: string[],
  chunks: number[][],
  draftSlots: ReadonlySet<string>,
  sessionDuration: number,
) => {
  const next = new Set<string>();
  const selectedMinutesByDate = new Map<string, number[]>();
  draftSlots.forEach((key) => {
    const { date, minute } = parseSlotKey(key);
    if (!date || !Number.isFinite(minute)) return;
    const selectedMinutes = selectedMinutesByDate.get(date) ?? [];
    selectedMinutes.push(minute);
    selectedMinutesByDate.set(date, selectedMinutes);
  });

  dates.forEach((date) => {
    const selectedMinutes = selectedMinutesByDate.get(date) ?? [];
    chunks.forEach((chunk) => {
      const chunkStart = chunk[0];
      const chunkEnd = chunk[chunk.length - 1] + sessionDuration;
      const overlaps = selectedMinutes.some(
        (minute) => minute < chunkEnd && minute + sessionDuration > chunkStart,
      );
      if (!overlaps) return;
      chunk.forEach((minute) => next.add(makeSlotKey(date, minute)));
    });
  });
  return next;
};

export const getScheduleConfigChangeState = ({
  baseline,
  startDate,
  endDate,
  startMinute,
  endMinute,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
  enabledWindows,
  hasInvalidNumericInput,
}: ScheduleConfigChangeStateInput) => {
  const enabledWindowsChanged =
    JSON.stringify(enabledWindows) !== JSON.stringify(baseline.enabledWindows);
  const blockShapeChange =
    chunkBreakMinutes !== baseline.chunkBreakMinutes ||
    ((chunkBreakMinutes > 0 || baseline.chunkBreakMinutes > 0) &&
      chunkSize !== baseline.chunkSize);
  const sharedGridChange =
    startDate !== baseline.startDate ||
    endDate !== baseline.endDate ||
    sessionDuration !== baseline.sessionDuration ||
    startMinute !== baseline.dayStartMinute ||
    endMinute !== baseline.dayEndMinute ||
    enabledWindowsChanged;

  return {
    hasPendingChanges:
      hasInvalidNumericInput ||
      sharedGridChange ||
      chunkSize !== baseline.chunkSize ||
      chunkBreakMinutes !== baseline.chunkBreakMinutes,
    gridDefiningChange: sharedGridChange || blockShapeChange,
    visualGroupingChange: chunkSize !== baseline.chunkSize && !blockShapeChange,
  };
};
