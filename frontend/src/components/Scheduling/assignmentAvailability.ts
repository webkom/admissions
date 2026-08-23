import type { Interviewer, SchedulePanelMember } from "../../types";

export type AssignmentAvailabilityStatus =
  | "verified"
  | "availability_not_submitted"
  | "outside_submitted_availability";

export const assignmentAvailabilityLabel = (
  status: AssignmentAvailabilityStatus,
): string | null => {
  if (status === "availability_not_submitted") {
    return "Kan ikke verifiseres – tilgjengelighet mangler";
  }
  if (status === "outside_submitted_availability") {
    return "Utenfor oppgitt tilgjengelighet";
  }
  return null;
};

export const createAssignmentAvailabilityResolver = (
  interviewers: Interviewer[],
) => {
  const interviewerById = new Map(
    interviewers.map((interviewer) => [interviewer.id, interviewer]),
  );
  const uniqueInterviewerByName = new Map<string, Interviewer>();
  const duplicateNames = new Set<string>();

  interviewers.forEach((interviewer) => {
    if (uniqueInterviewerByName.has(interviewer.name)) {
      duplicateNames.add(interviewer.name);
      uniqueInterviewerByName.delete(interviewer.name);
      return;
    }
    if (!duplicateNames.has(interviewer.name)) {
      uniqueInterviewerByName.set(interviewer.name, interviewer);
    }
  });

  return (member: SchedulePanelMember, time: number) => {
    const interviewer = member.id
      ? interviewerById.get(member.id)
      : uniqueInterviewerByName.get(member.name);

    // Legacy schedule rows may not resolve to a current participant. Preserve
    // the canonical API signal in that case without claiming they submitted.
    if (!interviewer) {
      return member.is_overtime ? "outside_submitted_availability" : "verified";
    }
    if (!interviewer.has_submitted) return "availability_not_submitted";
    return interviewer.availability.includes(time)
      ? "verified"
      : "outside_submitted_availability";
  };
};
