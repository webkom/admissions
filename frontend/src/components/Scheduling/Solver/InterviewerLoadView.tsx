import React from "react";

import { EditablePanelChip } from "../ui";
import type {
  Interviewer,
  ScheduleItem,
  SchedulePanelMember,
} from "../../../types";
import cn from "src/utils/cn";
import {
  assignmentAvailabilityLabel,
  type AssignmentAvailabilityStatus,
} from "../assignmentAvailability";

interface InterviewerLoadViewProps {
  entries: { item: ScheduleItem; scheduleIndex: number }[];
  distribution: {
    id: string;
    name: string;
    count: number;
    outsideAvailabilityCount: number;
    unverifiedCount: number;
  }[];
  totalAssignments: number;
  selectedInterviewer: string;
  onSelectInterviewer: (id: string) => void;
  canEditDraft: boolean;
  interviewerOptions: Interviewer[];
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  displayCandidate: (item: ScheduleItem) => string;
  formatSlotTime: (time: number) => string;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
  hasConflictFor: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
}

const InterviewerLoadView = ({
  entries,
  distribution,
  totalAssignments,
  selectedInterviewer,
  onSelectInterviewer,
  canEditDraft,
  interviewerOptions,
  onSwapPanelMember,
  displayCandidate,
  formatSlotTime,
  availabilityStatusFor,
  hasConflictFor,
}: InterviewerLoadViewProps) => {
  const selected = distribution.find(
    (interviewer) => interviewer.id === selectedInterviewer,
  );
  const rows = entries.filter(({ item }) =>
    item.panel.some((member) =>
      member.id ? member.id === selected?.id : member.name === selected?.name,
    ),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-4">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <span className="mb-1 block text-detail font-medium text-text-muted">
            Fordeling
          </span>
          <p className="m-0 text-ui text-text-subtle">
            Klikk på en person for å åpne intervjuene deres.
          </p>
        </div>

        <div className="grid grid-cols-auto-card-md gap-2.5">
          <button
            type="button"
            onClick={() => onSelectInterviewer("")}
            className="rounded-lg border border-border bg-surface-base px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder hover:bg-brand-soft"
          >
            <span className="text-ui font-bold text-text-primary">
              Alle intervjuere
            </span>
            <span className="block text-xl font-extrabold text-text-primary">
              {totalAssignments}
            </span>
            <span className="text-detail font-medium text-text-muted">
              Totale tildelinger
            </span>
          </button>

          {distribution.map((interviewer) => (
            <button
              key={interviewer.id}
              type="button"
              className={cn(
                "rounded-lg border px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder",
                selectedInterviewer === interviewer.id
                  ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
                  : "border-border bg-surface-base hover:bg-brand-soft",
              )}
              onClick={() => onSelectInterviewer(interviewer.id)}
            >
              <span className="text-ui font-bold text-text-primary">
                {interviewer.name}
              </span>
              <span className="block text-xl font-extrabold text-text-primary">
                {interviewer.count}
              </span>
              <span className="text-detail font-medium text-text-muted">
                {interviewer.unverifiedCount > 0
                  ? `${interviewer.unverifiedCount} kan ikke verifiseres`
                  : interviewer.outsideAvailabilityCount > 0
                    ? `${interviewer.outsideAvailabilityCount} utenfor tilgjengelighet`
                    : "Innenfor tilgjengelighet"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!selectedInterviewer ? (
        <div className="rounded-lg border border-border bg-surface-base p-4 text-center text-sm font-semibold text-text-muted">
          Velg en intervjuer for å se intervjuene.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-base p-4 text-center text-sm font-semibold text-text-muted">
          {selected?.name ?? "Intervjueren"} har ingen tildelte intervjuer.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-soft">
          <table className="w-full min-w-schedule-table border-collapse">
            <thead>
              <tr>
                <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                  Tidspunkt
                </th>
                <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                  Kandidat
                </th>
                <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                  Intervjupanel
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, scheduleIndex }) => (
                <tr
                  key={scheduleIndex}
                  className="group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft"
                >
                  <td className="w-schedule-label whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                    {formatSlotTime(item.time)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                    {displayCandidate(item)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {item.panel.map((p, i) => {
                        const availabilityStatus = availabilityStatusFor(
                          item,
                          p,
                        );
                        const availabilityLabel =
                          assignmentAvailabilityLabel(availabilityStatus);
                        const hasConflict = hasConflictFor(scheduleIndex, p);
                        const statusLabel = hasConflict
                          ? "Registrert inhabilitet"
                          : availabilityLabel;
                        return (
                          <EditablePanelChip
                            key={i}
                            label={p.name}
                            tone={
                              availabilityStatus !== "verified"
                                ? "overtime"
                                : "neutral"
                            }
                            conflict={hasConflict}
                            timeIssue={
                              !hasConflict && availabilityStatus !== "verified"
                            }
                            statusLabel={statusLabel ?? undefined}
                            options={
                              canEditDraft
                                ? interviewerOptions.map((iv) => ({
                                    id: iv.id,
                                    name: iv.name,
                                    disabled:
                                      iv.id !== p.id &&
                                      item.panel.some((m) =>
                                        m.id
                                          ? m.id === iv.id
                                          : m.name === iv.name,
                                      ),
                                  }))
                                : undefined
                            }
                            onSelect={
                              canEditDraft
                                ? (newName, newId) =>
                                    onSwapPanelMember(
                                      scheduleIndex,
                                      i,
                                      newName,
                                      newId,
                                    )
                                : undefined
                            }
                            title={
                              canEditDraft
                                ? `Bytt intervjuer${
                                    statusLabel
                                      ? ` — ${statusLabel.toLowerCase()}`
                                      : ""
                                  }`
                                : (statusLabel ?? undefined)
                            }
                          />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InterviewerLoadView;
