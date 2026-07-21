import type {
  Interviewer,
  ScheduleItem,
  SchedulePanelMember,
} from "../../../types";
import {
  createAssignmentAvailabilityResolver,
  type AssignmentAvailabilityStatus,
} from "../assignmentAvailability";
import {
  parseSlotKey,
  encodeScheduleTime,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import {
  hasSchedule,
  unplaceableSuggestion,
  type SolveResponse,
} from "./solverHelpers";

interface ScheduleEntry {
  item: ScheduleItem;
  scheduleIndex: number;
}

interface InterviewerDistributionEntry {
  id: string;
  name: string;
  count: number;
  outsideAvailabilityCount: number;
  unverifiedCount: number;
}

interface AssignmentAvailabilitySummary {
  missingInterviewerNames: string[];
  unverifiedAssignments: number;
  outsideAvailabilityAssignments: number;
  totalIssues: number;
}

interface ScheduleOverviewStats {
  totalInterviews: number;
  overtimeAssignments: number;
  maxLoad: number;
  minLoad: number;
  usedInterviewers: number;
  totalInterviewers: number;
}

export interface SolverReadiness {
  ready: boolean;
  submittedInterviewers: number;
  enabledSlotCount: number;
  totalCapacity: number;
  neededCapacity: number;
  conflictCount: number;
  slotsWithFullPanel: number;
  usableSlotCount: number;
}

export interface SchedulePresentation {
  sortedEntries: ScheduleEntry[];
  sortedSchedule: ScheduleItem[];
  interviewerDistribution: InterviewerDistributionEntry[];
  interviewerOptions: Interviewer[];
  totalAssignments: number;
  displaySchedule: ScheduleItem[];
  displayCandidate: (candidate: {
    candidate_id?: string;
    candidate: string;
  }) => string;
  unplaceableCandidates: NonNullable<SolveResponse["unplaceable"]>;
  unplaceableSuggestions: string[];
  overviewStats: ScheduleOverviewStats | null;
  lockedCount: number;
  availabilitySummary: AssignmentAvailabilitySummary;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
}

export const deriveSchedulePresentation = (
  result: SolveResponse | null,
  interviewers: Interviewer[],
): SchedulePresentation => {
  const sortedEntries = (result?.schedule ?? [])
    .map((item, scheduleIndex) => ({ item, scheduleIndex }))
    .sort((a, b) => a.item.time - b.item.time);
  const sortedSchedule = sortedEntries.map(({ item }) => item);
  const interviewerOptions = [...interviewers].sort((a, b) =>
    a.name.localeCompare(b.name, "nb"),
  );
  const resolveAvailability =
    createAssignmentAvailabilityResolver(interviewers);
  const availabilityStatusFor = (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => resolveAvailability(member, item.time);
  const interviewerDistribution = buildInterviewerDistribution(
    interviewers,
    sortedSchedule,
    availabilityStatusFor,
  );
  const totalAssignments = interviewerDistribution.reduce(
    (sum, interviewer) => sum + interviewer.count,
    0,
  );
  const candidateAlias = buildCandidateAliases(result, sortedSchedule);
  const displayCandidate = (candidate: {
    candidate_id?: string;
    candidate: string;
  }) => candidateAlias.get(candidateKey(candidate)) ?? candidate.candidate;
  const displaySchedule = sortedSchedule.map((item) => ({
    ...item,
    candidate: displayCandidate(item),
  }));
  const unplaceableCandidates =
    result?.status === "PARTIAL" ? (result.unplaceable ?? []) : [];
  const unplaceableSuggestions = Array.from(
    new Set(
      unplaceableCandidates
        .map(({ reason }) => unplaceableSuggestion(reason))
        .filter((suggestion): suggestion is string => Boolean(suggestion)),
    ),
  );
  const lockedCount = (result?.schedule ?? []).filter(
    (item) => item.locked,
  ).length;
  const missingInterviewerNames = new Set<string>();
  let unverifiedAssignments = 0;
  let outsideAvailabilityAssignments = 0;
  sortedSchedule.forEach((item) => {
    item.panel.forEach((member) => {
      const status = availabilityStatusFor(item, member);
      if (status === "availability_not_submitted") {
        unverifiedAssignments += 1;
        missingInterviewerNames.add(member.name);
      } else if (status === "outside_submitted_availability") {
        outsideAvailabilityAssignments += 1;
      }
    });
  });

  return {
    sortedEntries,
    sortedSchedule,
    interviewerDistribution,
    interviewerOptions,
    totalAssignments,
    displaySchedule,
    displayCandidate,
    unplaceableCandidates,
    unplaceableSuggestions,
    overviewStats: buildOverviewStats(
      result,
      sortedSchedule,
      interviewerDistribution,
      interviewers.length,
    ),
    lockedCount,
    availabilitySummary: {
      missingInterviewerNames: Array.from(missingInterviewerNames).sort(
        (a, b) => a.localeCompare(b, "nb"),
      ),
      unverifiedAssignments,
      outsideAvailabilityAssignments,
      totalIssues: unverifiedAssignments + outsideAvailabilityAssignments,
    },
    availabilityStatusFor,
  };
};

const buildInterviewerDistribution = (
  interviewers: Interviewer[],
  schedule: ScheduleItem[],
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus,
): InterviewerDistributionEntry[] => {
  const counts = new Map<string, InterviewerDistributionEntry>(
    interviewers.map((interviewer) => [
      interviewer.id,
      {
        id: interviewer.id,
        name: interviewer.name,
        count: 0,
        outsideAvailabilityCount: 0,
        unverifiedCount: 0,
      },
    ]),
  );

  schedule.forEach((item) => {
    item.panel.forEach((member) => {
      const key = member.id ?? `legacy:${member.name}`;
      const existing = counts.get(key) ?? {
        id: key,
        name: member.name,
        count: 0,
        outsideAvailabilityCount: 0,
        unverifiedCount: 0,
      };

      existing.count += 1;
      const status = availabilityStatusFor(item, member);
      if (status === "outside_submitted_availability") {
        existing.outsideAvailabilityCount += 1;
      } else if (status === "availability_not_submitted") {
        existing.unverifiedCount += 1;
      }
      counts.set(key, existing);
    });
  });

  return Array.from(counts.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, "nb");
  });
};

const candidateKey = (candidate: {
  candidate_id?: string;
  candidate: string;
}) => candidate.candidate_id ?? `legacy:${candidate.candidate}`;

const buildCandidateAliases = (
  result: SolveResponse | null,
  schedule: ScheduleItem[],
) => {
  const aliases = new Map<string, string>();
  [...schedule, ...(result?.unplaceable ?? [])].forEach((candidate) => {
    const key = candidateKey(candidate);
    if (!aliases.has(key)) aliases.set(key, `Kandidat ${aliases.size + 1}`);
  });
  return aliases;
};

const buildOverviewStats = (
  result: SolveResponse | null,
  schedule: ScheduleItem[],
  distribution: InterviewerDistributionEntry[],
  totalInterviewers: number,
): ScheduleOverviewStats | null => {
  if (!result || !hasSchedule(result.status)) return null;

  const overtimeAssignments = schedule.reduce(
    (sum, item) =>
      sum + item.panel.filter((member) => member.is_overtime).length,
    0,
  );
  const assignedInterviewers = distribution.filter((entry) => entry.count > 0);
  const loads = assignedInterviewers.map((entry) => entry.count);

  return {
    totalInterviews: result.schedule.length,
    overtimeAssignments,
    maxLoad: loads.length > 0 ? Math.max(...loads) : 0,
    minLoad: loads.length > 0 ? Math.min(...loads) : 0,
    usedInterviewers: assignedInterviewers.length,
    totalInterviewers,
  };
};

export const deriveSolverReadiness = ({
  candidateCount,
  interviewers,
  panelSize,
  enabledSlots,
  dates,
  sessionDuration,
  allowOvertime,
}: {
  candidateCount: number;
  interviewers: Interviewer[];
  panelSize: number;
  enabledSlots: Set<string>;
  dates: string[];
  sessionDuration: number;
  allowOvertime: boolean;
}): SolverReadiness => {
  let submittedInterviewers = 0;
  let totalCapacity = 0;
  let conflictCount = 0;
  const coverageByTime = new Map<number, number>();

  interviewers.forEach((interviewer) => {
    if (interviewer.availability.length > 0) submittedInterviewers += 1;
    totalCapacity += interviewer.availability.length;
    conflictCount += interviewer.biased.length;
    new Set(interviewer.availability).forEach((time) => {
      coverageByTime.set(time, (coverageByTime.get(time) ?? 0) + 1);
    });
  });

  const enabledTimes = slotsToSolverAvailability(
    enabledSlots,
    dates,
    sessionDuration,
  );
  const slotsWithFullPanel = enabledTimes.filter(
    (time) => (coverageByTime.get(time) ?? 0) >= panelSize,
  ).length;
  const usableSlotCount = allowOvertime
    ? enabledTimes.length
    : slotsWithFullPanel;
  const neededCapacity = candidateCount * panelSize;
  const availabilityReady =
    allowOvertime ||
    (submittedInterviewers >= panelSize &&
      slotsWithFullPanel >= candidateCount &&
      totalCapacity >= neededCapacity);

  return {
    ready:
      candidateCount > 0 &&
      interviewers.length >= panelSize &&
      usableSlotCount >= candidateCount &&
      availabilityReady,
    submittedInterviewers,
    enabledSlotCount: enabledSlots.size,
    totalCapacity,
    neededCapacity,
    conflictCount,
    slotsWithFullPanel,
    usableSlotCount,
  };
};

export const deriveEnabledTimeOptions = (
  enabledSlots: Set<string>,
  dates: string[],
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

export const deriveAvailableTimeOptions = (
  enabledTimeOptions: number[],
  schedule: ScheduleItem[],
  editingTimeIndex: number | null,
) => {
  const currentTime =
    editingTimeIndex === null
      ? null
      : (schedule[editingTimeIndex]?.time ?? null);
  const occupiedTimes = new Set(schedule.map((item) => item.time));
  const selectableTimes =
    currentTime === null
      ? enabledTimeOptions
      : Array.from(new Set([...enabledTimeOptions, currentTime])).sort(
          (a, b) => a - b,
        );
  return selectableTimes.filter(
    (time) => time === currentTime || !occupiedTimes.has(time),
  );
};
