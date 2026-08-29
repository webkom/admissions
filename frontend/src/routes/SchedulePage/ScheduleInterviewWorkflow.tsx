import React from "react";
import InterviewStatusControl from "src/containers/AdmissionsContainer/InterviewStatusControl";
import { useAdminUpdateInterviewStatusMutation } from "src/query/mutations";
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
  groupId: string;
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
  groupId,
  admissionTitle,
  committeeName,
  item,
  candidateNamesVisible,
  canManageInterviewWorkflow,
  timeLabel,
  outreachTemplates,
  part = "combined",
}) => {
  // Same cache scope as the InterviewStatusControl rendered beside this action
  // (its applicationScopeKey defaults to "schedule"), so the optimistic status
  // bump lands on the entry the status cell reads from.
  const advanceStatusMutation = useAdminUpdateInterviewStatusMutation(
    admissionSlug,
    "schedule",
    groupId,
  );

  if (
    !candidateNamesVisible ||
    !item.candidate_id ||
    !item.interview_status ||
    !item.interview_status_updated_at
  ) {
    return part === "action" ? (
      <span className="text-text-faded" aria-label="Ingen neste handling">
        —
      </span>
    ) : null;
  }

  const statusControl = (
    <InterviewStatusControl
      admissionSlug={admissionSlug}
      groupId={groupId}
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
        —
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
  // Sending the invitation is what moves "Ikke kalt inn" to "Kalt inn" - do it
  // the moment the admin opens the SMS draft or copies the text, so the status
  // does not lag a manual step behind. A reminder does not change status.
  const markInvitationSent = () => {
    if (
      !item.candidate_id ||
      !item.interview_status_updated_at ||
      item.interview_status !== "not_invited"
    ) {
      return;
    }
    advanceStatusMutation.mutate({
      applicationId: item.candidate_id,
      interviewStatus: "invited",
      expectedInterviewStatusUpdatedAt: item.interview_status_updated_at,
    });
  };
  const actionControl = (
    <InterviewOutreachActions
      candidateName={item.candidate}
      candidatePhone={item.candidate_phone}
      message={renderedSmsBody}
      actionLabel={interviewNextActionLabels[nextAction]}
      canShare={candidateNamesVisible}
      onSend={nextAction === "send_invitation" ? markInvitationSent : undefined}
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
