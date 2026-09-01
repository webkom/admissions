import React, { useMemo, useState } from "react";
import type {
  DistributedPlanLookups,
  DistributedScheduleEntry,
} from "./distributedPlanSelectors";
import {
  buildBlockTimeChunks,
  decodeScheduleTime,
  encodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  formatSlotLabel,
  makeSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import { calculateBlockBaseline } from "src/components/Scheduling/Solver/blockBaseline";
import type {
  ScheduleItem,
  SchedulePanelMember,
  SavedSchedule,
} from "../../types";
import { Chip } from "src/components/ui";
import cn from "src/utils/cn";
import { ScheduleBlockDivider } from "src/components/Scheduling/ScheduleBlockDivider";
import {
  scheduleCandidateColumn,
  scheduleHeaderCell,
  scheduleTableShell,
  scheduleTimeCell,
} from "src/components/Scheduling/scheduleTableStyles";
import type { InterviewOutreachTemplates } from "./interviewOutreach";
import PublishedSlotRow from "./PublishedSlotRow";

interface PlanSlotRow {
  time: number;
  date: string;
  minute: number;
  dayIndex: number;
  blockIndex: number;
  positionInBlock: number;
  enabled: boolean;
  occupied: boolean;
  /** Usually one, but a joint interview seats several candidates at one time. */
  entries: DistributedScheduleEntry[];
}

interface PublishedBlockMeta {
  items: ScheduleItem[];
  /** Modal panel for the block, or null when no panel repeats. */
  baseline: ScheduleItem["panel"] | null;
  /** Union of the block's panel members, for the header when no baseline exists. */
  panelMembers: ScheduleItem["panel"];
  /** First slot start and last slot end, in minutes from midnight. */
  minuteStart: number | null;
  minuteEnd: number | null;
}

/**
 * Compact operations view of the published plan: fixed slim rows, panel
 * diffs against the block baseline, status badges and invitation actions.
 * All structural editing lives in the draft view (unlock the plan to edit).
 */
const PublishedScheduleTable: React.FC<{
  entries: DistributedScheduleEntry[];
  admissionSlug: string;
  groupId: string;
  admissionTitle: string;
  committeeName: string;
  savedSchedule: SavedSchedule;
  dates: string[];
  enabledSlots: Set<string>;
  candidateNamesVisible: boolean;
  isAdmin: boolean;
  canManageInterviewWorkflow: boolean;
  outreachTemplates: InterviewOutreachTemplates;
  conflictIds: ReadonlySet<string>;
  lookups: DistributedPlanLookups;
}> = ({
  entries,
  admissionSlug,
  groupId,
  admissionTitle,
  committeeName,
  savedSchedule,
  dates,
  enabledSlots,
  candidateNamesVisible,
  isAdmin,
  canManageInterviewWorkflow,
  outreachTemplates,
  conflictIds,
  lookups,
}) => {
  const [showEmptySlots, setShowEmptySlots] = useState(false);
  const showBlockGroups =
    savedSchedule.chunk_size > 1 || savedSchedule.chunk_break_minutes > 0;

  const slots = useMemo<PlanSlotRow[]>(() => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute: savedSchedule.day_start_minute,
      dayEndMinute: savedSchedule.day_end_minute,
      sessionDuration: savedSchedule.session_duration,
      chunkSize: savedSchedule.chunk_size,
      chunkBreakMinutes: savedSchedule.chunk_break_minutes,
    });
    const visibleEntriesByTime = new Map<number, DistributedScheduleEntry[]>();
    entries.forEach((entry) => {
      const list = visibleEntriesByTime.get(entry.item.time);
      if (list) list.push(entry);
      else visibleEntriesByTime.set(entry.item.time, [entry]);
    });
    const occupiedTimes = new Set(
      savedSchedule.schedule.map((item) => item.time),
    );
    const configuredTimes = new Set<number>();
    const rows = dates.flatMap((date, dayIndex) =>
      chunks.flatMap((chunk, blockIndex) =>
        chunk.map((minute, positionInBlock) => {
          const time = encodeScheduleTime(
            dayIndex,
            minute,
            savedSchedule.session_duration,
          );
          configuredTimes.add(time);
          return {
            time,
            date,
            minute,
            dayIndex,
            blockIndex,
            positionInBlock,
            enabled: enabledSlots.has(makeSlotKey(date, minute)),
            occupied: occupiedTimes.has(time),
            entries: visibleEntriesByTime.get(time) ?? [],
          };
        }),
      ),
    );

    const configuredTimesWithEntries = new Set<number>();
    entries.forEach((entry) => {
      if (configuredTimes.has(entry.item.time)) return;
      if (configuredTimesWithEntries.has(entry.item.time)) return;
      configuredTimesWithEntries.add(entry.item.time);
      const { dayIndex, minute } = decodeScheduleTime(
        entry.item.time,
        savedSchedule.session_duration,
      );
      const date = dates[dayIndex] ?? "";
      rows.push({
        time: entry.item.time,
        date,
        minute,
        dayIndex,
        blockIndex: -1,
        positionInBlock: 0,
        enabled: Boolean(date && enabledSlots.has(makeSlotKey(date, minute))),
        occupied: true,
        entries: visibleEntriesByTime.get(entry.item.time) ?? [entry],
      });
    });

    return rows.sort((left, right) => left.time - right.time);
  }, [dates, enabledSlots, entries, savedSchedule]);

  const emptySlotsCount = useMemo(
    () => slots.filter((slot) => !slot.occupied && slot.enabled).length,
    [slots],
  );
  const displayedSlots = useMemo(
    () =>
      showEmptySlots ? slots : slots.filter((slot) => slot.entries.length > 0),
    [showEmptySlots, slots],
  );

  const blockMetaByKey = useMemo(() => {
    const map = new Map<string, PublishedBlockMeta>();
    slots.forEach((slot) => {
      if (slot.blockIndex < 0 || slot.entries.length === 0) return;
      const key = `${slot.dayIndex}-${slot.blockIndex}`;
      let meta = map.get(key);
      if (!meta) {
        meta = {
          items: [],
          baseline: null,
          panelMembers: [],
          minuteStart: null,
          minuteEnd: null,
        };
        map.set(key, meta);
      }
      const block = meta;
      if (block.minuteStart === null || slot.minute < block.minuteStart) {
        block.minuteStart = slot.minute;
      }
      const minuteEnd = slot.minute + savedSchedule.session_duration;
      if (block.minuteEnd === null || minuteEnd > block.minuteEnd) {
        block.minuteEnd = minuteEnd;
      }
      slot.entries.forEach((entry) => {
        block.items.push(entry.item);
        entry.item.panel.forEach((member) => {
          if (
            !block.panelMembers.some(
              (existing) => existing.name === member.name,
            )
          ) {
            block.panelMembers.push(member);
          }
        });
      });
    });

    map.forEach((meta) => {
      meta.baseline = calculateBlockBaseline(
        meta.items,
        savedSchedule.panel_size ?? meta.items[0]?.panel.length ?? 0,
      );
    });
    return map;
  }, [savedSchedule.panel_size, savedSchedule.session_duration, slots]);

  const blockBaselineFor = (slot: PlanSlotRow) =>
    (slot.blockIndex >= 0
      ? blockMetaByKey.get(`${slot.dayIndex}-${slot.blockIndex}`)?.baseline
      : null) ?? null;

  return (
    <div className="p-4 sm:p-6">
      <div className={scheduleTableShell}>
        {isAdmin && emptySlotsCount > 0 && (
          <div className="flex items-center justify-end border-b border-border-soft bg-surface-subtle/40 px-4 py-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-detail text-text-muted hover:text-text-primary">
              <input
                type="checkbox"
                checked={showEmptySlots}
                onChange={(e) => setShowEmptySlots(e.target.checked)}
                className="rounded border-border-quiet text-brand focus:ring-brand-ring"
              />
              <span>Vis ledige tidspunkter ({emptySlotsCount})</span>
            </label>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cn(scheduleHeaderCell, "w-36")}>Tidspunkt</th>
                <th className={cn(scheduleHeaderCell, scheduleCandidateColumn)}>
                  Kandidat
                </th>
                <th className={scheduleHeaderCell}>Panel</th>
                <th className={cn(scheduleHeaderCell, "w-48")}>Status</th>
                <th className={cn(scheduleHeaderCell, "w-52")}>
                  Neste handling
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedSlots.map((slot, displayIndex) => {
                const slotEntries = slot.entries;
                const isJointTime = slotEntries.length > 1;
                const previousSlot = displayedSlots[displayIndex - 1];
                const startsGroup =
                  !previousSlot ||
                  previousSlot.dayIndex !== slot.dayIndex ||
                  (showBlockGroups &&
                    previousSlot.blockIndex !== slot.blockIndex);
                const groupDate = slot.date
                  ? formatDateHeader(slot.date)
                  : undefined;
                const blockMeta =
                  slot.blockIndex >= 0
                    ? blockMetaByKey.get(`${slot.dayIndex}-${slot.blockIndex}`)
                    : undefined;

                if (slotEntries.length === 0) {
                  return (
                    <React.Fragment key={`slot-${slot.time}`}>
                      {startsGroup && (
                        <PublishedBlockHeader
                          key={`header-${slot.dayIndex}-${slot.blockIndex}-${slot.time}`}
                          dateLabel={
                            groupDate
                              ? `${groupDate.weekday} ${groupDate.dayMonth}`
                              : `Dag ${slot.dayIndex + 1}`
                          }
                          blockIndex={showBlockGroups ? slot.blockIndex : null}
                          blockMeta={blockMeta}
                          sessionDuration={savedSchedule.session_duration}
                          isCurrentUser={lookups.isCurrentUser}
                        />
                      )}
                      <tr className="border-b border-border-soft bg-surface-base">
                        <td className={scheduleTimeCell}>
                          {formatMinutes(slot.minute)}
                        </td>
                        <td
                          colSpan={4}
                          title={
                            slot.enabled && !slot.occupied
                              ? "Ledig tidsluke"
                              : slot.occupied
                                ? "Opptatt av et intervju utenfor dette filteret"
                                : "Ikke tilgjengelig for intervju"
                          }
                          className={cn(
                            "px-4 py-3 text-ui font-medium",
                            slot.occupied
                              ? "bg-surface-subtle text-text-muted"
                              : slot.enabled
                                ? "text-text-muted"
                                : "bg-surface-neutral text-text-faded [background-image:var(--pattern-unavailable)]",
                          )}
                        >
                          {slot.occupied
                            ? "Opptatt av et annet intervju"
                            : slot.enabled
                              ? "Ledig tidsluke"
                              : "Ikke tilgjengelig"}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={`slot-${slot.time}`}>
                    {startsGroup && (
                      <PublishedBlockHeader
                        dateLabel={
                          groupDate
                            ? `${groupDate.weekday} ${groupDate.dayMonth}`
                            : `Dag ${slot.dayIndex + 1}`
                        }
                        blockIndex={showBlockGroups ? slot.blockIndex : null}
                        blockMeta={blockMeta}
                        sessionDuration={savedSchedule.session_duration}
                        isCurrentUser={lookups.isCurrentUser}
                      />
                    )}
                    {slotEntries.map((entry, entryIndex) => {
                      const candidateId = lookups.candidateIdFor(entry.item);
                      return (
                        <PublishedSlotRow
                          key={`interview-${entry.scheduleIndex}`}
                          admissionSlug={admissionSlug}
                          groupId={groupId}
                          admissionTitle={admissionTitle}
                          committeeName={committeeName}
                          item={entry.item}
                          candidateNamesVisible={candidateNamesVisible}
                          isConflict={
                            candidateId !== undefined &&
                            conflictIds.has(candidateId)
                          }
                          isJointTime={isJointTime}
                          outsideAvailability={!slot.enabled}
                          timeRangeLabel={
                            entryIndex === 0
                              ? `${formatMinutes(slot.minute)} – ${formatMinutes(
                                  slot.minute + savedSchedule.session_duration,
                                )}`
                              : ""
                          }
                          outreachTimeLabel={formatSlotLabel(
                            entry.item.time,
                            dates,
                            savedSchedule.session_duration,
                          )}
                          blockBaseline={blockBaselineFor(slot)}
                          canManageInterviewWorkflow={
                            canManageInterviewWorkflow
                          }
                          outreachTemplates={outreachTemplates}
                          lookups={lookups}
                        />
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PublishedBlockHeader: React.FC<{
  dateLabel: string;
  blockIndex: number | null;
  blockMeta?: PublishedBlockMeta;
  sessionDuration: number;
  isCurrentUser?: (member: SchedulePanelMember) => boolean;
}> = ({ dateLabel, blockIndex, blockMeta, sessionDuration, isCurrentUser }) => {
  const timeSpan =
    blockMeta?.minuteStart !== null &&
    blockMeta?.minuteStart !== undefined &&
    blockMeta?.minuteEnd !== null &&
    blockMeta?.minuteEnd !== undefined
      ? `${formatMinutes(blockMeta.minuteStart)} – ${formatMinutes(
          blockMeta.minuteEnd,
        )}`
      : null;
  const panelMembers = blockMeta?.baseline ?? blockMeta?.panelMembers ?? [];
  const isBlock = blockIndex !== null && blockIndex >= 0;

  return (
    <ScheduleBlockDivider
      colSpan={5}
      title={
        dateLabel +
        (blockIndex !== null
          ? `, ${isBlock ? `Blokk ${blockIndex + 1}` : "Utenfor blokk"}`
          : "")
      }
      timeRange={timeSpan}
      meta={isBlock ? `${sessionDuration} min per intervju` : undefined}
      panel={
        panelMembers.length > 0
          ? panelMembers.map((member, index) => {
              const isMine = Boolean(isCurrentUser?.(member));
              return (
                <Chip
                  key={`${member.name}-${index}`}
                  tone={isMine ? "brand" : "muted"}
                  className={cn(isMine && "font-bold")}
                >
                  {member.name}
                  {isMine && <span className="sr-only"> (deg)</span>}
                </Chip>
              );
            })
          : undefined
      }
    />
  );
};

export default PublishedScheduleTable;
