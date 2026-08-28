import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  Candidate,
  Interviewer,
  SavedSchedule,
  ScheduleItem,
} from "../types";
import { buildLockedAssignments } from "../scheduleUtils";
import { hasSchedule, type SolveResponse } from "./solverHelpers";
import {
  deriveAvailableTimeOptions,
  deriveEnabledTimeOptions,
  deriveSchedulePresentation,
  type SchedulePresentation,
} from "./solverSelectors";

interface UseScheduleDraftParams {
  result: SolveResponse | null;
  setResult: Dispatch<SetStateAction<SolveResponse | null>>;
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  enabledSlots: Set<string>;
  sessionDuration: number;
  canonicalBlocks: number[][];
  savedSchedule: SavedSchedule | null;
  onModify: () => void;
}

export const toggleScheduleDraftLock = (item: ScheduleItem): ScheduleItem => {
  const locked = !item.locked;
  return {
    ...item,
    locked,
    ...(!locked && item.booking_source === "manual"
      ? { booking_source: "solver" as const }
      : {}),
  };
};

export interface ScheduleDraftController {
  presentation: SchedulePresentation;
  lockedAssignments: ReturnType<typeof buildLockedAssignments>;
  explicitLockedAssignments: ReturnType<typeof buildLockedAssignments>;
  canRestoreEditSession: boolean;
  beginEditSession: () => void;
  restoreEditSession: () => void;
  finishEditSession: () => void;
  timeOptionsFor: (scheduleIndex: number) => number[];
  toggleLock: (scheduleIndex: number) => void;
  changeTime: (scheduleIndex: number, nextTime: string) => void;
  moveItems: (scheduleIndexes: number[], nextTime: number) => void;
  swapTimes: (sourceScheduleIndex: number, targetScheduleIndex: number) => void;
  swapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  /** Rows touched since the last save, drained on read. The persistence
   *  layer forwards them to onSaved so the plan view can scroll back to
   *  and highlight what the user just changed. */
  consumeTouchedScheduleIndexes: () => number[];
}

export const useScheduleDraft = ({
  result,
  setResult,
  candidates,
  interviewers,
  dates,
  enabledSlots,
  sessionDuration,
  canonicalBlocks,
  savedSchedule,
  onModify,
}: UseScheduleDraftParams): ScheduleDraftController => {
  const editBaselineRef = useRef<SolveResponse | null>(null);
  const touchedScheduleIndexesRef = useRef<number[]>([]);
  const [canRestoreEditSession, setCanRestoreEditSession] = useState(false);
  const presentation = useMemo(
    () => deriveSchedulePresentation(result, interviewers, canonicalBlocks),
    [canonicalBlocks, interviewers, result],
  );
  const interviewerByName = useMemo(
    () =>
      new Map(
        interviewers.map((interviewer) => [interviewer.name, interviewer]),
      ),
    [interviewers],
  );
  const lockedAssignments = useMemo(() => {
    // Incremental multi-day solving: when the in-memory draft has no
    // placements (e.g. just after the page loads, or after the user
    // discarded the result), fall back to the server's saved schedule
    // and treat every persisted row as locked. Without this, re-running
    // the solver on more enabled days would discard the partial plan
    // the admin already saved.
    const fromDraft = buildLockedAssignments(
      result?.schedule ?? [],
      candidates,
      interviewers,
    );
    if (fromDraft.length > 0) return fromDraft;
    if (savedSchedule && savedSchedule.schedule.length > 0) {
      return buildLockedAssignments(
        savedSchedule.schedule,
        candidates,
        interviewers,
        { includeUnlockedItems: true },
      );
    }
    return fromDraft;
  }, [candidates, interviewers, result, savedSchedule]);
  const explicitLockedAssignments = useMemo(
    () =>
      buildLockedAssignments(result?.schedule ?? [], candidates, interviewers),
    [candidates, interviewers, result],
  );
  const enabledTimeOptions = useMemo(
    () => deriveEnabledTimeOptions(enabledSlots, dates, sessionDuration),
    [dates, enabledSlots, sessionDuration],
  );
  const timeOptionsFor = useCallback(
    (scheduleIndex: number) =>
      deriveAvailableTimeOptions(
        enabledTimeOptions,
        result?.schedule ?? [],
        scheduleIndex,
      ),
    [enabledTimeOptions, result],
  );

  const markTouchedScheduleIndexes = useCallback((indexes: number[]) => {
    touchedScheduleIndexesRef.current = [
      ...new Set([...touchedScheduleIndexesRef.current, ...indexes]),
    ];
  }, []);

  const consumeTouchedScheduleIndexes = useCallback(() => {
    const indexes = touchedScheduleIndexesRef.current;
    touchedScheduleIndexesRef.current = [];
    return indexes;
  }, []);

  const beginEditSession = useCallback(() => {
    editBaselineRef.current =
      result && hasSchedule(result.status) ? result : null;
    touchedScheduleIndexesRef.current = [];
    setCanRestoreEditSession(false);
  }, [result]);

  const finishEditSession = useCallback(() => {
    editBaselineRef.current = null;
    touchedScheduleIndexesRef.current = [];
    setCanRestoreEditSession(false);
  }, []);

  const restoreEditSession = useCallback(() => {
    if (!editBaselineRef.current || !canRestoreEditSession) return;
    onModify();
    setResult(editBaselineRef.current);
    setCanRestoreEditSession(false);
  }, [canRestoreEditSession, onModify, setResult]);

  const updateScheduleItem = useCallback(
    (scheduleIndex: number, updater: (item: ScheduleItem) => ScheduleItem) => {
      if (
        !result ||
        !hasSchedule(result.status) ||
        !result.schedule[scheduleIndex]
      ) {
        return;
      }
      const currentItem = result.schedule[scheduleIndex];
      if (updater(currentItem) === currentItem) return;
      markTouchedScheduleIndexes([scheduleIndex]);
      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      onModify();
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        return {
          ...current,
          schedule: current.schedule.map((item, index) =>
            index === scheduleIndex ? updater(item) : item,
          ),
        };
      });
    },
    [markTouchedScheduleIndexes, onModify, result, setResult],
  );

  const changeTime = useCallback(
    (scheduleIndex: number, nextValue: string) => {
      const nextTime = Number(nextValue);
      if (!Number.isFinite(nextTime)) return;
      updateScheduleItem(scheduleIndex, (item) => {
        if (item.time === nextTime) return item;
        return {
          ...item,
          time: nextTime,
          locked: true,
          booking_source: "manual",
        };
      });
    },
    [updateScheduleItem],
  );

  const toggleLock = useCallback(
    (scheduleIndex: number) => {
      updateScheduleItem(scheduleIndex, toggleScheduleDraftLock);
    },
    [updateScheduleItem],
  );

  const swapPanelMember = useCallback(
    (
      scheduleIndex: number,
      panelMemberIndex: number,
      newName: string,
      newId?: string,
    ) => {
      const replacement =
        (newId
          ? interviewers.find((interviewer) => interviewer.id === newId)
          : undefined) ?? interviewerByName.get(newName);
      updateScheduleItem(scheduleIndex, (item) => {
        const replacementId = replacement?.id ?? newId;
        const isDuplicate = item.panel.some((member, index) => {
          if (index === panelMemberIndex) return false;
          if (replacementId && member.id) return member.id === replacementId;
          return member.name === newName;
        });
        if (isDuplicate) return item;
        return {
          ...item,
          locked: true,
          booking_source: "manual",
          panel: item.panel.map((member, index) =>
            index === panelMemberIndex
              ? {
                  ...member,
                  id: replacement?.id ?? member.id,
                  name: newName,
                  is_overtime: replacement
                    ? !replacement.availability.includes(item.time)
                    : member.is_overtime,
                }
              : member,
          ),
        };
      });
    },
    [interviewerByName, interviewers, updateScheduleItem],
  );

  const swapTimes = useCallback(
    (sourceScheduleIndex: number, targetScheduleIndex: number) => {
      if (sourceScheduleIndex === targetScheduleIndex) return;
      if (
        !result ||
        !hasSchedule(result.status) ||
        !result.schedule[sourceScheduleIndex] ||
        !result.schedule[targetScheduleIndex]
      ) {
        return;
      }
      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      markTouchedScheduleIndexes([sourceScheduleIndex, targetScheduleIndex]);
      onModify();
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        const source = current.schedule[sourceScheduleIndex];
        const target = current.schedule[targetScheduleIndex];
        if (!source || !target) return current;
        return {
          ...current,
          schedule: current.schedule.map((item, index) => {
            if (index === sourceScheduleIndex) {
              return {
                ...item,
                time: target.time,
                locked: true,
                booking_source: "manual",
              };
            }
            if (index === targetScheduleIndex) {
              return {
                ...item,
                time: source.time,
                locked: true,
                booking_source: "manual",
              };
            }
            return item;
          }),
        };
      });
    },
    [markTouchedScheduleIndexes, onModify, result, setResult],
  );

  const moveItems = useCallback(
    (scheduleIndexes: number[], nextTime: number) => {
      if (
        !result ||
        !hasSchedule(result.status) ||
        scheduleIndexes.length === 0 ||
        !Number.isFinite(nextTime)
      ) {
        return;
      }
      const indexes = [...new Set(scheduleIndexes)].filter(
        (index) => result.schedule[index],
      );
      if (indexes.length === 0) return;
      const sourceTimes = indexes.map((index) => result.schedule[index].time);
      const sourceStart = Math.min(...sourceTimes);
      const movedTimes = sourceTimes.map(
        (time) => nextTime + (time - sourceStart),
      );
      const movedIndexSet = new Set(indexes);
      const occupiedByOther = new Set(
        result.schedule
          .filter((_, index) => !movedIndexSet.has(index))
          .map((item) => item.time),
      );
      if (movedTimes.some((time) => occupiedByOther.has(time))) return;
      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      markTouchedScheduleIndexes(indexes);
      onModify();
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        return {
          ...current,
          schedule: current.schedule.map((item, index) => {
            const movedIndex = indexes.indexOf(index);
            if (movedIndex < 0) return item;
            return {
              ...item,
              time: movedTimes[movedIndex],
              locked: true,
              booking_source: "manual",
            };
          }),
        };
      });
    },
    [markTouchedScheduleIndexes, onModify, result, setResult],
  );

  return {
    presentation,
    lockedAssignments,
    explicitLockedAssignments,
    canRestoreEditSession,
    beginEditSession,
    restoreEditSession,
    finishEditSession,
    timeOptionsFor,
    toggleLock,
    changeTime,
    moveItems,
    swapTimes,
    swapPanelMember,
    consumeTouchedScheduleIndexes,
  };
};
