import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { Candidate, Interviewer, SavedSchedule } from "../../types";
import {
  formatMinutes,
  formatAccessibleDate,
} from "src/components/Scheduling/scheduleUtils";
import {
  scheduleHeaderCell,
  scheduleCell,
} from "src/components/Scheduling/scheduleTableStyles";
import {
  selectDistributedScheduleEntries,
  createDistributedPlanLookups,
} from "./distributedPlanSelectors";
import { PanelDiff } from "src/components/Scheduling/PanelDiff";
import { Chip } from "src/components/ui";
import cn from "src/utils/cn";
import { iconSizes } from "src/styles/designTokens";

/**
 * A read-only preview of the draft plan rows, shown inside PublicationGate so
 * an admin can see what they are about to publish without leaving the plan
 * section for the solver. Deliberately lighter than PublishedScheduleTable:
 * no swap picker, no outreach actions, no lock toggles — those are draft
 * editing concerns that belong in the solver, not in the publish gate.
 *
 * Conflict flags and interview status are surfaced because they are the two
 * things an admin needs to eyeball before confirming a publish: "is anyone
 * on a panel they shouldn't be?" and "has anyone been contacted yet?".
 */
const DraftPreview: React.FC<{
  savedSchedule: SavedSchedule;
  candidates: Candidate[];
  interviewers: Interviewer[];
  currentUserName: string;
  currentUserId?: string;
  enabledSlots: Set<string>;
  dates: string[];
}> = ({
  savedSchedule,
  candidates,
  interviewers,
  currentUserName,
  currentUserId,
  enabledSlots,
  dates,
}) => {
  const lookups = useMemo(
    () =>
      createDistributedPlanLookups(
        candidates,
        interviewers,
        currentUserName,
        currentUserId,
      ),
    [candidates, interviewers, currentUserName, currentUserId],
  );

  const { sortedEntries } = useMemo(
    () =>
      selectDistributedScheduleEntries(
        savedSchedule.schedule ?? [],
        false,
        lookups.isCurrentUser,
      ),
    [savedSchedule.schedule, lookups.isCurrentUser],
  );

  // Group entries by date for readability, matching the published table.
  const byDate = useMemo(() => {
    const groups = new Map<string, typeof sortedEntries>();
    for (const entry of sortedEntries) {
      const date = dates.find((d) =>
        enabledSlots.has(`${d}|${entry.item.time}`),
      );
      const key = date ?? dates[0] ?? "Ukjent dato";
      const existing = groups.get(key);
      if (existing) existing.push(entry);
      else groups.set(key, [entry]);
    }
    return groups;
  }, [sortedEntries, dates, enabledSlots]);

  if (sortedEntries.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-border-soft bg-surface-subtle px-4 py-6 text-center text-ui text-text-muted">
        Planutkastet har ingen intervjuer ennå. Generer et utkast i
        planleggingen først.
      </div>
    );
  }

  return (
    <div
      data-cy="draft-preview"
      className="mt-4 overflow-x-auto rounded-lg border border-border-soft"
    >
      <table className="w-full border-collapse text-ui">
        <thead>
          <tr className="border-b border-border-soft bg-surface-subtle">
            <th className={cn(scheduleHeaderCell, "w-24")}>Tidspunkt</th>
            <th className={cn(scheduleHeaderCell, "min-w-0")}>Kandidat</th>
            <th className={scheduleHeaderCell}>Panel</th>
            <th className={cn(scheduleHeaderCell, "w-32")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(byDate.entries()).map(([date, entries]) => (
            <DraftDateGroup
              key={date}
              date={date}
              entries={entries}
              lookups={lookups}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DraftDateGroup: React.FC<{
  date: string;
  entries: Array<{
    item: SavedSchedule["schedule"][number];
    scheduleIndex: number;
  }>;
  lookups: ReturnType<typeof createDistributedPlanLookups>;
}> = ({ date, entries, lookups }) => {
  // Build a block baseline for PanelDiff: the standard panel for this block.
  // For the draft preview, we pass null (no baseline) so PanelDiff shows the
  // full panel inline — the simplest correct rendering.
  return (
    <>
      <tr className="border-b border-border-faint bg-surface-subtle">
        <td
          colSpan={4}
          className="px-4 py-2 text-detail font-semibold text-text-muted"
        >
          {formatAccessibleDate(date)}
        </td>
      </tr>
      {entries.map(({ item, scheduleIndex }) => {
        const candidateId = lookups.candidateIdFor(item);
        const flaggedNames = new Set(
          item.panel
            .filter((member) =>
              lookups.biasedFor(member)?.has(candidateId ?? ""),
            )
            .map((member) => member.name),
        );
        const hasFlagged = flaggedNames.size > 0;
        return (
          <tr
            key={`${scheduleIndex}-${item.time}`}
            className="border-b border-border-faint bg-surface-base"
          >
            <td className={cn(scheduleCell, "tabular-nums")}>
              {formatMinutes(item.time)}
            </td>
            <td className={cn(scheduleCell, "min-w-0")}>
              <span className="truncate font-medium">
                {item.candidate || "—"}
              </span>
            </td>
            <td className={scheduleCell}>
              <PanelDiff
                baseline={null}
                panel={item.panel}
                flaggedNames={flaggedNames}
                isCurrentUser={lookups.isCurrentUser}
              />
            </td>
            <td className={scheduleCell}>
              {hasFlagged ? (
                <Chip tone="danger" className="gap-1">
                  <AlertTriangle size={iconSizes.tiny} aria-hidden="true" />
                  Inhabil
                </Chip>
              ) : item.locked ? (
                <Chip tone="muted">Låst</Chip>
              ) : (
                <Chip tone="brand">Utkast</Chip>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
};

export default DraftPreview;
