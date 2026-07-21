import type { Candidate, Interviewer, ScheduleItem } from "../types";
import type { SchedulePanelMember } from "../../../types";

export interface AssignmentConflictSummary {
  assignmentCount: number;
  affectedCandidateIds: Set<string>;
  affectedCandidateNames: Set<string>;
  affectedScheduleIndexes: Set<number>;
  affectedPanelMemberKeys: Set<string>;
}

export const assignmentPanelMemberKey = (
  scheduleIndex: number,
  member: SchedulePanelMember,
) => `${scheduleIndex}:${member.id ?? `legacy:${member.name}`}`;

export const deriveAssignmentConflictSummary = (
  schedule: ScheduleItem[],
  candidates: Candidate[],
  interviewers: Interviewer[],
): AssignmentConflictSummary => {
  const interviewerById = new Map(
    interviewers.map((interviewer) => [interviewer.id, interviewer]),
  );
  const interviewerByName = new Map(
    interviewers.map((interviewer) => [interviewer.name, interviewer]),
  );
  const candidateIdsByName = new Map<string, string[]>();
  candidates.forEach((candidate) => {
    candidateIdsByName.set(candidate.name, [
      ...(candidateIdsByName.get(candidate.name) ?? []),
      candidate.id,
    ]);
  });
  const affectedCandidateIds = new Set<string>();
  const affectedCandidateNames = new Set<string>();
  const affectedScheduleIndexes = new Set<number>();
  const affectedPanelMemberKeys = new Set<string>();

  schedule.forEach((item, scheduleIndex) => {
    const candidateId =
      item.candidate_id ??
      (candidateIdsByName.get(item.candidate)?.length === 1
        ? candidateIdsByName.get(item.candidate)?.[0]
        : undefined);
    const conflictedMembers = item.panel.filter((member) => {
      const interviewer = member.id
        ? (interviewerById.get(member.id) ?? interviewerByName.get(member.name))
        : interviewerByName.get(member.name);
      return Boolean(
        interviewer && candidateId && interviewer.biased.includes(candidateId),
      );
    });

    if (conflictedMembers.length === 0) return;
    affectedScheduleIndexes.add(scheduleIndex);
    affectedCandidateNames.add(item.candidate);
    if (candidateId) affectedCandidateIds.add(candidateId);
    conflictedMembers.forEach((member) => {
      affectedPanelMemberKeys.add(
        assignmentPanelMemberKey(scheduleIndex, member),
      );
    });
  });

  return {
    assignmentCount: affectedScheduleIndexes.size,
    affectedCandidateIds,
    affectedCandidateNames,
    affectedScheduleIndexes,
    affectedPanelMemberKeys,
  };
};
