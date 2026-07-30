import type { InterviewStatus } from "src/types";

type InterviewNextAction = "send_invitation" | "send_reminder" | null;

export type InterviewStatusTone = "neutral" | "info" | "success" | "danger";

type InterviewStatusConfig = {
  label: string;
  sortOrder: number;
  tone: InterviewStatusTone;
  nextAction: InterviewNextAction;
};

const interviewStatusConfig = {
  not_invited: {
    label: "Ikke kalt inn",
    sortOrder: 0,
    tone: "neutral",
    nextAction: "send_invitation",
  },
  invited: {
    label: "Kalt inn",
    sortOrder: 1,
    tone: "info",
    nextAction: "send_reminder",
  },
  confirmed: {
    label: "Tid bekreftet",
    sortOrder: 2,
    tone: "success",
    nextAction: null,
  },
  declined: {
    label: "Takket nei",
    sortOrder: 3,
    tone: "danger",
    nextAction: null,
  },
  completed: {
    label: "Intervju gjennomført",
    sortOrder: 4,
    tone: "success",
    nextAction: null,
  },
  cancelled: {
    label: "Avlyst",
    sortOrder: 5,
    tone: "danger",
    nextAction: null,
  },
} as const satisfies Record<InterviewStatus, InterviewStatusConfig>;

export const interviewStatusOptions = (
  Object.keys(interviewStatusConfig) as InterviewStatus[]
)
  .sort(
    (first, second) =>
      interviewStatusConfig[first].sortOrder -
      interviewStatusConfig[second].sortOrder,
  )
  .map((value) => ({
    value,
    label: interviewStatusConfig[value].label,
  }));

export const getInterviewStatusLabel = (status: InterviewStatus): string =>
  interviewStatusConfig[status].label;

export const getInterviewStatusTone = (
  status: InterviewStatus,
): InterviewStatusTone => interviewStatusConfig[status].tone;

export const getInterviewNextAction = (
  status: InterviewStatus,
): InterviewNextAction => interviewStatusConfig[status].nextAction;

export const interviewNextActionLabels = {
  send_invitation: "Send innkalling",
  send_reminder: "Send påminnelse",
} as const satisfies Record<Exclude<InterviewNextAction, null>, string>;

export const compareInterviewStatuses = (
  first: InterviewStatus,
  second: InterviewStatus,
): number =>
  interviewStatusConfig[first].sortOrder -
  interviewStatusConfig[second].sortOrder;
