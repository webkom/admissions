import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { Candidate, Interviewer, ScheduleItem } from "../types";
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
  onModify: () => void;
}

export interface ScheduleDraftController {
  presentation: SchedulePresentation;
  lockedAssignments: ReturnType<typeof buildLockedAssignments>;
  timeOptionsFor: (scheduleIndex: number) => number[];
  toggleLock: (scheduleIndex: number) => void;
  changeTime: (scheduleIndex: number, nextTime: string) => void;
  swapTimes: (sourceScheduleIndex: number, targetScheduleIndex: number) => void;
  swapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
}

export const useScheduleDraft = ({
  result,
  setResult,
  candidates,
  interviewers,
  dates,
  enabledSlots,
  sessionDuration,
  onModify,
}: UseScheduleDraftParams): ScheduleDraftController => {
  const presentation = useMemo(
    () => deriveSchedulePresentation(result, interviewers),
    [interviewers, result],
  );
  const interviewerByName = useMemo(
    () =>
      new Map(
        interviewers.map((interviewer) => [interviewer.name, interviewer]),
      ),
    [interviewers],
  );
  const lockedAssignments = useMemo(
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
    [onModify, result, setResult],
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
        };
      });
    },
    [updateScheduleItem],
  );

  const toggleLock = useCallback(
    (scheduleIndex: number) => {
      updateScheduleItem(scheduleIndex, (item) => ({
        ...item,
        locked: !item.locked,
      }));
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
              return { ...item, time: target.time, locked: true };
            }
            if (index === targetScheduleIndex) {
              return { ...item, time: source.time, locked: true };
            }
            return item;
          }),
        };
      });
    },
    [onModify, result, setResult],
  );

  return {
    presentation,
    lockedAssignments,
    timeOptionsFor,
    toggleLock,
    changeTime,
    swapTimes,
    swapPanelMember,
  };
};
