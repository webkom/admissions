import React from "react";

import { EditablePanelChip } from "../ui";
import type { Interviewer, ScheduleItem } from "../types";
import cn from "src/utils/cn";

interface InterviewerLoadViewProps {
  entries: { item: ScheduleItem; scheduleIndex: number }[];
  distribution: { name: string; count: number; overtimeCount: number }[];
  totalAssignments: number;
  selectedInterviewer: string;
  onSelectInterviewer: (name: string) => void;
  canEditDraft: boolean;
  interviewerOptions: Interviewer[];
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  displayCandidate: (name: string) => string;
  formatSlotTime: (time: number) => string;
}

/**
 * The "per interviewer" view of a generated plan: a clickable load breakdown
 * and, for the selected interviewer, the interviews they're on.
 */
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
}: InterviewerLoadViewProps) => {
  const rows = entries.filter(({ item }) =>
    item.panel.some((member) => member.name === selectedInterviewer),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-4">
        <div className="mb-[0.6rem] flex flex-wrap items-baseline justify-between gap-3">
          <span className="mb-1 block text-label font-bold uppercase tracking-label text-text-subtle">
            Fordeling
          </span>
          <p className="m-0 text-ui text-text-subtle">
            Klikk på en person for å åpne intervjuene deres.
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[0.6rem]">
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
            <span className="text-label font-bold uppercase tracking-label text-text-subtle">
              Totale tildelinger
            </span>
          </button>

          {distribution.map((interviewer) => (
            <button
              key={interviewer.name}
              type="button"
              className={cn(
                "rounded-lg border px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder",
                selectedInterviewer === interviewer.name
                  ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
                  : "border-border bg-surface-base hover:bg-brand-soft",
              )}
              onClick={() => onSelectInterviewer(interviewer.name)}
            >
              <span className="text-ui font-bold text-text-primary">
                {interviewer.name}
              </span>
              <span className="block text-xl font-extrabold text-text-primary">
                {interviewer.count}
              </span>
              <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                {interviewer.overtimeCount > 0
                  ? `${interviewer.overtimeCount} overtid`
                  : "Ingen overtid"}
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
          {selectedInterviewer} har ingen tildelte intervjuer.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-soft">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                  Tidspunkt
                </th>
                <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                  Kandidat
                </th>
                <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
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
                  <td className="w-[100px] whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                    {formatSlotTime(item.time)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                    {displayCandidate(item.candidate)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-[0.35rem]">
                      {item.panel.map((p, i) => (
                        <EditablePanelChip
                          key={i}
                          label={p.name}
                          tone={p.is_overtime ? "overtime" : "neutral"}
                          options={
                            canEditDraft
                              ? interviewerOptions.map((iv) => ({
                                  id: iv.id,
                                  name: iv.name,
                                  disabled:
                                    iv.name !== p.name &&
                                    item.panel.some((m) => m.name === iv.name),
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
                                  p.is_overtime
                                    ? " — utenfor registrert tilgjengelighet"
                                    : ""
                                }`
                              : p.is_overtime
                                ? "Utenfor registrert tilgjengelighet"
                                : undefined
                          }
                        />
                      ))}
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
