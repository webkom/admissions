import React from "react";

import { assignmentAvailabilityLabel } from "../assignmentAvailability";
import { EditablePanelChip } from "../ui";
import type { SchedulePanelMember } from "../../../types";
import type { Interviewer, ScheduleItem } from "../types";
import type { AssignmentAvailabilityStatus } from "../assignmentAvailability";
import {
  assignmentPanelMemberKey,
  type AssignmentConflictSummary,
} from "./assignmentConflicts";

interface PanelMemberStatusParams {
  scheduleIndex: number;
  member: SchedulePanelMember;
  availabilityStatus: AssignmentAvailabilityStatus;
  assignmentConflicts: AssignmentConflictSummary;
}

const derivePanelMemberStatus = ({
  scheduleIndex,
  member,
  availabilityStatus,
  assignmentConflicts,
}: PanelMemberStatusParams) => {
  const memberKey = assignmentPanelMemberKey(scheduleIndex, member);
  const hasConflict =
    assignmentConflicts.affectedPanelMemberKeys.has(memberKey);
  const optedOut = assignmentConflicts.optedOutPanelMemberKeys.has(memberKey);

  return {
    hasConflict,
    statusLabel: hasConflict
      ? optedOut
        ? "Deltar ikke lenger"
        : "Registrert inhabilitet"
      : assignmentAvailabilityLabel(availabilityStatus),
    timeIssue: !hasConflict && availabilityStatus !== "verified",
    tone: availabilityStatus !== "verified" ? "overtime" : "neutral",
  } as const;
};

interface PanelMemberChipsProps {
  item: ScheduleItem;
  scheduleIndex: number;
  canEditDraft: boolean;
  interviewerOptions: Interviewer[];
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
  assignmentConflicts: AssignmentConflictSummary;
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
}

const PanelMemberChips = ({
  item,
  scheduleIndex,
  canEditDraft,
  interviewerOptions,
  availabilityStatusFor,
  assignmentConflicts,
  onSwapPanelMember,
}: PanelMemberChipsProps) => (
  <>
    {item.panel.map((member, memberIndex) => {
      const availabilityStatus = availabilityStatusFor(item, member);
      const { hasConflict, statusLabel, timeIssue, tone } =
        derivePanelMemberStatus({
          scheduleIndex,
          member,
          availabilityStatus,
          assignmentConflicts,
        });

      return (
        <EditablePanelChip
          key={`${member.name}-${memberIndex}`}
          label={member.name}
          tone={tone}
          conflict={hasConflict}
          timeIssue={timeIssue}
          statusLabel={statusLabel ?? undefined}
          options={
            canEditDraft
              ? interviewerOptions.map((interviewer) => ({
                  id: interviewer.id,
                  name: interviewer.name,
                  disabled:
                    interviewer.name !== member.name &&
                    item.panel.some(
                      (panelMember) => panelMember.name === interviewer.name,
                    ),
                }))
              : undefined
          }
          onSelect={
            canEditDraft
              ? (newName, newId) =>
                  onSwapPanelMember(scheduleIndex, memberIndex, newName, newId)
              : undefined
          }
          title={
            canEditDraft
              ? `Bytt intervjuer${
                  statusLabel ? ` — ${statusLabel.toLowerCase()}` : ""
                }`
              : (statusLabel ?? undefined)
          }
        />
      );
    })}
  </>
);

export default PanelMemberChips;
