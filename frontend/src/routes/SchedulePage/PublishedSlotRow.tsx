import React from "react";
import type { ScheduleItem, SchedulePanelMember } from "../../types";
import { Chip } from "src/components/ui";
import { PanelDiff } from "src/components/Scheduling/PanelDiff";
import {
  scheduleCandidateColumn,
  scheduleCell,
  scheduleRow,
  scheduleTimeCell,
} from "src/components/Scheduling/scheduleTableStyles";
import InterviewStatusControl, {
  interviewStatusChipTone,
} from "src/containers/AdmissionsContainer/InterviewStatusControl";
import {
  getInterviewNextAction,
  getInterviewStatusLabel,
  getInterviewStatusTone,
  interviewNextActionLabels,
} from "src/utils/interviewStatus";
import cn from "src/utils/cn";
import { useAdminUpdateInterviewStatusMutation } from "src/query/mutations";
import { isSensitiveAuthorityChangedError } from "src/query/sensitiveAccess";
import { getApiErrorMessage } from "src/utils/apiErrors";
import InterviewOutreachActions from "./InterviewOutreachActions";
import {
  renderInterviewOutreachTemplate,
  type InterviewOutreachTemplates,
} from "./interviewOutreach";

/** One occupied interview slot in the published plan: a slim, scannable row. */
const PublishedSlotRow: React.FC<{
  admissionSlug: string;
  groupId: string;
  admissionTitle: string;
  committeeName: string;
  item: ScheduleItem;
  candidateNamesVisible: boolean;
  isConflict: boolean;
  /** This time seats several candidates with one shared panel. */
  isJointTime?: boolean;
  outsideAvailability: boolean;
  /** "09:00 – 09:30", or "" for the follow-on rows of a joint interview. */
  timeRangeLabel: string;
  /** Full slot label with date ("tir 12. aug 09:00") for the SMS template. */
  outreachTimeLabel: string;
  /** The block's modal panel, or `null` when the block has no repeating
   *  panel; drives the Panel column via <PanelDiff>. */
  blockBaseline: SchedulePanelMember[] | null;
  canManageInterviewWorkflow: boolean;
  outreachTemplates: InterviewOutreachTemplates;
  lookups: PublishedSlotRowLookups;
}> = ({
  admissionSlug,
  groupId,
  admissionTitle,
  committeeName,
  item,
  candidateNamesVisible,
  isConflict,
  isJointTime = false,
  outsideAvailability,
  timeRangeLabel,
  outreachTimeLabel,
  blockBaseline,
  canManageInterviewWorkflow,
  outreachTemplates,
  lookups,
}) => {
  const statusMutation = useAdminUpdateInterviewStatusMutation(
    admissionSlug,
    "schedule",
    groupId,
  );
  const status = item.interview_status ?? "not_invited";
  const nextOutreachAction = getInterviewNextAction(status);
  const candidateId = item.candidate_id;
  const workflowReady = Boolean(candidateNamesVisible && candidateId);
  const canAct = Boolean(workflowReady && canManageInterviewWorkflow);

  const handleOutreachSend = () => {
    if (
      !candidateId ||
      status !== "not_invited" ||
      !item.interview_status_updated_at
    ) {
      return;
    }
    statusMutation.mutate({
      applicationId: candidateId,
      interviewStatus: "invited",
      expectedInterviewStatusUpdatedAt: item.interview_status_updated_at,
    });
  };

  const candidateFirstName =
    item.candidate.trim().split(/\s+/).filter(Boolean)[0] || item.candidate;
  const renderedSmsBody = renderInterviewOutreachTemplate(
    outreachTemplates.sms.body,
    {
      candidateFullName: item.candidate,
      candidateFirstName,
      admissionTitle,
      timeLabel: outreachTimeLabel,
      committee: committeeName,
    },
  );

  return (
    <tr className={cn(scheduleRow, "last:border-0")}>
      <td className={scheduleTimeCell}>{timeRangeLabel}</td>
      <td className={cn(scheduleCell, scheduleCandidateColumn, "text-left")}>
        {candidateNamesVisible ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span
                title={
                  isConflict
                    ? "Du har meldt inhabilitet for denne kandidaten"
                    : undefined
                }
                className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary",
                  isConflict && "text-danger",
                )}
              >
                {isConflict && (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 flex-none rounded-full bg-danger"
                  />
                )}
                {item.candidate}
              </span>
              {isJointTime && (
                <span className="inline-flex flex-none rounded bg-brand-soft px-1.5 py-0.5 align-middle text-nano font-bold text-brand">
                  Felles
                </span>
              )}
              {outsideAvailability && (
                <span className="inline-flex rounded-full border border-border-soft bg-surface-neutral px-2 py-0.5 align-middle text-nano font-semibold text-text-muted">
                  Utenfor tilgjengelighet
                </span>
              )}
            </div>
            {item.candidate_phone && (
              <span className="text-detail tabular-nums text-text-muted">
                {item.candidate_phone}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-text-muted">—</span>
        )}
      </td>
      <td className={cn(scheduleCell, "min-w-0")}>
        <PanelDiff
          baseline={blockBaseline}
          panel={item.panel}
          flaggedNames={
            new Set(
              item.panel
                .filter((member) =>
                  lookups.biasedFor(member)?.has(item.candidate_id ?? ""),
                )
                .map((member) => member.name),
            )
          }
        />
      </td>
      {canManageInterviewWorkflow && (
        <td className={cn(scheduleCell, "w-48")}>
          {candidateNamesVisible && item.candidate_id ? (
            <InterviewStatusControl
              admissionSlug={admissionSlug}
              groupId={groupId}
              applicationScopeKey="schedule"
              applicationId={item.candidate_id}
              candidateName={item.candidate}
              status={status}
              statusUpdatedAt={item.interview_status_updated_at ?? ""}
              statusUpdatedBy={item.interview_status_updated_by ?? ""}
              canEdit={canManageInterviewWorkflow}
              compact
            />
          ) : (
            <Chip
              tone={interviewStatusChipTone[getInterviewStatusTone(status)]}
            >
              {getInterviewStatusLabel(status)}
            </Chip>
          )}
        </td>
      )}
      <td className={cn(scheduleCell, "w-52")}>
        {canAct && nextOutreachAction ? (
          <InterviewOutreachActions
            candidateName={item.candidate}
            candidatePhone={item.candidate_phone}
            message={renderedSmsBody}
            actionLabel={interviewNextActionLabels[nextOutreachAction]}
            canShare={candidateNamesVisible}
            onSend={handleOutreachSend}
          />
        ) : (
          <span className="text-text-faded" aria-label="Ingen neste handling">
            —
          </span>
        )}
        {statusMutation.isError &&
          !isSensitiveAuthorityChangedError(statusMutation.error) && (
            <span role="alert" className="mt-1 block text-detail text-danger">
              {getApiErrorMessage(
                statusMutation.error,
                "Kunne ikke lagre statusen. Den forrige statusen er gjenopprettet.",
              )}
            </span>
          )}
      </td>
    </tr>
  );
};

interface PublishedSlotRowLookups {
  biasedFor: (member: { id?: string; name: string }) => Set<string> | undefined;
}

export default PublishedSlotRow;
