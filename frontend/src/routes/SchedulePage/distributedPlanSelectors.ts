import {
  Candidate,
  Interviewer,
  SavedSchedule,
  ScheduleItem,
} from "../../types";
import {
  buildSolveBlocks,
  encodeScheduleTime,
  manualBlocksToSolverBlocks,
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
  biasedFor: (member: {
    id?: string;
    name: string;
    is_overtime?: boolean;
  }) => Set<string> | undefined;
  isCurrentUser: (member: {
    id?: string;
    name: string;
    is_overtime?: boolean;
  }) => boolean;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: { id?: string; name: string; is_overtime?: boolean },
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
      item.candidate_id ?? candidateIdsByName.get(item.candidate),
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

/**
 * Every interview that shares a block (a chunk covered by one repeating
 * panel), keyed by schedule index, so a per-slot panel swap can be blocked
 * when the replacement is inhabil against anyone else in that block.
 *
 * The canonical blocks are built exactly as the solver does - from the saved
 * layout config for standard mode, or the manual block list for manual mode -
 * so a published plan's block grouping never diverges from what the solver
 * produced. Shared by the calendar and table views of the published plan, so
 * a panel swap is blocked on the same grounds regardless of which one an
 * admin happens to be looking at.
 *
 * `fullDates` must be the framework's complete date list, not a
 * date-filtered view - block membership is computed once from the whole
 * schedule and then looked up per row, so a filtered `dates` would silently
 * drop blocks that still need to be checked.
 */
/**
 * The solver's canonical blocks for a saved plan - from the saved layout
 * config in standard mode, or the manual block list in manual mode, exactly
 * as the solver builds them. `fullDates` must be the framework's complete
 * date list, never a filtered view, or day indices shift underneath the
 * block times.
 */
export const buildCanonicalBlocks = (
  savedSchedule: SavedSchedule,
  fullDates: string[],
): number[][] =>
  savedSchedule.block_mode === "manual"
    ? manualBlocksToSolverBlocks(
        savedSchedule.manual_blocks,
        fullDates,
        savedSchedule.session_duration,
      )
    : buildSolveBlocks({
        dates: fullDates,
        dayStartMinute: savedSchedule.day_start_minute,
        dayEndMinute: savedSchedule.day_end_minute,
        sessionDuration: savedSchedule.session_duration,
        chunkSize: savedSchedule.chunk_size,
        chunkBreakMinutes: savedSchedule.chunk_break_minutes,
      });

export const buildBlockCandidateIdsByScheduleIndex = (
  savedSchedule: SavedSchedule,
  fullDates: string[],
  candidateIdFor: (item: ScheduleItem) => string | undefined,
): Map<number, ReadonlySet<string>> => {
  const canonicalBlocks = buildCanonicalBlocks(savedSchedule, fullDates);

  const blockByTime = new Map<number, Set<string>>();
  canonicalBlocks.forEach((block) => {
    const candidateIds = new Set<string>();
    block.forEach((time) => blockByTime.set(time, candidateIds));
    savedSchedule.schedule.forEach((item) => {
      if (!block.includes(item.time)) return;
      const candidateId = candidateIdFor(item);
      if (candidateId) candidateIds.add(candidateId);
    });
  });

  const byScheduleIndex = new Map<number, ReadonlySet<string>>();
  savedSchedule.schedule.forEach((item, scheduleIndex) => {
    const ids = blockByTime.get(item.time);
    if (ids) byScheduleIndex.set(scheduleIndex, ids);
  });
  return byScheduleIndex;
};
