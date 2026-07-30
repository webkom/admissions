import {
  Candidate,
  Interviewer,
  SavedSchedule,
  ScheduleItem,
  SchedulePanelMember,
} from "../../types";
import {
  encodeScheduleTime,
  parseSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import {
  createAssignmentAvailabilityResolver,
  type AssignmentAvailabilityStatus,
} from "src/components/Scheduling/assignmentAvailability";

export interface DistributedScheduleEntry {
  item: ScheduleItem;
  scheduleIndex: number;
}

export interface ConflictImpact extends DistributedScheduleEntry {
  affectedPanel: Array<{ name: string; panelMemberIndex: number }>;
  myConflictInOwnPanel: boolean;
}

export interface DistributedPlanLookups {
  interviewerOptions: Interviewer[];
  candidateIdFor: (item: ScheduleItem) => string | undefined;
  biasedFor: (member: SchedulePanelMember) => Set<string> | undefined;
  isCurrentUser: (member: { id?: string; name: string }) => boolean;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
}

const uniqueIdByName = (entries: Array<{ id: string; name: string }>) => {
  const grouped = new Map<string, string[]>();
  entries.forEach((entry) => {
    grouped.set(entry.name, [...(grouped.get(entry.name) ?? []), entry.id]);
  });
  return new Map(
    Array.from(grouped.entries())
      .filter(([, ids]) => ids.length === 1)
      .map(([name, ids]) => [name, ids[0]]),
  );
};

export const createDistributedPlanLookups = (
  realCandidates: Candidate[],
  interviewers: Interviewer[],
  currentUserName: string,
  currentUserId?: string,
): DistributedPlanLookups => {
  const candidateIdsByName = uniqueIdByName(realCandidates);
  const interviewerIdsByName = uniqueIdByName(interviewers);
  const biasedByInterviewerId = new Map(
    interviewers.map((interviewer) => [
      interviewer.id,
      new Set(interviewer.biased),
    ]),
  );
  const resolveAvailability =
    createAssignmentAvailabilityResolver(interviewers);

  return {
    interviewerOptions: [...interviewers].sort((a, b) =>
      a.name.localeCompare(b.name, "nb"),
    ),
    candidateIdFor: (item) =>
      item.candidate_visible === false
        ? undefined
        : (item.candidate_id ?? candidateIdsByName.get(item.candidate)),
    biasedFor: (member) => {
      const interviewerId = member.id ?? interviewerIdsByName.get(member.name);
      return interviewerId
        ? biasedByInterviewerId.get(interviewerId)
        : undefined;
    },
    availabilityStatusFor: (item, member) =>
      resolveAvailability(member, item.time),
    isCurrentUser: (member) => {
      if (member.id && currentUserId) return member.id === currentUserId;
      return !member.id && member.name === currentUserName;
    },
  };
};

export const selectDistributedScheduleEntries = (
  schedule: ScheduleItem[],
  myInterviewsOnly: boolean,
  isCurrentUser: DistributedPlanLookups["isCurrentUser"],
) => {
  const sortedEntries = schedule
    .map((item, scheduleIndex) => ({ item, scheduleIndex }))
    .sort((a, b) => a.item.time - b.item.time);
  const myInterviews = sortedEntries.filter(({ item }) =>
    item.panel.some(isCurrentUser),
  );
  return {
    sortedEntries,
    myInterviews,
    displayEntries: myInterviewsOnly ? myInterviews : sortedEntries,
  };
};

export const selectConflictImpacts = (
  entries: DistributedScheduleEntry[],
  conflictIds: ReadonlySet<string>,
  lookups: DistributedPlanLookups,
): ConflictImpact[] =>
  entries
    .map(({ item, scheduleIndex }) => {
      const candidateId = lookups.candidateIdFor(item);
      if (!candidateId) return null;
      const affectedPanel = item.panel
        .map((member, panelMemberIndex) => ({
          name: member.name,
          panelMemberIndex,
        }))
        .filter(({ panelMemberIndex }) =>
          lookups.biasedFor(item.panel[panelMemberIndex])?.has(candidateId),
        );
      const myConflictInOwnPanel =
        conflictIds.has(candidateId) && item.panel.some(lookups.isCurrentUser);
      if (affectedPanel.length === 0 && !myConflictInOwnPanel) return null;
      return {
        item,
        scheduleIndex,
        affectedPanel,
        myConflictInOwnPanel,
      };
    })
    .filter((entry): entry is ConflictImpact => entry !== null);

export const selectEnabledTimeOptions = (
  dates: string[],
  enabledSlots: ReadonlySet<string>,
  sessionDuration: number,
) => {
  const times = new Set<number>();
  enabledSlots.forEach((key) => {
    const { date, minute } = parseSlotKey(key);
    if (!Number.isFinite(minute)) return;
    const dayIndex = dates.indexOf(date);
    if (dayIndex === -1) return;
    times.add(encodeScheduleTime(dayIndex, minute, sessionDuration));
  });
  return Array.from(times).sort((a, b) => a - b);
};

export const selectTimeOptionsForEdit = (
  savedSchedule: SavedSchedule,
  enabledTimeOptions: number[],
  editingTimeIndex: number | null,
) => {
  const occupiedTimes = new Set(
    savedSchedule.schedule.map((item) => item.time),
  );
  const currentTime =
    editingTimeIndex !== null
      ? savedSchedule.schedule[editingTimeIndex]?.time
      : null;
  const selectableTimes =
    currentTime !== null && currentTime !== undefined
      ? Array.from(new Set([...enabledTimeOptions, currentTime])).sort(
          (a, b) => a - b,
        )
      : enabledTimeOptions;
  return selectableTimes.filter(
    (time) => time === currentTime || !occupiedTimes.has(time),
  );
};

export const candidateNamesAreVisible = (
  savedSchedule: SavedSchedule,
  canToggleCandidateNames: boolean,
) =>
  savedSchedule.name_visibility === "committee" ||
  (savedSchedule.name_visibility === "admin_only" && canToggleCandidateNames);
