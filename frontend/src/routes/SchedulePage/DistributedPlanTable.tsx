import React, { useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DistributedPlanLookups,
  DistributedScheduleEntry,
} from "./distributedPlanSelectors";
import {
  CustomSelect,
  keyboardFocusRingClass,
} from "src/components/Scheduling/ui";
import {
  BookingSourceToggle,
  CandidateConflictControl,
  LockToggle,
  PanelMemberList,
} from "./DistributedPlanEntryControls";
import ScheduleInterviewWorkflow from "./ScheduleInterviewWorkflow";
import {
  buildBlockTimeChunks,
  decodeScheduleTime,
  encodeScheduleTime,
  formatDateHeader,
  formatMinutes,
  makeSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import type { SavedSchedule } from "../../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import type { InterviewOutreachTemplates } from "./interviewOutreach";

const tableHeaderClass =
  "bg-surface-base px-4 py-2.5 text-left text-label font-semibold tracking-label text-text-muted border-b border-border-soft !rounded-none";

interface PlanSlotRow {
  time: number;
  date: string;
  minute: number;
  dayIndex: number;
  blockIndex: number;
  positionInBlock: number;
  enabled: boolean;
  occupied: boolean;
  entry?: DistributedScheduleEntry;
}

const DistributedPlanTable: React.FC<{
  entries: DistributedScheduleEntry[];
  admissionSlug: string;
  admissionTitle: string;
  committeeName: string;
  savedSchedule: SavedSchedule;
  dates: string[];
  enabledSlots: Set<string>;
  candidateNamesVisible: boolean;
  isEditableDraft: boolean;
  isAdmin: boolean;
  canManageInterviewWorkflow: boolean;
  outreachTemplates: InterviewOutreachTemplates;
  conflictIds: ReadonlySet<string>;
  lockBusy: boolean;
  lookups: DistributedPlanLookups;
  formatTimeLabel: (time: number) => string;
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
}> = ({
  entries,
  admissionSlug,
  admissionTitle,
  committeeName,
  savedSchedule,
  dates,
  enabledSlots,
  candidateNamesVisible,
  isEditableDraft,
  isAdmin,
  canManageInterviewWorkflow,
  outreachTemplates,
  conflictIds,
  lockBusy,
  lookups,
  formatTimeLabel,
  onToggleLock,
  onSetBookingSource,
  onChangeTime,
  isChangingTime,
  getTimeOptionsForEdit,
  onReplacePanelMember,
}) => {
  const [draggedScheduleIndex, setDraggedScheduleIndex] = useState<
    number | null
  >(null);
  const [selectedScheduleIndex, setSelectedScheduleIndex] = useState<
    number | null
  >(null);
  const [dropTargetTime, setDropTargetTime] = useState<number | null>(null);
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
    const visibleEntryByTime = new Map(
      entries.map((entry) => [entry.item.time, entry]),
    );
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
            entry: visibleEntryByTime.get(time),
          };
        }),
      ),
    );

    entries.forEach((entry) => {
      if (configuredTimes.has(entry.item.time)) return;
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
        entry,
      });
    });

    return rows.sort((left, right) => left.time - right.time);
  }, [dates, enabledSlots, entries, savedSchedule]);
  const displayedSlots = useMemo(
    () => (isEditableDraft ? slots : slots.filter((slot) => slot.entry)),
    [isEditableDraft, slots],
  );

  const startDrag = (
    event: React.DragEvent<HTMLButtonElement>,
    scheduleIndex: number,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(scheduleIndex));
    setDraggedScheduleIndex(scheduleIndex);
  };

  const clearDrag = () => {
    setDraggedScheduleIndex(null);
    setDropTargetTime(null);
  };

  const moveSelectedInterview = (nextTime: number) => {
    if (selectedScheduleIndex === null) return;
    onChangeTime(selectedScheduleIndex, String(nextTime));
    setSelectedScheduleIndex(null);
    setDropTargetTime(null);
  };

  return (
    <div
      data-cy="distributed-plan-table-scroll"
      role="region"
      aria-label="Intervjuplan i tabell"
      tabIndex={0}
      className={cn("overflow-x-auto", keyboardFocusRingClass)}
    >
      <table className="w-full min-w-[56rem] border-collapse [&_td]:break-normal [&_th]:break-normal">
        <thead>
          <tr>
            <th className={tableHeaderClass}>Tidspunkt</th>
            <th className={tableHeaderClass}>Kandidat</th>
            <th className={tableHeaderClass}>Panel</th>
            <th className={tableHeaderClass}>Status</th>
            <th className={tableHeaderClass}>Neste handling</th>
          </tr>
        </thead>
        <tbody>
          {displayedSlots.map((slot, displayIndex) => {
            const { entry } = slot;
            const previousSlot = displayedSlots[displayIndex - 1];
            const startsGroup =
              !previousSlot ||
              previousSlot.dayIndex !== slot.dayIndex ||
              (showBlockGroups && previousSlot.blockIndex !== slot.blockIndex);
            const canDrop = Boolean(
              isEditableDraft &&
                !isChangingTime &&
                slot.enabled &&
                !slot.occupied,
            );
            const isDropTarget = dropTargetTime === slot.time;
            const groupDate = slot.date
              ? formatDateHeader(slot.date)
              : undefined;

            if (!entry) {
              return (
                <React.Fragment key={`slot-${slot.time}`}>
                  {startsGroup && (
                    <PlanBlockHeader
                      key={`header-${slot.dayIndex}-${slot.blockIndex}-${slot.time}`}
                      dateLabel={
                        groupDate
                          ? `${groupDate.weekday} ${groupDate.dayMonth}`
                          : `Dag ${slot.dayIndex + 1}`
                      }
                      blockIndex={showBlockGroups ? slot.blockIndex : null}
                      chunkSize={savedSchedule.chunk_size}
                      breakMinutes={savedSchedule.chunk_break_minutes}
                    />
                  )}
                  <tr className="border-b border-border-faint">
                    <td className="whitespace-nowrap bg-surface-subtle px-6 py-3 text-sm font-semibold tabular-nums text-text-muted">
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
                      onDragOver={(event) => {
                        if (!canDrop) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTargetTime(slot.time);
                      }}
                      onClick={() => {
                        if (canDrop && selectedScheduleIndex !== null) {
                          moveSelectedInterview(slot.time);
                        }
                      }}
                      onDragLeave={(event) => {
                        if (
                          event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        ) {
                          return;
                        }
                        if (isDropTarget) setDropTargetTime(null);
                      }}
                      onDrop={(event) => {
                        if (!canDrop) return;
                        event.preventDefault();
                        const scheduleIndex = Number(
                          event.dataTransfer.getData("text/plain"),
                        );
                        clearDrag();
                        if (!Number.isInteger(scheduleIndex)) return;
                        onChangeTime(scheduleIndex, String(slot.time));
                      }}
                      className={cn(
                        "px-6 py-3 text-detail transition-colors",
                        slot.occupied
                          ? "bg-surface-subtle text-text-muted"
                          : slot.enabled
                            ? "bg-surface-base text-text-muted"
                            : "bg-surface-neutral text-text-faded [background-image:var(--pattern-unavailable)]",
                        isDropTarget &&
                          "bg-surface-subtle text-text-primary ring-2 ring-inset ring-brand-ring",
                        canDrop &&
                          selectedScheduleIndex !== null &&
                          "cursor-pointer",
                      )}
                    >
                      <span className="font-semibold">
                        {slot.occupied
                          ? "Opptatt av et annet intervju"
                          : slot.enabled
                            ? draggedScheduleIndex !== null
                              ? "Slipp intervjuet her"
                              : selectedScheduleIndex !== null
                                ? "Klikk for å flytte intervjuet hit"
                                : "Ledig tidsluke"
                            : "Ikke tilgjengelig"}
                      </span>
                      {canDrop &&
                        draggedScheduleIndex === null &&
                        selectedScheduleIndex === null && (
                          <span className="ml-2 text-text-faded">
                            Dra et intervju hit
                          </span>
                        )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            }

            const { item, scheduleIndex } = entry;
            const candidateId = lookups.candidateIdFor(item);
            const isConflict =
              candidateId !== undefined && conflictIds.has(candidateId);
            const timeOptions = getTimeOptionsForEdit(scheduleIndex);
            return (
              <React.Fragment key={`interview-${scheduleIndex}-${item.time}`}>
                {startsGroup && (
                  <PlanBlockHeader
                    dateLabel={
                      groupDate
                        ? `${groupDate.weekday} ${groupDate.dayMonth}`
                        : `Dag ${slot.dayIndex + 1}`
                    }
                    blockIndex={showBlockGroups ? slot.blockIndex : null}
                    chunkSize={savedSchedule.chunk_size}
                    breakMinutes={savedSchedule.chunk_break_minutes}
                  />
                )}
                <tr
                  className={cn(
                    "group border-b border-border-faint last:border-0",
                    draggedScheduleIndex === scheduleIndex && "opacity-50",
                  )}
                >
                  <td className="whitespace-nowrap px-6 py-3 text-sm text-text-muted group-hover:bg-surface-soft">
                    <div className="flex items-center gap-2">
                      {isEditableDraft && (
                        <button
                          type="button"
                          draggable={!isChangingTime}
                          disabled={isChangingTime}
                          aria-pressed={selectedScheduleIndex === scheduleIndex}
                          aria-label={`Flytt intervjuet for ${item.candidate}`}
                          title="Dra intervjuet, eller klikk og velg en ledig tidsluke"
                          onClick={() =>
                            setSelectedScheduleIndex((current) =>
                              current === scheduleIndex ? null : scheduleIndex,
                            )
                          }
                          onDragStart={(event) => {
                            setSelectedScheduleIndex(null);
                            startDrag(event, scheduleIndex);
                          }}
                          onDragEnd={clearDrag}
                          className={cn(
                            "flex h-8 w-6 flex-none cursor-grab items-center justify-center rounded border border-border-soft bg-surface-base text-text-faded hover:border-border-quiet hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50",
                            selectedScheduleIndex === scheduleIndex &&
                              "border-brand-strongBorder text-brand ring-2 ring-brand-ring",
                          )}
                        >
                          <GripVertical
                            size={iconSizes.detail}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      {isEditableDraft ? (
                        <CustomSelect
                          className="w-56"
                          value={String(item.time)}
                          onChange={(nextTime) =>
                            onChangeTime(scheduleIndex, nextTime)
                          }
                          options={timeOptions}
                          disabled={isChangingTime}
                          aria-label={`Endre tidspunkt for ${item.candidate}`}
                        />
                      ) : (
                        <span>{formatTimeLabel(item.time)}</span>
                      )}
                    </div>
                    {!slot.enabled && (
                      <span className="mt-1 inline-flex rounded-full border border-border-soft bg-surface-neutral px-2 py-0.5 text-nano font-semibold text-text-muted">
                        Utenfor tilgjengelighet
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 group-hover:bg-surface-soft">
                    <CandidateConflictControl
                      candidateName={item.candidate}
                      candidateNamesVisible={candidateNamesVisible}
                      isConflict={isConflict}
                      variant="table"
                    />
                    {isEditableDraft && (
                      <span className="ml-2 inline-flex flex-wrap gap-1">
                        <LockToggle
                          locked={Boolean(item.locked)}
                          disabled={lockBusy}
                          onToggle={() => onToggleLock(scheduleIndex)}
                        />
                        <BookingSourceToggle
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
                  </td>
                  <td className="px-6 py-3 group-hover:bg-surface-soft">
                    <PanelMemberList
                      item={item}
                      scheduleIndex={scheduleIndex}
                      candidateId={candidateId}
                      isAdmin={isAdmin}
                      isEditableDraft={isEditableDraft}
                      lookups={lookups}
                      onReplacePanelMember={onReplacePanelMember}
                    />
                  </td>
                  <td className="px-6 py-3 group-hover:bg-surface-soft">
                    <ScheduleInterviewWorkflow
                      admissionSlug={admissionSlug}
                      admissionTitle={admissionTitle}
                      committeeName={committeeName}
                      item={item}
                      candidateNamesVisible={candidateNamesVisible}
                      canManageInterviewWorkflow={canManageInterviewWorkflow}
                      timeLabel={formatTimeLabel(item.time)}
                      outreachTemplates={outreachTemplates}
                      part="status"
                    />
                  </td>
                  <td className="px-6 py-3 group-hover:bg-surface-soft">
                    <ScheduleInterviewWorkflow
                      admissionSlug={admissionSlug}
                      admissionTitle={admissionTitle}
                      committeeName={committeeName}
                      item={item}
                      candidateNamesVisible={candidateNamesVisible}
                      canManageInterviewWorkflow={canManageInterviewWorkflow}
                      timeLabel={formatTimeLabel(item.time)}
                      outreachTemplates={outreachTemplates}
                      part="action"
                    />
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PlanBlockHeader: React.FC<{
  dateLabel: string;
  blockIndex: number | null;
  chunkSize: number;
  breakMinutes: number;
}> = ({ dateLabel, blockIndex, chunkSize, breakMinutes }) => (
  <tr>
    <td
      colSpan={5}
      className="border-y border-border-soft bg-surface-subtle px-6 py-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-detail font-bold text-text-primary">
          {dateLabel}
          {blockIndex !== null &&
            `, ${blockIndex >= 0 ? `Blokk ${blockIndex + 1}` : "Utenfor blokk"}`}
        </span>
        {blockIndex !== null && blockIndex >= 0 && (
          <span className="text-tiny font-semibold text-text-faded">
            {chunkSize} intervju{chunkSize === 1 ? "" : "er"}
            {breakMinutes > 0 ? ` + ${breakMinutes} min pause` : ""}
          </span>
        )}
      </div>
    </td>
  </tr>
);

export default DistributedPlanTable;
