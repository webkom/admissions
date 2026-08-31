import React, { useCallback, useMemo, useState } from "react";
import { ArrowUpDown, GripVertical } from "lucide-react";
import { EditablePanelChip } from "../ui";
import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SchedulePanelMember,
} from "../types";
import {
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
} from "../scheduleUtils";
import type { AssignmentAvailabilityStatus } from "../assignmentAvailability";
import { calculateBlockBaseline } from "./blockBaseline";
import { DraftSlotRow } from "./DraftSlotRow";
import {
  blockPanelAt,
  eligibleInterviewersFor,
  panelConflictsWithCandidate,
} from "./useScheduleDraft";
import {
  deriveCandidateSwapTargets,
  type CandidateSwapTarget,
} from "./candidateSwapTargets";
import cn from "../../../utils/cn";
import { iconSizes } from "../../../styles/designTokens";

interface ScheduleEntry {
  item: ScheduleItem;
  scheduleIndex: number;
}

type BlockSlot =
  | {
      kind: "entry";
      time: number;
      entry: ScheduleEntry;
    }
  | {
      kind: "open";
      time: number;
    };

interface BlockData {
  key: string;
  dayIndex: number;
  /** 1-based block number within its day, matching the table's "Blokk N". */
  blockNumber: number;
  dateLabel: string;
  timeRangeLabel: string;
  scheduleIndexes: number[];
  entries: ScheduleEntry[];
  /** The block's modal panel: the exact N-member panel shared by the most
   *  slots. `null` when no modal exists; the card then renders each slot's
   *  full panel inline and skips the diff tag entirely. */
  baselinePanel: SchedulePanelMember[] | null;
  candidateIds: string[];
  /** Open slots in the block, so the card can show "3 av 4 luker" fill. */
  slotCount: number;
  /** Open slots (times with no interview), for empty rows. */
  openSlotTimes: number[];
}

export interface BlockInterviewerOption {
  id?: string;
  name: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface DraftBlockCardTableProps {
  entries: ScheduleEntry[];
  canonicalBlocks: number[][];
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  panelSize: number;
  canEditDraft: boolean;
  /** Rows the committee has already been shown. They stay visible in the
   *  draft but hold their time, panel and candidate until the plan is
   *  unlocked, so the rest of the period can be planned around them. */
  isPublishedRow?: (item: ScheduleItem) => boolean;
  currentUserName?: string;
  jointTimes: ReadonlySet<number>;
  selectedDayFilter: number | null;
  formatSlotTime: (time: number) => string;
  getBlockInterviewerOptions: (
    currentMember: SchedulePanelMember,
    blockPanel: SchedulePanelMember[],
    candidateIds: string[],
    blockSlotTimes: number[],
  ) => BlockInterviewerOption[];
  /** Replacement options for a single slot's panel seat. Inhabilitet is checked
   *  against every candidate in the block; availability against that one slot. */
  getSlotInterviewerOptions: (
    currentMember: SchedulePanelMember,
    slotPanel: SchedulePanelMember[],
    slotTime: number,
    blockCandidateIds: string[],
  ) => BlockInterviewerOption[];
  onReplaceBlockPanelMember: (
    scheduleIndexes: number[],
    oldMemberName: string,
    newName: string,
    newId?: string,
  ) => void;
  onSwapPanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => void;
  onSwapCandidates?: (sourceIndex: number, targetIndex: number) => void;
  availabilityStatusFor: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => AssignmentAvailabilityStatus;
  hasConflictFor: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
  onToggleLock: (scheduleIndex: number) => void;
  /** Move / selection state shared with the draft toolbar. */
  moveScope: "interview" | "group";
  groupIndexesByScheduleIndex: Map<number, number[]>;
  selectedListScheduleIndex: number | null;
  draggedListScheduleIndex: number | null;
  listDropTargetIndex: number | null;
  listDropTargetTime: number | null;
  highlightedScheduleIndexes: ReadonlySet<number>;
  onSelectRow: (scheduleIndex: number) => void;
  onDragStartRow: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLButtonElement>,
  ) => void;
  onDragEndRow: () => void;
  onRowDragOver: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onRowDragLeave: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onRowDrop: (
    scheduleIndex: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onEmptySlotDragOver: (
    time: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onEmptySlotDragLeave: (
    time: number,
    event: React.DragEvent<HTMLElement>,
  ) => void;
  onEmptySlotDrop: (time: number, event: React.DragEvent<HTMLElement>) => void;
  onEmptySlotClick: (time: number) => void;
  /** Cancel an interview outright, freeing its slot. Absent when the plan
   *  cannot be edited. */
  onUnassignCandidate?: (scheduleIndex: number) => void;
  /** Candidates still waiting for a place, offered directly on every open
   *  slot so placing one does not require the picker modal. */
  unplacedCandidates?: Array<{ candidate_id: string; candidate: string }>;
  onAssignUnplacedCandidate?: (args: {
    candidateId?: string;
    candidateName: string;
    time: number;
  }) => void;
}

/** Day indexes that already hold at least one interview. */
const plannedDays = (blocks: DayScopedBlock[]): Set<number> => {
  const days = new Set<number>();
  blocks.forEach((block) => {
    if (block.entries.length > 0) days.add(block.dayIndex);
  });
  return days;
};

type DayScopedBlock = Pick<BlockData, "dayIndex" | "entries">;

/** Blocks to render: the day filter first, then the unplanned-day toggle.
 *
 *  The toggle hides whole *days*, not blocks. A day that has any interview
 *  keeps its empty blocks, because those are precisely the slots you would
 *  fill next; a day with nothing at all is what the toggle is for. */
export const visibleBlocks = <T extends DayScopedBlock>(
  blocks: T[],
  selectedDayFilter: number | null,
  hideUnplannedDays: boolean,
): T[] => {
  const scoped =
    selectedDayFilter === null
      ? blocks
      : blocks.filter((block) => block.dayIndex === selectedDayFilter);
  if (!hideUnplannedDays) return scoped;
  // Planned days are derived from every block, not the day-scoped subset, so
  // the two filters stay independent of each other.
  const planned = plannedDays(blocks);
  return scoped.filter((block) => planned.has(block.dayIndex));
};

/** Days with nothing planned yet. The toggle reports this so its label says
 *  what turning it on would actually hide. */
export const countUnplannedDays = (blocks: DayScopedBlock[]): number => {
  const planned = plannedDays(blocks);
  return [...new Set(blocks.map((block) => block.dayIndex))].filter(
    (day) => !planned.has(day),
  ).length;
};

const tableHeaderClass =
  "sticky top-0 z-10 bg-surface-neutral px-4 py-3 text-left text-label font-semibold tracking-label text-text-muted border-b border-border-soft !rounded-none";

const DraftBlockCardTable: React.FC<DraftBlockCardTableProps> = ({
  entries,
  canonicalBlocks,
  candidates,
  interviewers,
  dates,
  sessionDuration,
  panelSize,
  canEditDraft,
  isPublishedRow,
  currentUserName,
  jointTimes,
  selectedDayFilter,
  formatSlotTime,
  getBlockInterviewerOptions,
  getSlotInterviewerOptions,
  onReplaceBlockPanelMember,
  onSwapPanelMember,
  onSwapCandidates,
  availabilityStatusFor,
  hasConflictFor,
  onToggleLock,
  moveScope,
  groupIndexesByScheduleIndex,
  selectedListScheduleIndex,
  draggedListScheduleIndex,
  listDropTargetIndex,
  listDropTargetTime,
  highlightedScheduleIndexes,
  onSelectRow,
  onDragStartRow,
  onDragEndRow,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onEmptySlotDragOver,
  onEmptySlotDragLeave,
  onEmptySlotDrop,
  onEmptySlotClick,
  onUnassignCandidate,
  unplacedCandidates,
  onAssignUnplacedCandidate,
}) => {
  const candidateIdByName = useMemo(() => {
    const map = new Map<string, string>();
    candidates.forEach((candidate) => map.set(candidate.name, candidate.id));
    return map;
  }, [candidates]);

  // Plain candidate names: EditablePanelChip hands the option's `name`
  // straight back as the selection, and assignUnplacedCandidate matches on
  // it when a candidate has no id.
  //
  // Both disabled cases mirror a way the placement would actually fail, so
  // the menu never offers a click that quietly does nothing: inside a block
  // that already has a panel the new interview must join it, and everywhere
  // else the greedy pick needs enough habile interviewers to fill one.
  const optionsForSlot = useCallback(
    (time: number) => {
      const blockPanel = blockPanelAt(
        entries.map((entry) => entry.item),
        canonicalBlocks,
        time,
      );
      return (unplacedCandidates ?? []).map((candidate) => {
        const record = candidates.find(
          (entry) =>
            entry.id === candidate.candidate_id ||
            entry.name === candidate.candidate,
        );
        if (blockPanel) {
          const conflict = panelConflictsWithCandidate(
            blockPanel,
            interviewers,
            candidate.candidate_id,
            record?.user_id,
          );
          return {
            id: candidate.candidate_id || undefined,
            name: candidate.candidate,
            disabled: conflict,
            disabledReason: conflict
              ? "Panelet i denne blokken er inhabilt for kandidaten."
              : undefined,
          };
        }
        const eligible = eligibleInterviewersFor(
          interviewers,
          candidate.candidate_id,
          record?.user_id,
        ).length;
        return {
          id: candidate.candidate_id || undefined,
          name: candidate.candidate,
          disabled: eligible < panelSize,
          disabledReason:
            eligible < panelSize
              ? `Bare ${eligible} habile intervjuere - panelet trenger ${panelSize}.`
              : undefined,
        };
      });
    },
    [
      canonicalBlocks,
      candidates,
      entries,
      interviewers,
      panelSize,
      unplacedCandidates,
    ],
  );
  const canPlaceUnplaced =
    canEditDraft &&
    Boolean(onAssignUnplacedCandidate) &&
    (unplacedCandidates?.length ?? 0) > 0;

  const candidateSwapTargetsMap = useMemo(() => {
    const map = new Map<number, CandidateSwapTarget[]>();
    const biasedMap = new Map<string, Set<string>>();
    interviewers.forEach((inv) => {
      const set = new Set(inv.biased || []);
      if (inv.id) biasedMap.set(inv.id, set);
      biasedMap.set(inv.name, set);
    });

    entries.forEach(({ item, scheduleIndex }) => {
      map.set(
        scheduleIndex,
        deriveCandidateSwapTargets({
          sourceScheduleIndex: scheduleIndex,
          sourceItem: item,
          allEntries: entries,
          dates,
          sessionDuration,
          getCandidateId: (it) =>
            it.candidate_id ?? candidateIdByName.get(it.candidate),
          getBiasedInterviewerIds: (member) =>
            (member.id ? biasedMap.get(member.id) : undefined) ??
            biasedMap.get(member.name),
        }),
      );
    });
    return map;
  }, [candidateIdByName, dates, entries, interviewers, sessionDuration]);

  // Off by default: the whole framework is the useful default view now
  // that an empty block can be filled in place. On, it restores the older
  // behaviour of showing only days that already have something planned.
  const [hideUnplannedDays, setHideUnplannedDays] = useState(false);

  const blocks = useMemo<BlockData[]>(() => {
    const rawBlocks = canonicalBlocks
      .filter((block) => block.length > 0)
      .map((block) => [...block].sort((left, right) => left - right))
      .sort((left, right) => left[0] - right[0]);

    const result: BlockData[] = [];
    const blockNumberByDay = new Map<number, number>();

    rawBlocks.forEach((block) => {
      const blockTimes = new Set(block);
      const blockEntries = entries.filter(({ item }) =>
        blockTimes.has(item.time),
      );

      const { dayIndex, minute: startMinute } = decodeScheduleTime(
        block[0],
        sessionDuration,
      );
      const endMinute =
        decodeScheduleTime(block[block.length - 1], sessionDuration).minute +
        sessionDuration;
      const date = dates[dayIndex];
      const dateHeader = date ? formatDateHeader(date) : null;
      const dateLabel = dateHeader
        ? `${dateHeader.weekday} ${dateHeader.dayMonth}`
        : `Dag ${dayIndex + 1}`;
      const timeRangeLabel = `${formatMinutes(startMinute)}–${formatMinutes(
        endMinute,
      )}`;

      const scheduleIndexes = blockEntries.map((entry) => entry.scheduleIndex);
      const candidateIds = blockEntries
        .map(
          ({ item }) =>
            item.candidate_id ?? candidateIdByName.get(item.candidate),
        )
        .filter(Boolean) as string[];

      const baselinePanel = calculateBlockBaseline(
        blockEntries.map(({ item }) => item),
        panelSize,
      );

      const blockNumber = (blockNumberByDay.get(dayIndex) ?? 0) + 1;
      blockNumberByDay.set(dayIndex, blockNumber);

      const occupiedTimes = new Set(blockEntries.map(({ item }) => item.time));
      const openSlotTimes = block.filter((time) => !occupiedTimes.has(time));

      result.push({
        key: String(block[0]),
        dayIndex,
        blockNumber,
        dateLabel,
        timeRangeLabel,
        scheduleIndexes,
        entries: blockEntries,
        baselinePanel,
        candidateIds,
        slotCount: block.length,
        openSlotTimes,
      });
    });

    return result;
  }, [
    candidateIdByName,
    canonicalBlocks,
    dates,
    entries,
    panelSize,
    sessionDuration,
  ]);

  const activeBlocks = useMemo(
    () => visibleBlocks(blocks, selectedDayFilter, hideUnplannedDays),
    [blocks, hideUnplannedDays, selectedDayFilter],
  );
  const unplannedDayCount = useMemo(() => countUnplannedDays(blocks), [blocks]);

  const coveredScheduleIndexes = useMemo(() => {
    const covered = new Set<number>();
    blocks.forEach((block) => {
      block.scheduleIndexes.forEach((index) => covered.add(index));
    });
    return covered;
  }, [blocks]);

  const unassignedEntries = useMemo(
    () =>
      entries.filter(
        ({ scheduleIndex }) => !coveredScheduleIndexes.has(scheduleIndex),
      ),
    [coveredScheduleIndexes, entries],
  );

  return (
    <div data-cy="block-table" className="flex flex-col gap-4">
      {unplannedDayCount > 0 && (
        <label className="flex items-center gap-2 self-end text-detail font-medium text-text-muted">
          <input
            type="checkbox"
            checked={hideUnplannedDays}
            onChange={(event) => setHideUnplannedDays(event.target.checked)}
            data-cy="hide-unplanned-days"
            className="size-4 accent-brand"
          />
          Skjul {unplannedDayCount} {unplannedDayCount === 1 ? "dag" : "dager"}{" "}
          uten intervjuer
        </label>
      )}
      <div className="overflow-hidden rounded-lg border border-border-soft bg-surface-base shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  className={cn(tableHeaderClass, "w-24 px-1 text-center")}
                  aria-label="Flytt og bytt"
                />
                <th className={cn(tableHeaderClass, "w-36")}>Tidspunkt</th>
                <th className={cn(tableHeaderClass, "w-60")}>Kandidat</th>
                <th className={tableHeaderClass}>Panel</th>
                <th className={cn(tableHeaderClass, "w-16 text-center")}>
                  Lås
                </th>
              </tr>
            </thead>
            <tbody>
              {activeBlocks.map((block) => {
                const isGroupSelected =
                  moveScope === "group" &&
                  selectedListScheduleIndex !== null &&
                  block.scheduleIndexes.includes(selectedListScheduleIndex);

                return (
                  <React.Fragment key={block.key}>
                    {/* Block divider row: Date and count on top line, panel underneath. NO button in header. */}
                    <tr
                      className={cn(
                        "border-y border-border-soft bg-surface-neutral/60 transition-colors",
                        isGroupSelected && "bg-brand-soft/40",
                      )}
                    >
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {/* Top row: Date/Block & Time on left, interview count on right */}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-ui font-bold text-text-primary">
                                {block.dateLabel}, Blokk {block.blockNumber}
                              </span>
                              <span
                                className="inline-flex items-center rounded-md border border-border-soft bg-surface-base px-2 py-0.5 text-label font-semibold tabular-nums text-text-muted shadow-xs"
                                title="Blokkens tidsrom"
                              >
                                {block.timeRangeLabel}
                              </span>
                            </div>
                            <span className="text-label font-medium text-text-muted">
                              {block.entries.length}{" "}
                              {block.entries.length === 1
                                ? "intervju"
                                : "intervjuer"}
                            </span>
                          </div>

                          {/* Bottom row: Panel underneath the date */}
                          {block.baselinePanel &&
                            block.baselinePanel.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="text-label font-semibold text-text-muted">
                                  Panel:
                                </span>
                                {block.baselinePanel.map((member, index) => (
                                  <EditablePanelChip
                                    key={`${member.name}-${index}`}
                                    label={member.name}
                                    variant="plain"
                                    isCurrentUser={
                                      currentUserName === member.name
                                    }
                                    conflict={false}
                                    options={
                                      canEditDraft && block.baselinePanel
                                        ? getBlockInterviewerOptions(
                                            member,
                                            block.baselinePanel,
                                            block.candidateIds,
                                            block.entries.map(
                                              (entry) => entry.item.time,
                                            ),
                                          )
                                        : undefined
                                    }
                                    onSelect={(newName, newId) => {
                                      onReplaceBlockPanelMember(
                                        block.scheduleIndexes,
                                        member.name,
                                        newName,
                                        newId,
                                      );
                                    }}
                                    title="Bytt panelmedlem for hele blokken"
                                    searchPlaceholder="Søk erstatter for blokken…"
                                  />
                                ))}
                              </div>
                            )}
                        </div>
                      </td>
                    </tr>

                    {/* Unified Chronological Slots (Interleaving occupied interviews and open slots) */}
                    {(() => {
                      const allSlots: BlockSlot[] = [
                        ...block.entries.map((entry) => ({
                          kind: "entry" as const,
                          time: entry.item.time,
                          entry,
                        })),
                        ...block.openSlotTimes.map((time) => ({
                          kind: "open" as const,
                          time,
                        })),
                      ].sort((a, b) => a.time - b.time);

                      const groupSpanningCell =
                        moveScope === "group" &&
                        canEditDraft &&
                        block.scheduleIndexes.length > 0 ? (
                          <td
                            rowSpan={allSlots.length}
                            className="w-24 p-1.5 align-middle border-r border-border-soft bg-surface-subtle/30 text-center"
                          >
                            <div className="flex h-full min-h-[90px] w-full flex-col items-center justify-center gap-2 py-2">
                              <button
                                type="button"
                                draggable
                                aria-pressed={isGroupSelected}
                                aria-label={`Flytt hele blokken (${block.dateLabel}, Blokk ${block.blockNumber})`}
                                title="Dra for å flytte hele blokken"
                                onClick={() =>
                                  block.scheduleIndexes[0] !== undefined &&
                                  onSelectRow(block.scheduleIndexes[0])
                                }
                                onDragStart={(event) =>
                                  block.scheduleIndexes[0] !== undefined &&
                                  onDragStartRow(
                                    block.scheduleIndexes[0],
                                    event,
                                  )
                                }
                                onDragEnd={onDragEndRow}
                                className={cn(
                                  "flex flex-1 w-7 min-h-[45px] items-center justify-center rounded-md border transition-all cursor-grab active:cursor-grabbing",
                                  isGroupSelected
                                    ? "border-brand bg-brand text-white shadow-sm ring-2 ring-brand-ring"
                                    : "border-border-soft bg-surface-base text-text-muted hover:border-brand/40 hover:bg-surface-subtle hover:text-text-primary",
                                )}
                              >
                                <GripVertical
                                  size={iconSizes.medium}
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  block.scheduleIndexes[0] !== undefined &&
                                  onSelectRow(block.scheduleIndexes[0])
                                }
                                aria-pressed={isGroupSelected}
                                title={
                                  isGroupSelected
                                    ? "Valgt blokk – klikk en annen blokk for å bytte plass"
                                    : "Klikk for å bytte plass med en annen blokk"
                                }
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-nano font-semibold transition-colors border cursor-pointer",
                                  isGroupSelected
                                    ? "border-brand bg-brand text-white shadow-xs ring-2 ring-brand-ring"
                                    : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle hover:text-text-primary",
                                )}
                              >
                                <ArrowUpDown size={10} aria-hidden="true" />
                                <span>
                                  {isGroupSelected ? "Valgt" : "Bytt"}
                                </span>
                              </button>
                            </div>
                          </td>
                        ) : undefined;

                      return allSlots.map((slot, slotIndex) => {
                        if (slot.kind === "entry") {
                          const { item, scheduleIndex } = slot.entry;
                          const isRowInSelectedGroup =
                            moveScope === "group" &&
                            selectedListScheduleIndex !== null &&
                            (
                              groupIndexesByScheduleIndex.get(
                                selectedListScheduleIndex,
                              ) ?? []
                            ).includes(scheduleIndex);
                          const isRowInDraggedGroup =
                            moveScope === "group" &&
                            draggedListScheduleIndex !== null &&
                            (
                              groupIndexesByScheduleIndex.get(
                                draggedListScheduleIndex,
                              ) ?? []
                            ).includes(scheduleIndex);
                          const isRowSelected =
                            moveScope === "group"
                              ? isRowInSelectedGroup
                              : selectedListScheduleIndex === scheduleIndex;
                          const isRowDragged =
                            moveScope === "group"
                              ? isRowInDraggedGroup
                              : draggedListScheduleIndex === scheduleIndex;
                          const isDropTarget =
                            listDropTargetIndex === scheduleIndex;
                          const isHighlighted =
                            highlightedScheduleIndexes.has(scheduleIndex);

                          return (
                            <DraftSlotRow
                              key={scheduleIndex}
                              scheduleIndex={scheduleIndex}
                              item={item}
                              sessionDuration={sessionDuration}
                              canEditDraft={
                                canEditDraft && !isPublishedRow?.(item)
                              }
                              isPublishedRow={Boolean(isPublishedRow?.(item))}
                              baselinePanel={block.baselinePanel}
                              availabilityStatusFor={availabilityStatusFor}
                              hasConflictFor={hasConflictFor}
                              onToggleLock={onToggleLock}
                              isJointTime={jointTimes.has(item.time)}
                              moveScope={moveScope}
                              isRowSelected={isRowSelected}
                              isRowDragged={isRowDragged}
                              isDropTarget={isDropTarget}
                              isHighlighted={isHighlighted}
                              groupSpanningCell={
                                moveScope === "group" && slotIndex === 0
                                  ? groupSpanningCell
                                  : undefined
                              }
                              renderFlyttCell={moveScope === "interview"}
                              buildReplacementOptions={(currentMember) =>
                                getSlotInterviewerOptions(
                                  currentMember,
                                  item.panel,
                                  item.time,
                                  block.candidateIds,
                                )
                              }
                              onSwapPanelMember={onSwapPanelMember}
                              candidateSwapTargets={candidateSwapTargetsMap.get(
                                scheduleIndex,
                              )}
                              onSwapCandidates={onSwapCandidates}
                              onUnassignCandidate={onUnassignCandidate}
                              formatSlotTime={formatSlotTime}
                              onSelectRow={onSelectRow}
                              onDragStartRow={onDragStartRow}
                              onDragEndRow={onDragEndRow}
                              onRowDragOver={onRowDragOver}
                              onRowDragLeave={onRowDragLeave}
                              onRowDrop={onRowDrop}
                            />
                          );
                        }

                        // Open slot
                        const time = slot.time;
                        const startMinute = decodeScheduleTime(
                          time,
                          sessionDuration,
                        ).minute;
                        const slotLabel = `${formatMinutes(
                          startMinute,
                        )}–${formatMinutes(startMinute + sessionDuration)}`;
                        const isDropTarget = listDropTargetTime === time;

                        return (
                          <tr
                            key={`open-${time}`}
                            onDragOver={(event) =>
                              onEmptySlotDragOver(time, event)
                            }
                            onDragLeave={(event) =>
                              onEmptySlotDragLeave(time, event)
                            }
                            onDrop={(event) => onEmptySlotDrop(time, event)}
                            onClick={() => onEmptySlotClick(time)}
                            className={cn(
                              "border-b border-border-soft bg-surface-base transition-colors cursor-pointer hover:bg-surface-subtle",
                              isDropTarget &&
                                "bg-brand-soft/40 ring-2 ring-inset ring-brand-ring",
                            )}
                          >
                            {moveScope === "group" ? (
                              slotIndex === 0 ? (
                                groupSpanningCell
                              ) : null
                            ) : (
                              <td className="w-24 px-1 py-3 text-center align-middle" />
                            )}
                            <td className="w-36 whitespace-nowrap px-4 py-3 text-ui tabular-nums font-medium text-text-muted align-middle">
                              {slotLabel}
                            </td>
                            <td
                              colSpan={2}
                              className="px-4 py-3 text-ui text-text-muted font-medium align-middle"
                            >
                              <div className="flex items-center justify-between">
                                {canPlaceUnplaced ? (
                                  // The row itself is a move target, so a click
                                  // inside the menu must not also count as
                                  // "drop the selected interview here".
                                  <div
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <EditablePanelChip
                                      variant="plain"
                                      label="Ledig luke — sett inn kandidat"
                                      options={optionsForSlot(time)}
                                      onSelect={(candidateName, candidateId) =>
                                        onAssignUnplacedCandidate?.({
                                          candidateId,
                                          candidateName,
                                          time,
                                        })
                                      }
                                      title="Sett en kandidat som venter på plassering rett inn i denne luken"
                                      searchPlaceholder="Søk kandidat…"
                                      emptyLabel="Ingen treff på søket"
                                    />
                                  </div>
                                ) : (
                                  <span>Ledig luke</span>
                                )}
                                {isDropTarget &&
                                  draggedListScheduleIndex !== null && (
                                    <span className="text-label font-semibold text-brand">
                                      Slipp intervjuet her
                                    </span>
                                  )}
                              </div>
                            </td>
                            <td className="w-16 px-4 py-3 text-center align-middle" />
                          </tr>
                        );
                      });
                    })()}
                  </React.Fragment>
                );
              })}

              {/* Unassigned Entries Outside Blocks */}
              {unassignedEntries.length > 0 && selectedDayFilter === null && (
                <>
                  <tr className="border-y border-border-soft bg-surface-neutral/60">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-ui font-bold text-text-primary">
                          Utenfor blokk
                        </span>
                        <span className="text-label font-medium text-text-muted">
                          · {unassignedEntries.length}{" "}
                          {unassignedEntries.length === 1
                            ? "intervju"
                            : "intervjuer"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {unassignedEntries.map(({ item, scheduleIndex }) => (
                    <tr
                      key={scheduleIndex}
                      className="border-b border-border-soft bg-surface-base hover:bg-surface-subtle transition-colors"
                    >
                      <td className="w-24 whitespace-nowrap px-1 py-3 text-center align-middle">
                        {canEditDraft && (
                          <button
                            type="button"
                            draggable
                            aria-pressed={
                              selectedListScheduleIndex === scheduleIndex
                            }
                            aria-label={`Flytt intervjuet for ${item.candidate}`}
                            onClick={() => onSelectRow(scheduleIndex)}
                            onDragStart={(event) =>
                              onDragStartRow(scheduleIndex, event)
                            }
                            onDragEnd={onDragEndRow}
                            className="inline-flex items-center justify-center p-1 rounded text-text-faded hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical
                              size={iconSizes.detail}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </td>
                      <td className="w-36 whitespace-nowrap px-4 py-3 text-ui tabular-nums font-medium text-text-primary align-middle">
                        {formatSlotTime(item.time)}
                      </td>
                      <td className="w-60 px-4 py-3 text-ui font-semibold text-text-primary align-middle">
                        {item.candidate}
                      </td>
                      <td className="px-4 py-3 text-ui text-text-faded align-middle">
                        —
                      </td>
                      <td className="w-16 px-4 py-3 text-center align-middle" />
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DraftBlockCardTable;
