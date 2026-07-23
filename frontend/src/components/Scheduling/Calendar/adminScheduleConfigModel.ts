import type { EnabledWindow, SlotOverride } from "../types";
import {
  addDays,
  dateRangeDates,
  enabledWindowsToSlots,
  makeSlotKey,
  normalizeEnabledWindows,
  parseSlotKey,
  slotsToEnabledWindows,
} from "../scheduleUtils";

export const MAX_RANGE_DAYS = 21;
export const DURATION_PRESETS = [20, 25, 30] as const;
export const PAUSE_PRESETS = [0, 30, 60] as const;
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
  slotOverrides: SlotOverride[];
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
  slotOverrides: SlotOverride[];
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

export const preserveManualDraftSlots = (
  dates: string[],
  timeSlots: number[],
  draftSlots: ReadonlySet<string>,
) => {
  const validDates = new Set(dates);
  const validMinutes = new Set(timeSlots);
  return new Set(
    Array.from(draftSlots).filter((slot) => {
      const { date, minute } = parseSlotKey(slot);
      return validDates.has(date) && validMinutes.has(minute);
    }),
  );
};

export const buildFineTuneTimeSlots = (
  chunks: number[][],
  sessionDuration: number,
) => {
  const slots = new Set(chunks.flat());
  for (let index = 0; index < chunks.length - 1; index += 1) {
    const left = chunks[index];
    const right = chunks[index + 1];
    if (!left.length || !right.length) continue;
    let minute = left[left.length - 1] + sessionDuration;
    while (minute + sessionDuration <= right[0]) {
      slots.add(minute);
      minute += sessionDuration;
    }
  }
  return Array.from(slots).sort((left, right) => left - right);
};

export type SchedulePatternRow =
  | {
      kind: "block";
      id: string;
      minutes: number[];
      boundaryShort: boolean;
    }
  | {
      kind: "pause";
      id: string;
      minutes: number[];
      startMinute: number;
      endMinute: number;
    };

/**
 * Keeps the visual grid anchored to the generated block pattern. Planned
 * pauses are rows in the same coordinate system, but only full interview
 * durations inside a pause become editable slots.
 */
export const buildSchedulePatternRows = (
  chunks: number[][],
  sessionDuration: number,
  blockSize: number,
): SchedulePatternRow[] => {
  const rows: SchedulePatternRow[] = [];
  chunks.forEach((chunk, index) => {
    if (!chunk.length) return;
    rows.push({
      kind: "block",
      id: `block-${chunk[0]}`,
      minutes: chunk,
      boundaryShort: chunk.length < blockSize,
    });

    const nextChunk = chunks[index + 1];
    if (!nextChunk?.length) return;
    const startMinute = chunk[chunk.length - 1] + sessionDuration;
    const endMinute = nextChunk[0];
    if (endMinute <= startMinute) return;

    const minutes: number[] = [];
    for (
      let minute = startMinute;
      minute + sessionDuration <= endMinute;
      minute += sessionDuration
    ) {
      minutes.push(minute);
    }
    rows.push({
      kind: "pause",
      id: `pause-${startMinute}`,
      minutes,
      startMinute,
      endMinute,
    });
  });
  return rows;
};

export interface ScheduleDraftSummary {
  wholeBlockCount: number;
  shortBlockCount: number;
  partialBlockCount: number;
  openSlotCount: number;
  closedStandardSlotCount: number;
  openedStandardSlotCount: number;
  openedPauseSlotCount: number;
  manualChangeCount: number;
}

export const deriveScheduleDraftSummary = ({
  dates,
  chunks,
  blockSize,
  enabledSlots,
  slotOverrides,
}: {
  dates: string[];
  chunks: number[][];
  blockSize: number;
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}): ScheduleDraftSummary => {
  let wholeBlockCount = 0;
  let shortBlockCount = 0;
  let partialBlockCount = 0;
  const standardSlots = new Set<string>();

  dates.forEach((date) => {
    chunks.forEach((chunk) => {
      const keys = chunk.map((minute) => makeSlotKey(date, minute));
      keys.forEach((key) => standardSlots.add(key));
      const openCount = keys.filter((key) => enabledSlots.has(key)).length;
      if (openCount === 0) return;
      if (openCount < keys.length) {
        partialBlockCount += 1;
      } else if (chunk.length < blockSize) {
        shortBlockCount += 1;
      } else {
        wholeBlockCount += 1;
      }
    });
  });

  let closedStandardSlotCount = 0;
  let openedStandardSlotCount = 0;
  let openedPauseSlotCount = 0;
  const overrides = canonicalizeSlotOverrides(slotOverrides);
  overrides.forEach((override) => {
    if (standardSlots.has(override.slot)) {
      if (override.open) openedStandardSlotCount += 1;
      else closedStandardSlotCount += 1;
    } else if (override.open) {
      openedPauseSlotCount += 1;
    }
  });

  return {
    wholeBlockCount,
    shortBlockCount,
    partialBlockCount,
    openSlotCount: enabledSlots.size,
    closedStandardSlotCount,
    openedStandardSlotCount,
    openedPauseSlotCount,
    manualChangeCount: overrides.length,
  };
};

const compareSlotKeys = (left: string, right: string) => {
  const leftSlot = parseSlotKey(left);
  const rightSlot = parseSlotKey(right);
  return leftSlot.date === rightSlot.date
    ? leftSlot.minute - rightSlot.minute
    : leftSlot.date.localeCompare(rightSlot.date);
};

export const canonicalizeSlotOverrides = (overrides: Iterable<SlotOverride>) =>
  Array.from(
    new Map(
      Array.from(overrides).map((override) => [override.slot, override]),
    ).values(),
  ).sort((left, right) => compareSlotKeys(left.slot, right.slot));

export const reconstructBaseSlots = (
  enabledSlots: ReadonlySet<string>,
  overrides: Iterable<SlotOverride>,
) => {
  const base = new Set(enabledSlots);
  for (const override of overrides) {
    if (override.open) base.delete(override.slot);
    else base.add(override.slot);
  }
  return base;
};

export const deriveSlotOverrides = (
  enabledSlots: ReadonlySet<string>,
  baseSlots: ReadonlySet<string>,
) => {
  const slots = new Set([...enabledSlots, ...baseSlots]);
  return canonicalizeSlotOverrides(
    Array.from(slots)
      .filter((slot) => enabledSlots.has(slot) !== baseSlots.has(slot))
      .map((slot) => ({ slot, open: enabledSlots.has(slot) })),
  );
};

export interface ScheduleDraftState {
  enabledSlots: Set<string>;
  slotOverrides: SlotOverride[];
}

const standardSlotKeys = (dates: string[], chunks: number[][]) =>
  new Set(
    dates.flatMap((date) =>
      chunks.flatMap((chunk) =>
        chunk.map((minute) => makeSlotKey(date, minute)),
      ),
    ),
  );

const setGeneratedSlotsOpen = ({
  enabledSlots,
  slotOverrides,
  slots,
  open,
}: {
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
  slots: ReadonlySet<string>;
  open: boolean;
}): ScheduleDraftState => {
  const nextSlots = new Set(enabledSlots);
  slots.forEach((slot) => {
    if (open) nextSlots.add(slot);
    else nextSlots.delete(slot);
  });
  return {
    enabledSlots: nextSlots,
    slotOverrides: canonicalizeSlotOverrides(
      Array.from(slotOverrides).filter((override) => !slots.has(override.slot)),
    ),
  };
};

/** A whole-block choice becomes the new baseline for exactly that block. */
export const setStandardBlockOpen = ({
  date,
  minutes,
  open,
  enabledSlots,
  slotOverrides,
}: {
  date: string;
  minutes: number[];
  open: boolean;
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}) =>
  setGeneratedSlotsOpen({
    enabledSlots,
    slotOverrides,
    slots: new Set(minutes.map((minute) => makeSlotKey(date, minute))),
    open,
  });

/** Opens generated structure without silently opening planned-pause extras. */
export const openAllStandardBlocks = ({
  dates,
  chunks,
  enabledSlots,
  slotOverrides,
}: {
  dates: string[];
  chunks: number[][];
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}) =>
  setGeneratedSlotsOpen({
    enabledSlots,
    slotOverrides,
    slots: standardSlotKeys(dates, chunks),
    open: true,
  });

/** Day-level standard controls intentionally leave pause extras untouched. */
export const setDayStandardBlocksOpen = ({
  date,
  chunks,
  open,
  enabledSlots,
  slotOverrides,
}: {
  date: string;
  chunks: number[][];
  open: boolean;
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}) =>
  setGeneratedSlotsOpen({
    enabledSlots,
    slotOverrides,
    slots: new Set(
      chunks.flatMap((chunk) =>
        chunk.map((minute) => makeSlotKey(date, minute)),
      ),
    ),
    open,
  });

/** Fine-tuning is always recorded relative to the current whole-block baseline. */
export const toggleFineTuneSlot = ({
  slot,
  enabledSlots,
  slotOverrides,
}: {
  slot: string;
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}): ScheduleDraftState => {
  const baseSlots = reconstructBaseSlots(enabledSlots, slotOverrides);
  const nextSlots = new Set(enabledSlots);
  if (nextSlots.has(slot)) nextSlots.delete(slot);
  else nextSlots.add(slot);
  return {
    enabledSlots: nextSlots,
    slotOverrides: deriveSlotOverrides(nextSlots, baseSlots),
  };
};

export const closeAllScheduleCapacity = (): ScheduleDraftState => ({
  enabledSlots: new Set(),
  slotOverrides: [],
});

export const closeDayScheduleCapacity = ({
  date,
  enabledSlots,
  slotOverrides,
}: {
  date: string;
  enabledSlots: ReadonlySet<string>;
  slotOverrides: Iterable<SlotOverride>;
}): ScheduleDraftState => ({
  enabledSlots: new Set(
    Array.from(enabledSlots).filter((slot) => parseSlotKey(slot).date !== date),
  ),
  slotOverrides: canonicalizeSlotOverrides(
    Array.from(slotOverrides).filter(
      (override) => parseSlotKey(override.slot).date !== date,
    ),
  ),
});

export const rebuildBaseForBlockPattern = (
  dates: string[],
  chunks: number[][],
  previousBaseSlots: ReadonlySet<string>,
) => {
  const next = new Set<string>();
  for (const date of dates) {
    for (const chunk of chunks) {
      const keys = chunk.map((minute) => makeSlotKey(date, minute));
      if (keys.every((key) => previousBaseSlots.has(key))) {
        keys.forEach((key) => next.add(key));
      }
    }
  }
  return next;
};

export const deriveResolvedLayout = ({
  dates,
  chunks,
  enabledSlots,
  slotOverrides,
  sessionDuration,
}: {
  dates: string[];
  chunks: number[][];
  enabledSlots: ReadonlySet<string>;
  slotOverrides: SlotOverride[];
  sessionDuration: number;
}) => {
  const baseSlots = reconstructBaseSlots(enabledSlots, slotOverrides);
  const resolvedBlocks = dates.flatMap((date) =>
    chunks.map((chunk) => ({
      slots: chunk.map((minute) => makeSlotKey(date, minute)),
    })),
  );
  const standardSlots = new Set(resolvedBlocks.flatMap((block) => block.slots));
  const openedPauseSlots = Array.from(enabledSlots)
    .filter((slot) => !standardSlots.has(slot))
    .sort(compareSlotKeys);
  let pauseRun: string[] = [];
  for (const slot of openedPauseSlots) {
    const previous = pauseRun[pauseRun.length - 1];
    if (previous) {
      const previousParts = previous.split("|");
      const currentParts = slot.split("|");
      if (
        previousParts[0] !== currentParts[0] ||
        Number(previousParts[1]) + sessionDuration !== Number(currentParts[1])
      ) {
        resolvedBlocks.push({ slots: pauseRun });
        pauseRun = [];
      }
    }
    pauseRun.push(slot);
  }
  if (pauseRun.length) resolvedBlocks.push({ slots: pauseRun });
  resolvedBlocks.sort((left, right) =>
    compareSlotKeys(left.slots[0], right.slots[0]),
  );
  return {
    base_slots: Array.from(baseSlots).sort(compareSlotKeys),
    slot_overrides: canonicalizeSlotOverrides(slotOverrides),
    resolved_blocks: resolvedBlocks,
  };
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
  slotOverrides,
  enabledWindows,
  hasInvalidNumericInput,
}: ScheduleConfigChangeStateInput) => {
  const enabledWindowsChanged =
    JSON.stringify(enabledWindows) !== JSON.stringify(baseline.enabledWindows);
  const slotOverridesChanged =
    JSON.stringify(canonicalizeSlotOverrides(slotOverrides)) !==
    JSON.stringify(canonicalizeSlotOverrides(baseline.slotOverrides));
  const blockStructureChange =
    chunkSize !== baseline.chunkSize ||
    chunkBreakMinutes !== baseline.chunkBreakMinutes;
  const baselineSlots = new Set(
    enabledWindowsToSlots(baseline.enabledWindows, baseline.sessionDuration),
  );
  const nextSlots = new Set(
    enabledWindowsToSlots(enabledWindows, sessionDuration),
  );
  const availabilityAddition = Array.from(nextSlots).some(
    (slot) => !baselineSlots.has(slot),
  );
  const availabilityRemoval = Array.from(baselineSlots).some(
    (slot) => !nextSlots.has(slot),
  );
  const durationChanged = sessionDuration !== baseline.sessionDuration;
  const startDateChanged = startDate !== baseline.startDate;
  const proposalInvalidatingChange =
    durationChanged ||
    startDateChanged ||
    blockStructureChange ||
    availabilityRemoval;
  const sharedGridChange =
    startDateChanged ||
    endDate !== baseline.endDate ||
    durationChanged ||
    startMinute !== baseline.dayStartMinute ||
    endMinute !== baseline.dayEndMinute ||
    enabledWindowsChanged;

  return {
    hasPendingChanges:
      hasInvalidNumericInput ||
      sharedGridChange ||
      slotOverridesChanged ||
      chunkSize !== baseline.chunkSize ||
      chunkBreakMinutes !== baseline.chunkBreakMinutes,
    gridDefiningChange: durationChanged,
    proposalInvalidatingChange,
    blockStructureChange,
    visualGroupingChange: false,
    availabilityAddition,
    availabilityRemoval,
  };
};
