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
    blockCount: number;
    adjacentBlockExceptions: number;
    blockStates: Array<{
      blockIndex: number;
      dayIndex: number;
      interviewCount: number;
      status: "work" | "rest";
      isAdjacentException: boolean;
    }>;
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
  const restViolationCount = distribution.reduce(
    (total, interviewer) => total + interviewer.adjacentBlockExceptions,
    0,
  );
  const timeDeviationCount = distribution.reduce(
    (total, interviewer) =>
      total +
      interviewer.outsideAvailabilityCount +
      interviewer.unverifiedCount,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
          <span className="mb-1 block text-detail font-medium text-text-muted">
            Belastning per person
          </span>
          <p className="m-0 text-ui text-text-subtle">
            Klikk på en person for å åpne intervjuene deres.
          </p>
        </div>

        <div
          data-cy="interviewer-workload-list"
          className="overflow-x-auto rounded-lg border border-border-soft bg-surface-base"
        >
          <div className="grid min-w-schedule-table grid-cols-[minmax(9rem,1fr)_5rem_4.5rem_6rem_5rem] gap-2 border-b border-border-soft bg-surface-subtle px-3 py-2 text-label font-semibold uppercase tracking-wide text-text-muted">
            <span>Person</span>
            <span className="text-right">Antall</span>
            <span className="text-right">Arbeidsblokker</span>
            <span className="text-right">Tidsavvik</span>
            <span className="text-right">Hvilebrudd</span>
          </div>
          {distribution.map((interviewer) => {
            const availabilityDeviationCount =
              interviewer.outsideAvailabilityCount +
              interviewer.unverifiedCount;
            return (
              <button
                key={interviewer.id}
                type="button"
                aria-pressed={selectedInterviewer === interviewer.id}
                className={cn(
                  "grid min-w-schedule-table w-full grid-cols-[minmax(9rem,1fr)_5rem_4.5rem_6rem_5rem] items-center gap-2 border-b border-border-faint px-3 py-2.5 text-left text-detail transition-colors last:border-b-0 hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-focus",
                  selectedInterviewer === interviewer.id &&
                    "bg-toggle-active shadow-toggle",
                )}
                onClick={() =>
                  onSelectInterviewer(
                    selectedInterviewer === interviewer.id
                      ? ""
                      : interviewer.id,
                  )
                }
              >
                <span className="min-w-0 truncate font-bold text-text-primary">
                  {interviewer.name}
                </span>
                <span className="text-right font-semibold tabular-nums text-text-primary">
                  {interviewer.count}
                </span>
                <span className="text-right font-semibold tabular-nums text-text-primary">
                  {interviewer.blockCount}
                </span>
                <span
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    availabilityDeviationCount > 0
                      ? "text-amber-800"
                      : "text-text-muted",
                  )}
                  title={`${interviewer.outsideAvailabilityCount} utenfor tilgjengelighet, ${interviewer.unverifiedCount} kan ikke verifiseres`}
                >
                  {availabilityDeviationCount}
                </span>
                <span
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    interviewer.adjacentBlockExceptions > 0
                      ? "text-danger"
                      : "text-success",
                  )}
                >
                  {interviewer.adjacentBlockExceptions}
                </span>
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-2 text-detail text-text-muted">
          {totalAssignments} tildelinger, {timeDeviationCount} tidsavvik,{" "}
          {restViolationCount} hvilebrudd. Velg en person for å se tidslinje og
          intervjuer.
        </p>
      </div>

      {!selectedInterviewer ? (
        <div className="rounded-lg border border-border bg-surface-base p-4 text-center text-sm font-semibold text-text-muted">
          Velg en intervjuer for å se intervjuene.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-detail">
              <span className="font-semibold text-text-primary">
                Arbeid og hvile for {selected?.name}
              </span>
              <span className="text-text-muted">
                {selected?.adjacentBlockExceptions === 0
                  ? "Blokkhvile oppfylt"
                  : `${selected?.adjacentBlockExceptions} unntak`}
              </span>
            </div>
            <div
              data-cy="interviewer-rest-strip"
              className="flex min-w-0 gap-1 overflow-x-auto rounded-md border border-border-soft bg-surface-subtle p-2"
              aria-label={`Arbeids- og hvileblokker for ${selected?.name}`}
            >
              {selected?.blockStates.map((block, index) => {
                const startsNewDay =
                  index > 0 &&
                  block.dayIndex !== selected.blockStates[index - 1].dayIndex;
                const label =
                  block.status === "work"
                    ? `Arbeid, ${block.interviewCount} intervju${
                        block.interviewCount === 1 ? "" : "er"
                      }${
                        block.isAdjacentException
                          ? ", rett etter en arbeidsblokk"
                          : ""
                      }`
                    : "Hvile";
                return (
                  <span
                    key={block.blockIndex}
                    title={label}
                    aria-label={label}
                    className={cn(
                      "h-4 w-7 flex-none rounded-sm border",
                      startsNewDay && "ml-2",
                      block.status === "rest"
                        ? "border-border-soft bg-surface-neutral"
                        : block.isAdjacentException
                          ? "border-danger-border bg-danger-bg"
                          : "border-brand-activeBorder bg-brand-tint",
                    )}
                  />
                );
              })}
            </div>
          </div>
          {rows.length === 0 ? (
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
                            const hasConflict = hasConflictFor(
                              scheduleIndex,
                              p,
                            );
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
                                  !hasConflict &&
                                  availabilityStatus !== "verified"
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
                                          ? ` - ${statusLabel.toLowerCase()}`
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
      )}
    </div>
  );
};

export default InterviewerLoadView;
