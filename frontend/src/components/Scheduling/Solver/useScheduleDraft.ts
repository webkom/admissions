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
  panelSize: number;
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
  /** Unlock every locked row in one go and demote any "manual" booking
   *  source back to "solver" so a re-solve is free to move them. */
  unlockAll: () => void;
  changeTime: (scheduleIndex: number, nextTime: string) => void;
  moveItems: (scheduleIndexes: number[], nextTime: number) => void;
  swapTimes: (sourceScheduleIndex: number, targetScheduleIndex: number) => void;
  swapGroups: (
    sourceIndexes: number[],
    targetIndexes: number[],
    sourceBlockSlots?: number[],
    targetBlockSlots?: number[],
  ) => void;
  swapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  replaceBlockPanelMember: (
    scheduleIndexes: number[],
    oldMemberName: string,
    newName: string,
    newId?: string,
  ) => void;
  /** Hand-place an unplaced candidate into a chosen time. Picks a
   *  non-biased, available panel greedily and appends the row to
   *  `result.schedule` marked as a manual, locked booking. The candidate
   *  is removed from `result.unplaceable`. */
  assignUnplacedCandidate: (args: {
    candidateId?: string;
    candidateName: string;
    time: number;
  }) => { ok: boolean; reason?: string };
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
  panelSize,
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

  const unlockAll = useCallback(() => {
    const current = result;
    if (!current || !hasSchedule(current.status)) return;
    const unlockedIndexes: number[] = [];
    const nextSchedule = current.schedule.map((item, index) => {
      if (!item.locked) return item;
      unlockedIndexes.push(index);
      return {
        ...item,
        locked: false,
        booking_source:
          item.booking_source === "manual"
            ? ("solver" as const)
            : item.booking_source,
      };
    });
    if (unlockedIndexes.length === 0) return;
    setResult({ ...current, schedule: nextSchedule });
    markTouchedScheduleIndexes(unlockedIndexes);
    onModify?.();
  }, [markTouchedScheduleIndexes, onModify, result, setResult]);

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

  const replaceBlockPanelMember = useCallback(
    (
      scheduleIndexes: number[],
      oldMemberName: string,
      newName: string,
      newId?: string,
    ) => {
      if (
        !result ||
        !hasSchedule(result.status) ||
        scheduleIndexes.length === 0
      ) {
        return;
      }
      const replacement =
        (newId
          ? interviewers.find((interviewer) => interviewer.id === newId)
          : undefined) ?? interviewerByName.get(newName);
      const replacementId = replacement?.id ?? newId;

      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      markTouchedScheduleIndexes(scheduleIndexes);
      onModify();
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        return {
          ...current,
          schedule: current.schedule.map((item, index) => {
            if (!scheduleIndexes.includes(index)) return item;
            const panelMemberIndex = item.panel.findIndex(
              (m) =>
                (m.id && replacementId && m.id === oldMemberName) ||
                m.name === oldMemberName,
            );
            if (panelMemberIndex === -1) return item;
            const isDuplicate = item.panel.some((member, idx) => {
              if (idx === panelMemberIndex) return false;
              if (replacementId && member.id)
                return member.id === replacementId;
              return member.name === newName;
            });
            if (isDuplicate) return item;
            return {
              ...item,
              locked: true,
              booking_source: "manual",
              panel: item.panel.map((member, idx) =>
                idx === panelMemberIndex
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
          }),
        };
      });
    },
    [
      interviewerByName,
      interviewers,
      markTouchedScheduleIndexes,
      onModify,
      result,
      setResult,
    ],
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
                candidate: target.candidate,
                candidate_id: target.candidate_id,
                interview_status: target.interview_status,
                interview_status_updated_at: target.interview_status_updated_at,
                interview_status_updated_by: target.interview_status_updated_by,
                candidate_phone: target.candidate_phone,
                locked: true,
                booking_source: "manual",
              };
            }
            if (index === targetScheduleIndex) {
              return {
                ...item,
                candidate: source.candidate,
                candidate_id: source.candidate_id,
                interview_status: source.interview_status,
                interview_status_updated_at: source.interview_status_updated_at,
                interview_status_updated_by: source.interview_status_updated_by,
                candidate_phone: source.candidate_phone,
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

  const swapGroups = useCallback(
    (
      sourceIndexes: number[],
      targetIndexes: number[],
      sourceBlockSlots?: number[],
      targetBlockSlots?: number[],
    ) => {
      if (
        !result ||
        !hasSchedule(result.status) ||
        sourceIndexes.length === 0 ||
        targetIndexes.length === 0
      ) {
        return;
      }
      const uniqueSource = [...new Set(sourceIndexes)].filter(
        (i) => result.schedule[i],
      );
      const uniqueTarget = [...new Set(targetIndexes)].filter(
        (i) => result.schedule[i],
      );
      if (uniqueSource.length === 0 || uniqueTarget.length === 0) return;
      if (uniqueSource.some((i) => uniqueTarget.includes(i))) return;

      uniqueSource.sort(
        (a, b) => result.schedule[a].time - result.schedule[b].time,
      );
      uniqueTarget.sort(
        (a, b) => result.schedule[a].time - result.schedule[b].time,
      );

      // Determine the slot times for source and target blocks
      const findBlock = (slots?: number[], indexes?: number[]) => {
        if (slots && slots.length > 0) return [...slots].sort((a, b) => a - b);
        if (indexes && indexes.length > 0) {
          const itemTimes = indexes.map((i) => result.schedule[i].time);
          const found = canonicalBlocks.find((b) =>
            itemTimes.some((t) => b.includes(t)),
          );
          if (found && found.length > 0)
            return [...found].sort((a, b) => a - b);
        }
        return undefined;
      };

      let slotsA = findBlock(sourceBlockSlots, uniqueSource);
      let slotsB = findBlock(targetBlockSlots, uniqueTarget);

      if (!slotsA || slotsA.length === 0) {
        const start = Math.min(
          ...uniqueSource.map((i) => result.schedule[i].time),
        );
        slotsA = Array.from(
          { length: Math.max(uniqueSource.length, uniqueTarget.length) },
          (_, idx) => start + idx * sessionDuration,
        );
      }
      if (!slotsB || slotsB.length === 0) {
        const start = Math.min(
          ...uniqueTarget.map((i) => result.schedule[i].time),
        );
        slotsB = Array.from(
          { length: Math.max(uniqueSource.length, uniqueTarget.length) },
          (_, idx) => start + idx * sessionDuration,
        );
      }

      // Map each item in source to slot in B
      const newTimes = new Map<number, number>();
      uniqueSource.forEach((scheduleIndex, idx) => {
        const newTime =
          idx < slotsB.length
            ? slotsB[idx]
            : slotsB[slotsB.length - 1] +
              (idx - slotsB.length + 1) * sessionDuration;
        newTimes.set(scheduleIndex, newTime);
      });

      // Map each item in target to slot in A
      uniqueTarget.forEach((scheduleIndex, idx) => {
        const newTime =
          idx < slotsA.length
            ? slotsA[idx]
            : slotsA[slotsA.length - 1] +
              (idx - slotsA.length + 1) * sessionDuration;
        newTimes.set(scheduleIndex, newTime);
      });

      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      markTouchedScheduleIndexes([...uniqueSource, ...uniqueTarget]);
      onModify();
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        return {
          ...current,
          schedule: current.schedule.map((item, index) => {
            const mappedTime = newTimes.get(index);
            if (mappedTime !== undefined) {
              return {
                ...item,
                time: mappedTime,
                locked: true,
                booking_source: "manual",
              };
            }
            return item;
          }),
        };
      });
    },
    [
      canonicalBlocks,
      markTouchedScheduleIndexes,
      onModify,
      result,
      sessionDuration,
      setResult,
    ],
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
      indexes.sort((a, b) => result.schedule[a].time - result.schedule[b].time);
      const sourceTimes = indexes.map((index) => result.schedule[index].time);
      const sourceStart = Math.min(...sourceTimes);
      const movedTimes = sourceTimes.map(
        (time) => nextTime + (time - sourceStart),
      );
      const movedIndexSet = new Set(indexes);

      const collidingIndexes = result.schedule
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item, index }) =>
            !movedIndexSet.has(index) && movedTimes.includes(item.time),
        )
        .map(({ index }) => index);

      if (collidingIndexes.length > 0) {
        swapGroups(indexes, collidingIndexes);
        return;
      }

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
    [markTouchedScheduleIndexes, onModify, result, setResult, swapGroups],
  );

  const assignUnplacedCandidate = useCallback(
    ({
      candidateId,
      candidateName,
      time,
    }: {
      candidateId?: string;
      candidateName: string;
      time: number;
    }) => {
      if (!result || !hasSchedule(result.status) || !Number.isFinite(time)) {
        return { ok: false, reason: "no_result" };
      }
      const remainingUnplaceable = (result.unplaceable ?? []).filter(
        (entry) =>
          !(
            (candidateId && entry.candidate_id === candidateId) ||
            entry.candidate === candidateName
          ),
      );
      const targetEntry = (result.unplaceable ?? []).find(
        (entry) =>
          (candidateId && entry.candidate_id === candidateId) ||
          entry.candidate === candidateName,
      );
      if (!targetEntry) return { ok: false, reason: "not_unplaceable" };

      // Greedy panel pick: prefer non-biased interviewers who are listed
      // as available for this slot, otherwise fall back to non-biased
      // interviewers who didn't list it (marked as overtime so the
      // user knows). Order by current load so the manual placement
      // doesn't unbalance the rest of the plan.
      const loadById = new Map<string, number>();
      interviewers.forEach((interviewer) => loadById.set(interviewer.id, 0));
      result.schedule.forEach((item) => {
        item.panel.forEach((member) => {
          if (!member.id) return;
          loadById.set(member.id, (loadById.get(member.id) ?? 0) + 1);
        });
      });

      const sortedInterviewers = [...interviewers].sort((a, b) => {
        const loadA = loadById.get(a.id) ?? 0;
        const loadB = loadById.get(b.id) ?? 0;
        if (loadA !== loadB) return loadA - loadB;
        return a.name.localeCompare(b.name, "nb");
      });

      const isBiasedAgainst = (interviewer: Interviewer) =>
        Boolean(candidateId && interviewer.biased.includes(candidateId));

      const panel: ScheduleItem["panel"] = [];
      let hasOvertime = false;
      for (const interviewer of sortedInterviewers) {
        if (panel.length >= panelSize) break;
        if (isBiasedAgainst(interviewer)) continue;
        const isAvailable = interviewer.availability.includes(time);
        if (!isAvailable) hasOvertime = true;
        panel.push({
          id: interviewer.id,
          name: interviewer.name,
          is_overtime: !isAvailable,
        });
      }

      if (panel.length < panelSize) {
        return { ok: false, reason: "no_panel" };
      }

      const newItem: ScheduleItem = {
        candidate: targetEntry.candidate,
        candidate_id: targetEntry.candidate_id,
        time,
        panel,
        locked: true,
        booking_source: "manual",
      };
      const newIndex = result.schedule.length;
      onModify();
      markTouchedScheduleIndexes([newIndex]);
      setCanRestoreEditSession(Boolean(editBaselineRef.current));
      setResult((current) => {
        if (!current || !hasSchedule(current.status)) return current;
        return {
          ...current,
          schedule: [...current.schedule, newItem],
          unplaceable: remainingUnplaceable,
        };
      });
      return { ok: true, overtime: hasOvertime };
    },
    [
      interviewers,
      markTouchedScheduleIndexes,
      onModify,
      panelSize,
      result,
      setResult,
    ],
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
    unlockAll,
    changeTime,
    moveItems,
    swapTimes,
    swapGroups,
    swapPanelMember,
    replaceBlockPanelMember,
    assignUnplacedCandidate,
    consumeTouchedScheduleIndexes,
  };
};
