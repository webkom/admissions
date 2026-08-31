import React, { useMemo } from "react";
import GridCalendarView from "src/components/Scheduling/Calendar/GridCalendarView";
import { SavedSchedule } from "../../types";
import {
  DistributedPlanLookups,
  DistributedScheduleEntry,
} from "./distributedPlanSelectors";
import {
  BookingSourceToggle,
  CandidateConflictControl,
  LockToggle,
  PanelMemberList,
} from "./DistributedPlanEntryControls";
import { CustomSelect } from "src/components/Scheduling/ui";
import ScheduleInterviewWorkflow from "./ScheduleInterviewWorkflow";
import {
  buildSolveBlocks,
  formatSlotLabel,
  manualBlocksToSolverBlocks,
} from "src/components/Scheduling/scheduleUtils";
import type { InterviewOutreachTemplates } from "./interviewOutreach";
import CandidateSwapChip, {
  CandidateSwapTarget,
} from "src/components/Scheduling/Solver/CandidateSwapChip";
import { deriveCandidateSwapTargets } from "src/components/Scheduling/Solver/candidateSwapTargets";

const DistributedPlanCalendar: React.FC<{
  entries: DistributedScheduleEntry[];
  admissionSlug: string;
  groupId: string;
  admissionTitle: string;
  committeeName: string;
  savedSchedule: SavedSchedule;
  dates: string[];
  /** Full date list (unfiltered by the date filter), used to rebuild the
   *  solver's canonical blocks with correct day indices when `dates` is a
   *  filtered subset. Defaults to `dates` for backwards compatibility. */
  fullDates?: string[];
  enabledSlots: Set<string>;
  candidateNamesVisible: boolean;
  isEditableDraft: boolean;
  isAdmin: boolean;
  canManageInterviewWorkflow: boolean;
  outreachTemplates: InterviewOutreachTemplates;
  conflictIds: ReadonlySet<string>;
  lockBusy: boolean;
  lookups: DistributedPlanLookups;
  onToggleLock: (scheduleIndex: number) => void;
  onSetBookingSource: (
    scheduleIndex: number,
    source: "solver" | "manual",
  ) => void;
  onChangeTime: (scheduleIndex: number, nextTime: string) => void;
  isChangingTime: boolean;
  getTimeOptionsForEdit: (
    scheduleIndex: number,
  ) => Array<{ value: string; label: string }>;
  onReplacePanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacement: { id?: string; name: string },
  ) => Promise<boolean>;
  onSwapCandidates?: (
    sourceScheduleIndex: number,
    targetScheduleIndex: number,
  ) => Promise<boolean>;
}> = ({
  entries,
  admissionSlug,
  groupId,
  admissionTitle,
  committeeName,
  savedSchedule,
  dates,
  fullDates = dates,
  enabledSlots,
  candidateNamesVisible,
  isEditableDraft,
  isAdmin,
  canManageInterviewWorkflow,
  outreachTemplates,
  conflictIds,
  lockBusy,
  lookups,
  onToggleLock,
  onSetBookingSource,
  onChangeTime,
  isChangingTime,
  getTimeOptionsForEdit,
  onReplacePanelMember,
  onSwapCandidates,
}) => {
  const occupiedTimes = useMemo(
    () => new Set(savedSchedule.schedule.map((item) => item.time)),
    [savedSchedule.schedule],
  );

  // Every interview that shares a block (a chunk covered by one repeating
  // panel), keyed by schedule index, so a per-slot panel swap can be blocked
  // when the replacement is inhabil against anyone else in that block. Built
  // from the full schedule, not the filtered view, so the set stays complete.
  //
  // The canonical blocks are built exactly as the solver does — from the
  // saved layout config for standard mode, or the manual block list for
  // manual mode — so a published plan's block grouping never diverges from
  // what the solver produced.
  const blockCandidateIdsByScheduleIndex = useMemo(() => {
    const canonicalBlocks =
      savedSchedule.block_mode === "manual"
        ? manualBlocksToSolverBlocks(
            savedSchedule.manual_blocks,
            fullDates,
            savedSchedule.session_duration,
          )
        : buildSolveBlocks({
            dates: fullDates,
            dayStartMinute: savedSchedule.day_start_minute,
            dayEndMinute: savedSchedule.day_end_minute,
            sessionDuration: savedSchedule.session_duration,
            chunkSize: savedSchedule.chunk_size,
            chunkBreakMinutes: savedSchedule.chunk_break_minutes,
          });

    const blockByTime = new Map<number, Set<string>>();
    canonicalBlocks.forEach((block) => {
      const candidateIds = new Set<string>();
      block.forEach((time) => blockByTime.set(time, candidateIds));
      savedSchedule.schedule.forEach((item) => {
        if (!block.includes(item.time)) return;
        const candidateId = lookups.candidateIdFor(item);
        if (candidateId) candidateIds.add(candidateId);
      });
    });

    const byScheduleIndex = new Map<number, ReadonlySet<string>>();
    savedSchedule.schedule.forEach((item, scheduleIndex) => {
      const ids = blockByTime.get(item.time);
      if (ids) byScheduleIndex.set(scheduleIndex, ids);
    });
    return byScheduleIndex;
  }, [
    fullDates,
    lookups,
    savedSchedule.block_mode,
    savedSchedule.chunk_break_minutes,
    savedSchedule.chunk_size,
    savedSchedule.day_end_minute,
    savedSchedule.day_start_minute,
    savedSchedule.manual_blocks,
    savedSchedule.schedule,
    savedSchedule.session_duration,
  ]);
  const EMPTY_CANDIDATE_IDS: ReadonlySet<string> = useMemo(() => new Set(), []);

  const swapTargetsByScheduleIndex = useMemo(() => {
    const map = new Map<number, CandidateSwapTarget[]>();
    entries.forEach(({ item, scheduleIndex }) => {
      map.set(
        scheduleIndex,
        deriveCandidateSwapTargets({
          sourceScheduleIndex: scheduleIndex,
          sourceItem: item,
          allEntries: entries,
          dates,
          sessionDuration: savedSchedule.session_duration,
          getCandidateId: (entryItem) => lookups.candidateIdFor(entryItem),
          getBiasedInterviewerIds: (member) => lookups.biasedFor(member),
        }),
      );
    });
    return map;
  }, [dates, entries, lookups, savedSchedule.session_duration]);

  return (
    <div className="px-6 py-4">
      <GridCalendarView
        schedule={entries.map(({ item }) => item)}
        dates={dates}
        sessionDuration={savedSchedule.session_duration}
        dayStartMinute={savedSchedule.day_start_minute}
        dayEndMinute={savedSchedule.day_end_minute}
        chunkSize={savedSchedule.chunk_size}
        chunkBreakMinutes={savedSchedule.chunk_break_minutes}
        availableSlots={enabledSlots}
        occupiedTimes={occupiedTimes}
        showAvailabilityLegend
        moveDisabled={isChangingTime}
        onMoveItem={
          isEditableDraft || isAdmin
            ? (entryIndex, nextTime) => {
                const entry = entries[entryIndex];
                if (!entry) return;
                onChangeTime(entry.scheduleIndex, String(nextTime));
              }
            : undefined
        }
        renderItem={(item, index) => {
          const scheduleIndex = entries[index].scheduleIndex;
          const candidateId = lookups.candidateIdFor(item);
          const isConflict =
            candidateId !== undefined && conflictIds.has(candidateId);
          const timeOptions = getTimeOptionsForEdit(scheduleIndex);
          // The calendar column already provides the weekday, so repeating it
          // in every card makes the time picker overflow its narrow cell.
          const calendarTimeOptions = timeOptions.map((option) => ({
            ...option,
            label: option.label.replace(/^\S+\s+/, ""),
          }));
          return (
            <div
              key={`${item.candidate}-${item.time}-${scheduleIndex}`}
              className="flex min-w-0 flex-col gap-1 rounded border border-border-soft border-l-2 border-l-border-quiet bg-surface-base px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate whitespace-nowrap text-label font-bold text-text-primary">
                  {isAdmin && candidateNamesVisible && onSwapCandidates ? (
                    <CandidateSwapChip
                      item={item}
                      scheduleIndex={scheduleIndex}
                      targets={
                        swapTargetsByScheduleIndex.get(scheduleIndex) ?? []
                      }
                      formatTimeLabel={(time) =>
                        formatSlotLabel(
                          time,
                          dates,
                          savedSchedule.session_duration,
                        )
                      }
                      onSwap={onSwapCandidates}
                      conflict={isConflict}
                    />
                  ) : (
                    <CandidateConflictControl
                      candidateName={item.candidate}
                      candidateNamesVisible={candidateNamesVisible}
                      isConflict={isConflict}
                      variant="calendar"
                    />
                  )}
                  {isEditableDraft && (
                    <span className="ml-1 inline-flex flex-wrap gap-1">
                      <LockToggle
                        size="sm"
                        locked={Boolean(item.locked)}
                        disabled={lockBusy}
                        onToggle={() => onToggleLock(scheduleIndex)}
                      />
                      <BookingSourceToggle
                        compact
                        source={item.booking_source}
                        disabled={lockBusy}
                        onToggle={() =>
                          onSetBookingSource(
                            scheduleIndex,
                            item.booking_source === "manual"
                              ? "solver"
                              : "manual",
                          )
                        }
                      />
                    </span>
                  )}
                </div>
                {(isEditableDraft || isAdmin) && (
                  <CustomSelect
                    className="w-full min-w-0"
                    compact
                    value={String(item.time)}
                    onChange={(nextTime) =>
                      onChangeTime(scheduleIndex, nextTime)
                    }
                    options={calendarTimeOptions}
                    disabled={isChangingTime}
                    aria-label={`Endre tidspunkt for ${item.candidate}`}
                  />
                )}
              </div>

              <PanelMemberList
                item={item}
                scheduleIndex={scheduleIndex}
                candidateId={candidateId}
                isAdmin={isAdmin}
                isEditableDraft={isEditableDraft}
                compact
                lookups={lookups}
                blockCandidateIds={
                  blockCandidateIdsByScheduleIndex.get(scheduleIndex) ??
                  EMPTY_CANDIDATE_IDS
                }
                onReplacePanelMember={onReplacePanelMember}
              />
              <ScheduleInterviewWorkflow
                admissionSlug={admissionSlug}
                groupId={groupId}
                admissionTitle={admissionTitle}
                committeeName={committeeName}
                item={item}
                candidateNamesVisible={candidateNamesVisible}
                canManageInterviewWorkflow={canManageInterviewWorkflow}
                timeLabel={formatSlotLabel(
                  item.time,
                  dates,
                  savedSchedule.session_duration,
                )}
                outreachTemplates={outreachTemplates}
              />
            </div>
          );
        }}
      />
    </div>
  );
};

export default DistributedPlanCalendar;
