import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  GripVertical,
  List,
  Lock,
  LockKeyhole,
  Pencil,
  Unlock,
  Users,
} from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

import cn from "../../../utils/cn";
import GridCalendarView from "../Calendar/GridCalendarView";
import { assignmentAvailabilityLabel } from "../assignmentAvailability";
import {
  CustomSelect,
  EditablePanelChip,
  SegmentedControl,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";
import type { SavedSchedule } from "../types";
import { formatSlotLabel } from "../scheduleUtils";
import InterviewerLoadView from "./InterviewerLoadView";
import { hasSchedule, type SolveResponse } from "./solverHelpers";
import type { ScheduleDraftController } from "./useScheduleDraft";
import type { ScheduleDraftPersistence } from "./useScheduleDraftPersistence";
import {
  assignmentPanelMemberKey,
  type AssignmentConflictSummary,
} from "./assignmentConflicts";

interface SolverResultsProps {
  result: SolveResponse | null;
  planRevealed: boolean;
  solveTick: number;
  savedSchedule?: SavedSchedule;
  draft: ScheduleDraftController;
  persistence: ScheduleDraftPersistence;
  hasLocalDraft: boolean;
  dates: string[];
  sessionDuration: number;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  enabledSlots: Set<string>;
  editRequestKey: number;
  assignmentConflicts: AssignmentConflictSummary;
  blockRestPreferenceEnabled: boolean | null;
  onOpenPlan: () => void;
}

const SolverResults = ({
  result,
  planRevealed,
  solveTick,
  savedSchedule,
  draft,
  persistence,
  hasLocalDraft,
  dates,
  sessionDuration,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  enabledSlots,
  editRequestKey,
  assignmentConflicts,
  blockRestPreferenceEnabled,
  onOpenPlan,
}: SolverResultsProps) => {
  const [viewType, setViewType] = useState<"list" | "calendar" | "person">(
    "list",
  );
  const [isEditing, setIsEditing] = useState(false);
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [selectedListScheduleIndex, setSelectedListScheduleIndex] = useState<
    number | null
  >(null);
  const [draggedListScheduleIndex, setDraggedListScheduleIndex] = useState<
    number | null
  >(null);
  const [listDropTargetIndex, setListDropTargetIndex] = useState<number | null>(
    null,
  );
  const { presentation } = draft;
  const canEditDraft = isEditing && !savedSchedule?.is_distributed;
  const occupiedTimes = useMemo(
    () => new Set(presentation.sortedSchedule.map((item) => item.time)),
    [presentation.sortedSchedule],
  );
  const formatSlotTime = (time: number) =>
    formatSlotLabel(time, dates, sessionDuration);

  useEffect(() => {
    setSelectedInterviewer("");
    setSelectedListScheduleIndex(null);
    setDraggedListScheduleIndex(null);
    setListDropTargetIndex(null);
    setIsEditing(false);
  }, [solveTick]);

  useEffect(() => {
    if (editRequestKey > 0 && !savedSchedule?.is_distributed) {
      setIsEditing(true);
    }
  }, [editRequestKey, savedSchedule?.is_distributed]);

  const clearListMove = () => {
    setDraggedListScheduleIndex(null);
    setListDropTargetIndex(null);
  };

  const selectOrSwapListInterview = (scheduleIndex: number) => {
    if (selectedListScheduleIndex === null) {
      setSelectedListScheduleIndex(scheduleIndex);
      return;
    }
    if (selectedListScheduleIndex !== scheduleIndex) {
      draft.swapTimes(selectedListScheduleIndex, scheduleIndex);
    }
    setSelectedListScheduleIndex(null);
  };
  const unplaceableCount = presentation.unplaceableCandidates.length;
  const saveStatusLabel = persistence.hasConflict
    ? "Lagring stoppet"
    : persistence.state === "error"
      ? "Kunne ikke lagre"
      : persistence.isSaving || hasLocalDraft
        ? "Lagrer utkast…"
        : "Utkast lagret";
  const canOpenPlan =
    persistence.isSaved &&
    !persistence.isSaving &&
    !persistence.hasConflict &&
    persistence.state !== "error" &&
    unplaceableCount === 0;
  const hasConflictFor = (
    scheduleIndex: number,
    member: Parameters<typeof assignmentPanelMemberKey>[1],
  ) =>
    assignmentConflicts.affectedPanelMemberKeys.has(
      assignmentPanelMemberKey(scheduleIndex, member),
    );

  const lockLabel = (
    item: (typeof presentation.sortedEntries)[number]["item"],
  ) => (item.locked ? "Lås opp intervju" : "Lås intervju");

  const lockDescription = (
    item: (typeof presentation.sortedEntries)[number]["item"],
  ) =>
    item.locked
      ? "Intervjuet beholdes når forslaget genereres på nytt."
      : "Behold tid og panel når forslaget genereres på nytt.";

  return (
    <>
      {hasSchedule(result?.status) && planRevealed && (
        <SchedulePanel className="animate-fade-in">
          <SchedulePanelHeader
            title="Intervjuforslag"
            description={`Forslag generert · ${saveStatusLabel}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl<"list" | "calendar" | "person">
                  value={viewType}
                  onChange={setViewType}
                  items={[
                    {
                      key: "list",
                      icon: <List size={iconSizes.small} />,
                    },
                    {
                      key: "calendar",
                      icon: <CalendarDays size={iconSizes.small} />,
                    },
                    {
                      key: "person",
                      icon: <Users size={iconSizes.small} />,
                      ariaLabel: "Vis per person",
                    },
                  ]}
                  aria-label="Visning av intervjuforslaget"
                />
                <button
                  type="button"
                  onClick={() => setIsEditing((value) => !value)}
                  className={cn(
                    actionButtonBase,
                    isEditing ? actionButtonPrimary : actionButtonNeutral,
                  )}
                >
                  {isEditing ? (
                    <Check size={iconSizes.small} aria-hidden="true" />
                  ) : (
                    <Pencil size={iconSizes.small} aria-hidden="true" />
                  )}
                  {isEditing ? "Ferdig" : "Rediger forslag"}
                </button>
              </div>
            }
          />
          <SchedulePanelBody>
            <div
              data-cy="block-rest-summary"
              role="status"
              className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border-soft bg-surface-subtle px-4 py-3 text-ui"
            >
              <div>
                <p className="m-0 font-semibold text-text-primary">
                  {blockRestPreferenceEnabled === null
                    ? "Blokkhvileinnstilling ukjent"
                    : !blockRestPreferenceEnabled
                      ? "Blokkhvile er slått av"
                      : presentation.blockRestSummary.honored
                        ? "Blokkhvile oppfylt"
                        : `${presentation.blockRestSummary.exceptionCount} unntak fra blokkhvile`}
                </p>
                {blockRestPreferenceEnabled === null ? (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Innstillingen som genererte dette utkastet er ikke
                    tilgjengelig.
                  </p>
                ) : !blockRestPreferenceEnabled ? (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Forslaget forsøker ikke å holde neste intervjublokk fri.
                  </p>
                ) : !presentation.blockRestSummary.honored ? (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Gjelder{" "}
                    {presentation.blockRestSummary.affectedInterviewerCount}{" "}
                    {presentation.blockRestSummary.affectedInterviewerCount ===
                    1
                      ? "intervjuer"
                      : "intervjuere"}
                    . Kapasitet, tilgjengelighet, låste intervjuer og plassering
                    kan veie tyngre enn hvilepreferansen.
                  </p>
                ) : null}
                {presentation.blockRestSummary.isNonOptimal && (
                  <p className="m-0 mt-1 text-detail font-semibold text-amber-800">
                    Søket ble avsluttet før optimalitet var bevist. Videre
                    forbedring kan være mulig.
                  </p>
                )}
                {presentation.blockRestSummary.optimalityUnknown && (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Optimalitet er ikke kjent for dette gjenopprettede utkastet.
                  </p>
                )}
              </div>
              <span className="text-detail font-medium text-text-muted">
                Hvile mellom arbeidsblokker
              </span>
            </div>
            {unplaceableCount > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-ui text-danger"
              >
                <p className="m-0 font-semibold">
                  {unplaceableCount} kandidat
                  {unplaceableCount === 1 ? "" : "er"} fikk ikke plass.
                </p>
                <p className="m-0 mt-1 text-detail leading-relaxed">
                  Alle kandidater må få plass før du kan gå videre til
                  intervjuplanen. Juster innstillingene og generer på nytt.
                </p>
              </div>
            )}
            {viewType === "person" ? (
              <InterviewerLoadView
                entries={presentation.sortedEntries}
                distribution={presentation.interviewerDistribution}
                totalAssignments={presentation.totalAssignments}
                selectedInterviewer={selectedInterviewer}
                onSelectInterviewer={setSelectedInterviewer}
                canEditDraft={canEditDraft}
                interviewerOptions={presentation.interviewerOptions}
                onSwapPanelMember={draft.swapPanelMember}
                displayCandidate={presentation.displayCandidate}
                formatSlotTime={formatSlotTime}
                availabilityStatusFor={presentation.availabilityStatusFor}
                hasConflictFor={hasConflictFor}
              />
            ) : viewType === "list" ? (
              <>
                <div className="overflow-x-auto rounded-lg border border-border-soft">
                  <table className="w-full min-w-schedule-table border-collapse">
                    <thead>
                      <tr>
                        <th className="first:!rounded-tl-lg !rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Tidspunkt
                        </th>
                        <th className="!rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Kandidat
                        </th>
                        <th className="!rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Intervjupanel
                        </th>
                        <th className="last:!rounded-tr-lg !rounded-none bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                          Behold
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {presentation.sortedEntries.map(
                        ({ item, scheduleIndex }) => {
                          const timeOptions = draft
                            .timeOptionsFor(scheduleIndex)
                            .map((time) => ({
                              value: String(time),
                              label: formatSlotTime(time),
                            }));
                          return (
                            <tr
                              key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                              title={
                                item.locked
                                  ? "Manuell endring, beholdes når planen genereres på nytt"
                                  : undefined
                              }
                              onDragOver={(event) => {
                                if (
                                  !canEditDraft ||
                                  draggedListScheduleIndex === null ||
                                  draggedListScheduleIndex === scheduleIndex
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setListDropTargetIndex(scheduleIndex);
                              }}
                              onDragLeave={(event) => {
                                if (
                                  event.currentTarget.contains(
                                    event.relatedTarget as Node | null,
                                  )
                                ) {
                                  return;
                                }
                                if (listDropTargetIndex === scheduleIndex) {
                                  setListDropTargetIndex(null);
                                }
                              }}
                              onDrop={(event) => {
                                if (!canEditDraft) return;
                                event.preventDefault();
                                const parsedIndex = Number(
                                  event.dataTransfer.getData("text/plain"),
                                );
                                const sourceIndex = Number.isInteger(
                                  parsedIndex,
                                )
                                  ? parsedIndex
                                  : draggedListScheduleIndex;
                                clearListMove();
                                if (
                                  sourceIndex === null ||
                                  sourceIndex === scheduleIndex
                                ) {
                                  return;
                                }
                                draft.swapTimes(sourceIndex, scheduleIndex);
                              }}
                              className={cn(
                                "group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft",
                                listDropTargetIndex === scheduleIndex &&
                                  "[&>td]:bg-surface-subtle [&>td]:ring-2 [&>td]:ring-inset [&>td]:ring-brand-ring",
                                draggedListScheduleIndex === scheduleIndex &&
                                  "opacity-50",
                              )}
                            >
                              <td className="w-schedule-name whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                                {canEditDraft ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      draggable
                                      aria-pressed={
                                        selectedListScheduleIndex ===
                                        scheduleIndex
                                      }
                                      aria-label={`Flytt intervjuet for ${presentation.displayCandidate(item)}`}
                                      title="Dra til en annen rad, eller klikk to grep for å bytte tid"
                                      onClick={() =>
                                        selectOrSwapListInterview(scheduleIndex)
                                      }
                                      onDragStart={(event) => {
                                        event.dataTransfer.effectAllowed =
                                          "move";
                                        event.dataTransfer.setData(
                                          "text/plain",
                                          String(scheduleIndex),
                                        );
                                        setDraggedListScheduleIndex(
                                          scheduleIndex,
                                        );
                                        setSelectedListScheduleIndex(null);
                                      }}
                                      onDragEnd={clearListMove}
                                      className={cn(
                                        "flex h-8 w-6 flex-none cursor-grab items-center justify-center rounded border border-border-soft bg-surface-base text-text-faded hover:border-border-quiet hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50",
                                        selectedListScheduleIndex ===
                                          scheduleIndex &&
                                          "border-brand-strongBorder text-brand ring-2 ring-brand-ring",
                                      )}
                                    >
                                      <GripVertical
                                        size={iconSizes.detail}
                                        aria-hidden="true"
                                      />
                                    </button>
                                    <CustomSelect
                                      className="w-56"
                                      value={String(item.time)}
                                      onChange={(nextTime) =>
                                        draft.changeTime(
                                          scheduleIndex,
                                          nextTime,
                                        )
                                      }
                                      options={timeOptions}
                                      aria-label={`Endre tidspunkt for ${presentation.displayCandidate(item)}`}
                                    />
                                  </div>
                                ) : (
                                  <span>{formatSlotTime(item.time)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                                {presentation.displayCandidate(item)}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex flex-wrap gap-1.5">
                                  {item.panel.map((member, memberIndex) => {
                                    const availabilityStatus =
                                      presentation.availabilityStatusFor(
                                        item,
                                        member,
                                      );
                                    const availabilityLabel =
                                      assignmentAvailabilityLabel(
                                        availabilityStatus,
                                      );
                                    const hasConflict = hasConflictFor(
                                      scheduleIndex,
                                      member,
                                    );
                                    const statusLabel = hasConflict
                                      ? "Registrert inhabilitet"
                                      : availabilityLabel;
                                    return (
                                      <EditablePanelChip
                                        key={memberIndex}
                                        label={member.name}
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
                                            ? presentation.interviewerOptions.map(
                                                (interviewer) => ({
                                                  id: interviewer.id,
                                                  name: interviewer.name,
                                                  disabled:
                                                    interviewer.name !==
                                                      member.name &&
                                                    item.panel.some(
                                                      (panelMember) =>
                                                        panelMember.name ===
                                                        interviewer.name,
                                                    ),
                                                }),
                                              )
                                            : undefined
                                        }
                                        onSelect={
                                          canEditDraft
                                            ? (newName, newId) =>
                                                draft.swapPanelMember(
                                                  scheduleIndex,
                                                  memberIndex,
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
                              <td className="w-40 whitespace-nowrap px-4 py-3 text-sm">
                                {canEditDraft ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      draft.toggleLock(scheduleIndex)
                                    }
                                    aria-label={`${lockLabel(item)} for ${presentation.displayCandidate(item)}`}
                                    title={lockDescription(item)}
                                    className={cn(
                                      "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-detail font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                                      item.locked
                                        ? "border-brand-activeBorder bg-brand-soft text-brand hover:bg-brand-panel"
                                        : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle",
                                    )}
                                  >
                                    {item.locked ? (
                                      <Lock
                                        size={iconSizes.tiny}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Unlock
                                        size={iconSizes.tiny}
                                        aria-hidden="true"
                                      />
                                    )}
                                    {lockLabel(item)}
                                  </button>
                                ) : item.locked ? (
                                  <span
                                    title={lockDescription(item)}
                                    className="inline-flex items-center gap-1.5 font-semibold text-brand"
                                  >
                                    <Lock
                                      size={iconSizes.tiny}
                                      aria-hidden="true"
                                    />
                                    Låst
                                  </span>
                                ) : (
                                  <span className="text-text-faded">
                                    Kan endres
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <GridCalendarView
                schedule={presentation.displaySchedule}
                dates={dates}
                sessionDuration={sessionDuration}
                dayStartMinute={dayStartMinute}
                dayEndMinute={dayEndMinute}
                chunkSize={chunkSize}
                chunkBreakMinutes={chunkBreakMinutes}
                availableSlots={enabledSlots}
                occupiedTimes={occupiedTimes}
                showAvailabilityLegend
                onMoveItem={
                  canEditDraft
                    ? (sortedIndex, nextTime) => {
                        const entry = presentation.sortedEntries[sortedIndex];
                        if (!entry) return;
                        draft.changeTime(entry.scheduleIndex, String(nextTime));
                      }
                    : undefined
                }
                renderItem={(displayItem, sortedIndex) => {
                  const entry = presentation.sortedEntries[sortedIndex];
                  if (!entry) return null;
                  const { item, scheduleIndex } = entry;
                  const timeOptions = draft
                    .timeOptionsFor(scheduleIndex)
                    .map((time) => ({
                      value: String(time),
                      label: formatSlotTime(time),
                    }));
                  // The calendar column already names the weekday, so the
                  // compact picker only needs the date and time.
                  const calendarTimeOptions = timeOptions.map((option) => ({
                    ...option,
                    label: option.label.replace(/^\S+\s+/, ""),
                  }));
                  return (
                    <div
                      key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-border-soft bg-surface-base px-2.5 py-2 shadow-sm"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="flex min-w-0 items-center gap-1 text-xs font-bold text-text-primary">
                          {item.locked && (
                            <Lock
                              size={iconSizes.tiny}
                              aria-label="Låst"
                              className="flex-none text-brand"
                            />
                          )}
                          <span className="truncate">
                            {displayItem.candidate}
                          </span>
                        </div>
                      </div>
                      {canEditDraft && (
                        <CustomSelect
                          className="w-full min-w-0"
                          compact
                          value={String(item.time)}
                          onChange={(nextTime) =>
                            draft.changeTime(scheduleIndex, nextTime)
                          }
                          options={calendarTimeOptions}
                          aria-label={`Endre tidspunkt for ${displayItem.candidate}`}
                        />
                      )}
                      {canEditDraft ? (
                        <button
                          type="button"
                          onClick={() => draft.toggleLock(scheduleIndex)}
                          aria-label={`${lockLabel(item)} for ${displayItem.candidate}`}
                          title={lockDescription(item)}
                          className={cn(
                            "inline-flex h-7 items-center self-start gap-1.5 rounded-md border px-2 text-detail font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                            item.locked
                              ? "border-brand-activeBorder bg-brand-soft text-brand hover:bg-brand-panel"
                              : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet hover:bg-surface-subtle",
                          )}
                        >
                          {item.locked ? (
                            <Lock size={iconSizes.tiny} aria-hidden="true" />
                          ) : (
                            <LockKeyhole
                              size={iconSizes.tiny}
                              aria-hidden="true"
                            />
                          )}
                          {item.locked ? "Lås opp intervju" : "Lås intervju"}
                        </button>
                      ) : item.locked ? (
                        <span
                          title={lockDescription(item)}
                          className="inline-flex items-center gap-1.5 text-detail font-semibold text-brand"
                        >
                          <Lock size={iconSizes.tiny} aria-hidden="true" />
                          Låst ved ny kjøring
                        </span>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {item.panel.map((member, memberIndex) => {
                          const availabilityStatus =
                            presentation.availabilityStatusFor(item, member);
                          const availabilityLabel =
                            assignmentAvailabilityLabel(availabilityStatus);
                          const hasConflict = hasConflictFor(
                            scheduleIndex,
                            member,
                          );
                          const statusLabel = hasConflict
                            ? "Registrert inhabilitet"
                            : availabilityLabel;
                          return (
                            <EditablePanelChip
                              key={`${member.name}-${memberIndex}`}
                              label={member.name}
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
                                  ? presentation.interviewerOptions.map(
                                      (interviewer) => ({
                                        id: interviewer.id,
                                        name: interviewer.name,
                                        disabled:
                                          interviewer.name !== member.name &&
                                          item.panel.some(
                                            (panelMember) =>
                                              panelMember.name ===
                                              interviewer.name,
                                          ),
                                      }),
                                    )
                                  : undefined
                              }
                              onSelect={
                                canEditDraft
                                  ? (newName, newId) =>
                                      draft.swapPanelMember(
                                        scheduleIndex,
                                        memberIndex,
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
                    </div>
                  );
                }}
              />
            )}
          </SchedulePanelBody>
          <SchedulePanelFooter>
            <div className="flex flex-wrap items-center gap-2 text-detail">
              <span
                className={cn(
                  "font-semibold",
                  persistence.state === "error" || persistence.hasConflict
                    ? "text-danger"
                    : persistence.isSaving
                      ? "text-text-muted"
                      : "text-text-faded",
                )}
                aria-live="polite"
              >
                {saveStatusLabel}
              </span>
              {persistence.error && (
                <>
                  <span role="alert" className="text-danger">
                    {persistence.error}
                  </span>
                  {persistence.hasConflict ? (
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="font-semibold text-danger underline underline-offset-2"
                    >
                      Last siden på nytt
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={persistence.retry}
                      className="font-semibold text-danger underline underline-offset-2"
                    >
                      Prøv igjen
                    </button>
                  )}
                </>
              )}
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={onOpenPlan}
                disabled={!canOpenPlan}
                className={cn(actionButtonBase, actionButtonPrimary)}
                title={
                  unplaceableCount > 0
                    ? "Alle kandidater må få plass før du kan gå videre."
                    : !canOpenPlan
                      ? "Vent til utkastet er lagret."
                      : undefined
                }
              >
                Gå til intervjuplan
                <ArrowRight size={iconSizes.small} aria-hidden="true" />
              </button>
            )}
          </SchedulePanelFooter>
        </SchedulePanel>
      )}
    </>
  );
};

export default SolverResults;
