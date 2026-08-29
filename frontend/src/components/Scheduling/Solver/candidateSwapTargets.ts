import type { ScheduleItem, SchedulePanelMember } from "../types";
import { decodeScheduleTime } from "../scheduleUtils";

export interface CandidateSwapTarget {
  scheduleIndex: number;
  name: string;
  time: number;
  status?: string;
  isConflictFree: boolean;
  conflictReason?: string;
  isSameDay?: boolean;
}

interface DeriveSwapTargetsParams {
  sourceScheduleIndex: number;
  sourceItem: ScheduleItem;
  allEntries: Array<{ item: ScheduleItem; scheduleIndex: number }>;
  dates: string[];
  sessionDuration: number;
  getCandidateId: (item: ScheduleItem) => string | undefined;
  getBiasedInterviewerIds: (
    member: SchedulePanelMember,
  ) => ReadonlySet<string> | Set<string> | undefined;
}

export const deriveCandidateSwapTargets = ({
  sourceScheduleIndex,
  sourceItem,
  allEntries,
  sessionDuration,
  getCandidateId,
  getBiasedInterviewerIds,
}: DeriveSwapTargetsParams): CandidateSwapTarget[] => {
  const sourceCandidateId = getCandidateId(sourceItem);
  const sourceDayIndex = decodeScheduleTime(
    sourceItem.time,
    sessionDuration,
  ).dayIndex;

  const targets: CandidateSwapTarget[] = [];

  for (const {
    item: targetItem,
    scheduleIndex: targetScheduleIndex,
  } of allEntries) {
    if (
      targetScheduleIndex === sourceScheduleIndex ||
      targetItem.time === sourceItem.time
    ) {
      continue;
    }

    const targetCandidateId = getCandidateId(targetItem);
    const targetDayIndex = decodeScheduleTime(
      targetItem.time,
      sessionDuration,
    ).dayIndex;
    const isSameDay = sourceDayIndex === targetDayIndex;

    // Check if any member in target panel has conflict with source candidate
    const targetPanelConflicts: string[] = [];
    if (sourceCandidateId) {
      for (const member of targetItem.panel) {
        const biased = getBiasedInterviewerIds(member);
        if (biased && biased.has(sourceCandidateId)) {
          targetPanelConflicts.push(member.name);
        }
      }
    }

    // Check if any member in source panel has conflict with target candidate
    const sourcePanelConflicts: string[] = [];
    if (targetCandidateId) {
      for (const member of sourceItem.panel) {
        const biased = getBiasedInterviewerIds(member);
        if (biased && biased.has(targetCandidateId)) {
          sourcePanelConflicts.push(member.name);
        }
      }
    }

    let isConflictFree = true;
    let conflictReason: string | undefined = undefined;

    if (targetPanelConflicts.length > 0 && sourcePanelConflicts.length > 0) {
      isConflictFree = false;
      conflictReason = `Inhabil: ${targetPanelConflicts.join(", ")} i målpanel og ${sourcePanelConflicts.join(", ")} i dette panelet`;
    } else if (targetPanelConflicts.length > 0) {
      isConflictFree = false;
      conflictReason = `Inhabil: ${targetPanelConflicts.join(", ")} i mål-panelet`;
    } else if (sourcePanelConflicts.length > 0) {
      isConflictFree = false;
      conflictReason = `Inhabil: ${sourcePanelConflicts.join(", ")} i dette panelet`;
    }

    targets.push({
      scheduleIndex: targetScheduleIndex,
      name: targetItem.candidate,
      time: targetItem.time,
      status: targetItem.interview_status,
      isConflictFree,
      conflictReason,
      isSameDay,
    });
  }

  // Sort: conflict-free first (same-day first, then by time), then conflicted last
  return targets.sort((a, b) => {
    if (a.isConflictFree !== b.isConflictFree) {
      return a.isConflictFree ? -1 : 1;
    }
    if (a.isConflictFree) {
      if (a.isSameDay !== b.isSameDay) {
        return a.isSameDay ? -1 : 1;
      }
    }
    return a.time - b.time;
  });
};
