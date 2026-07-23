import { useMemo } from "react";
import type { StatusToastState } from "src/components/StatusToast";
import type { ScheduleConfigInput } from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import {
  CONFLICT_MESSAGE,
  isConflictError,
  scheduleSaveErrorMessage,
} from "src/components/Scheduling/Solver/solverHelpers";
import {
  addDays,
  decodeScheduleTime,
  dateRangeDates,
  nextMonday,
} from "src/components/Scheduling/scheduleUtils";
import { useSaveSchedule } from "src/query/hooks";
import type { SavedSchedule } from "src/types";

const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 18 * 60;
const DEFAULT_SESSION_DURATION = 20;

type Notify = (message: string, tone?: StatusToastState["tone"]) => void;

const inferEndDateFromSchedule = (savedSchedule: SavedSchedule) => {
  if (savedSchedule.end_date) return savedSchedule.end_date;
  if (savedSchedule.schedule.length === 0) return null;

  const lastDayOffset = savedSchedule.schedule.reduce(
    (max, item) =>
      Math.max(
        max,
        decodeScheduleTime(item.time, savedSchedule.session_duration).dayIndex,
      ),
    0,
  );

  return addDays(savedSchedule.start_date, lastDayOffset);
};

interface ScheduleConfigurationParams {
  admissionSlug: string;
  savedSchedule: SavedSchedule | undefined;
  notify: Notify;
}

export const useScheduleConfiguration = ({
  admissionSlug,
  savedSchedule,
  notify,
}: ScheduleConfigurationParams) => {
  const saveSchedule = useSaveSchedule(admissionSlug);
  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);
  const configuration = useMemo(() => {
    if (!savedSchedule) {
      return {
        startDate: defaultStart,
        endDate: defaultEnd,
        dayStartMinute: DEFAULT_DAY_START_MINUTE,
        dayEndMinute: DEFAULT_DAY_END_MINUTE,
        sessionDuration: DEFAULT_SESSION_DURATION,
        chunkSize: 4,
        chunkBreakMinutes: 0,
        blockMode: "standard" as const,
        manualBlocks: [],
        layoutVersion: 2,
        slotOverrides: [],
        enabledWindows: [],
        enabledSlots: new Set<string>(),
        revision: null,
      };
    }

    return {
      startDate: savedSchedule.start_date,
      endDate: inferEndDateFromSchedule(savedSchedule) ?? defaultEnd,
      dayStartMinute: savedSchedule.day_start_minute,
      dayEndMinute: savedSchedule.day_end_minute,
      sessionDuration: savedSchedule.session_duration,
      chunkSize: savedSchedule.chunk_size,
      chunkBreakMinutes: savedSchedule.chunk_break_minutes,
      blockMode: savedSchedule.block_mode ?? "standard",
      manualBlocks:
        savedSchedule.resolved_blocks ?? savedSchedule.manual_blocks ?? [],
      layoutVersion: savedSchedule.layout_version ?? 1,
      slotOverrides: savedSchedule.slot_overrides ?? [],
      enabledWindows: savedSchedule.enabled_windows,
      enabledSlots: new Set(savedSchedule.enabled_slots),
      revision: savedSchedule.updated_at,
    };
  }, [defaultEnd, savedSchedule]);

  const {
    startDate,
    endDate,
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
    blockMode,
    manualBlocks,
    layoutVersion,
    slotOverrides,
    enabledWindows,
    enabledSlots,
    revision,
  } = configuration;

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const saveConfig = async (input: ScheduleConfigInput) => {
    try {
      const saved = await saveSchedule.mutateAsync({
        start_date: input.startDate,
        end_date: input.endDate,
        day_start_minute: input.dayStartMinute,
        day_end_minute: input.dayEndMinute,
        session_duration: input.sessionDuration,
        chunk_size: input.chunkSize,
        chunk_break_minutes: input.chunkBreakMinutes,
        ...(input.slotOverrides === undefined
          ? {}
          : { slot_overrides: input.slotOverrides }),
        enabled_slots: Array.from(input.enabledSlots),
        schedule: savedSchedule?.schedule ?? [],
        expected_updated_at: input.expectedUpdatedAt,
      });
      notify("Rammer lagret.");
      return saved.updated_at;
    } catch (error) {
      notify(
        isConflictError(error)
          ? CONFLICT_MESSAGE
          : scheduleSaveErrorMessage(error, "Kunne ikke lagre rammer."),
        "error",
      );
      throw error;
    }
  };

  return {
    startDate,
    endDate,
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
    blockMode,
    manualBlocks,
    layoutVersion,
    slotOverrides,
    enabledWindows,
    enabledSlots,
    revision,
    dates,
    saveConfig,
  };
};
