import React from "react";
import InterviewStatusControl from "src/containers/AdmissionsContainer/InterviewStatusControl";
import type { ScheduleItem } from "src/types";
import {
  getInterviewNextAction,
  interviewNextActionLabels,
} from "src/utils/interviewStatus";
import InterviewOutreachActions from "./InterviewOutreachActions";
import {
  renderInterviewOutreachTemplate,
  type InterviewOutreachTemplates,
} from "./interviewOutreach";

type WorkflowPart = "combined" | "status" | "action";

const ScheduleInterviewWorkflow: React.FC<{
  admissionSlug: string;
  admissionTitle: string;
  committeeName: string;
  item: ScheduleItem;
  candidateNamesVisible: boolean;
  canManageInterviewWorkflow: boolean;
  timeLabel: string;
  outreachTemplates: InterviewOutreachTemplates;
  part?: WorkflowPart;
}> = ({
  admissionSlug,
  admissionTitle,
  committeeName,
  item,
  candidateNamesVisible,
  canManageInterviewWorkflow,
  timeLabel,
  outreachTemplates,
  part = "combined",
}) => {
  if (
    !candidateNamesVisible ||
    !item.candidate_id ||
    !item.interview_status ||
    !item.interview_status_updated_at
  ) {
    return part === "action" ? (
      <span className="text-text-faded" aria-label="Ingen neste handling">
        -
      </span>
    ) : null;
  }

  const statusControl = (
    <InterviewStatusControl
      admissionSlug={admissionSlug}
      applicationId={item.candidate_id}
      candidateName={item.candidate}
      status={item.interview_status}
      statusUpdatedAt={item.interview_status_updated_at}
      statusUpdatedBy={item.interview_status_updated_by ?? ""}
      canEdit={canManageInterviewWorkflow}
      compact
    />
  );

  if (part === "status") return statusControl;

  const nextAction = getInterviewNextAction(item.interview_status);
  if (!canManageInterviewWorkflow || nextAction === null) {
    return part === "action" ? (
      <span className="text-text-faded" aria-label="Ingen neste handling">
        -
      </span>
    ) : (
      statusControl
    );
  }

  const candidateFullName = item.candidate;
  const candidateFirstName =
    candidateFullName.trim().split(/\s+/).filter(Boolean)[0] ||
    candidateFullName;
  const renderValues = {
    candidateFullName,
    candidateFirstName,
    admissionTitle,
    timeLabel,
    committee: committeeName,
  };
  const renderedSmsBody = renderInterviewOutreachTemplate(
    outreachTemplates.sms.body,
    renderValues,
  );
  const actionControl = (
    <InterviewOutreachActions
      candidateName={item.candidate}
      candidatePhone={item.candidate_phone}
      message={renderedSmsBody}
      actionLabel={interviewNextActionLabels[nextAction]}
      canShare={candidateNamesVisible}
    />
  );

  if (part === "action") return actionControl;

  return (
    <div
      className="flex w-full min-w-0 flex-wrap items-center gap-2"
      role="group"
      aria-label="Intervjuoppfølging"
    >
      {statusControl}
      <div className="inline-flex max-w-full min-w-0 items-center border-l border-border-soft pl-2">
        {actionControl}
      </div>
    </div>
  );
};

export default ScheduleInterviewWorkflow;
