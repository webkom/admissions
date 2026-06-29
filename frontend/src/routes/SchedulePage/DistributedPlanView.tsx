import React, { useMemo, useState } from "react";
import { CalendarCheck, Info, Lock, Unlock } from "lucide-react";
import {
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  Chip,
  actionButtonBase,
  actionButtonPrimary,
  EditablePanelChip,
} from "src/components/Scheduling/ui";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import EditTimeDrawer from "src/components/Scheduling/Solver/EditTimeDrawer";
import ExportChooserModal from "src/components/Scheduling/Solver/ExportChooserModal";
import {
  Candidate,
  Interviewer,
  NameVisibility,
  SavedSchedule,
} from "../../types";
import GridCalendarView from "src/components/Scheduling/Calendar/GridCalendarView";
import {
  encodeScheduleTime,
  formatSlotLabel,
  generateIcs,
  parseSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";
import PlanFilterBar from "./PlanFilterBar";

const LockToggle: React.FC<{
  locked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "sm" | "md";
}> = ({ locked, onToggle, disabled, size = "md" }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    title={
      locked
        ? "Lås opp raden — kan endres om du kjører solveren på nytt"
        : "Lås raden så den forblir om du kjører solveren på nytt"
    }
    className={cn(
      "inline-flex items-center gap-1 rounded-full border font-bold uppercase tracking-label transition-colors",
      size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
      locked
        ? "border-brand-activeBorder bg-brand-tint text-brand hover:bg-brand-soft"
        : "border-border-soft bg-surface-base text-text-subtle hover:border-brand-strongBorder hover:text-text-primary",
      disabled && "cursor-not-allowed opacity-60",
    )}
  >
    {locked ? (
      <Lock size={size === "sm" ? 9 : 10} aria-hidden="true" />
    ) : (
      <Unlock size={size === "sm" ? 9 : 10} aria-hidden="true" />
    )}
    {locked ? "Låst" : "Lås"}
  </button>
);

interface DistributedPlanViewProps {
  savedSchedule: SavedSchedule | undefined;
  dates: string[];
  isAdmin: boolean;
  currentUserName: string;
  currentUserId?: string;
  canToggleCandidateNames: boolean;
  onSetNameVisibility: (visibility: NameVisibility) => Promise<boolean>;
  onReplacePanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacement: { id?: string; name: string },
  ) => Promise<boolean>;
  onChangeInterviewTime: (
    scheduleIndex: number,
    nextTime: number,
  ) => Promise<boolean>;
  onToggleLock: (scheduleIndex: number) => Promise<boolean>;
  onRerunWithConflicts: () => Promise<boolean>;
  myConflicts: string[];
  realCandidates: Candidate[];
  onSaveConflicts: (ids: string[]) => Promise<void>;
  interviewers: Interviewer[];
  enabledSlots: Set<string>;
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
  currentUserName,
  currentUserId,
  canToggleCandidateNames,
  onSetNameVisibility,
  onReplacePanelMember,
  onChangeInterviewTime,
  onToggleLock,
  onRerunWithConflicts,
  myConflicts,
  realCandidates,
  onSaveConflicts,
  interviewers,
  enabledSlots,
}) => {
  const [myInterviewsOnly, setMyInterviewsOnly] = useState(!isAdmin);
  const [planViewMode, setPlanViewMode] = useState<"calendar" | "table">(
    "table",
  );
  const [isUpdatingNames, setIsUpdatingNames] = useState(false);
  const [isExportChooserOpen, setIsExportChooserOpen] = useState(false);
  const [isConfirmingShowNames, setIsConfirmingShowNames] = useState(false);
  const [isSavingConflict, setIsSavingConflict] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [isChangingTime, setIsChangingTime] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [lockBusyIndex, setLockBusyIndex] = useState<number | null>(null);

  const toggleLock = async (scheduleIndex: number) => {
    if (lockBusyIndex !== null) return;
    setLockBusyIndex(scheduleIndex);
    try {
      await onToggleLock(scheduleIndex);
    } finally {
      setLockBusyIndex(null);
    }
  };

  const conflictSet = useMemo(() => new Set(myConflicts), [myConflicts]);
  const candidateIdByName = useMemo(
    () => new Map(realCandidates.map((c) => [c.name, c.id])),
    [realCandidates],
  );
  const biasedByInterviewer = useMemo(
    () => new Map(interviewers.map((iv) => [iv.name, new Set(iv.biased)])),
    [interviewers],
  );
  const interviewerOptions = useMemo(
    () => [...interviewers].sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [interviewers],
  );
  const isMe = (member: { id?: string; name: string }) =>
    (currentUserId !== undefined && member.id === currentUserId) ||
    member.name === currentUserName;
  const isEditableDraft = Boolean(isAdmin && savedSchedule);
  const enabledTimeOptions = useMemo(() => {
    if (!savedSchedule) return [];
    const times = new Set<number>();
    enabledSlots.forEach((key) => {
      const { date, minute } = parseSlotKey(key);
      if (!Number.isFinite(minute)) return;
      const dayIndex = dates.indexOf(date);
      if (dayIndex === -1) return;
      times.add(
        encodeScheduleTime(dayIndex, minute, savedSchedule.session_duration),
      );
    });
    return Array.from(times).sort((a, b) => a - b);
  }, [dates, enabledSlots, savedSchedule]);
  const occupiedTimes = useMemo(
    () => new Set(savedSchedule?.schedule.map((item) => item.time) ?? []),
    [savedSchedule],
  );

  const toggleCandidateConflict = async (candidateName: string) => {
    const candidateId = candidateIdByName.get(candidateName);
    if (!candidateId || isSavingConflict) return;
    setIsSavingConflict(true);
    const newConflicts = conflictSet.has(candidateId)
      ? myConflicts.filter((id) => id !== candidateId)
      : [...myConflicts, candidateId];
    try {
      await onSaveConflicts(newConflicts);
    } catch {
      // Parent's onSaveConflicts shows the error toast
    } finally {
      setIsSavingConflict(false);
    }
  };

  if (!savedSchedule) {
    return (
      <SchedulePanel>
        <div className="px-6 py-14 text-center">
          <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-border/60">
            <CalendarCheck size={18} />
          </span>
          <h3 className="mb-1 mt-2 text-sm font-bold text-text-primary">
            Ingen plan publisert ennå
          </h3>
          <p className="m-0 mx-auto max-w-[28rem] text-ui leading-relaxed text-text-muted">
            {isAdmin
              ? 'Gå til "Intervjuforslag" for å generere og publisere en intervjuplan.'
              : "Opptaksansvarlig har ikke publisert intervjuplanen ennå. Kom tilbake senere."}
          </p>
        </div>
      </SchedulePanel>
    );
  }

  const namesVisibleFromSetting =
    savedSchedule.name_visibility === "committee" ||
    (savedSchedule.name_visibility === "admin_only" && canToggleCandidateNames);
  const namesVisible = namesVisibleFromSetting;
  const sortedEntries = savedSchedule.schedule
    .map((item, index) => ({ item, scheduleIndex: index }))
    .sort((a, b) => a.item.time - b.item.time);
  const myInterviews = sortedEntries.filter(({ item }) =>
    item.panel.some((p) => isMe(p)),
  );
  const displaySorted = myInterviewsOnly ? myInterviews : sortedEntries;
  const conflictImpacts = sortedEntries
    .map(({ item, scheduleIndex }) => {
      const candidateId = candidateIdByName.get(item.candidate);
      if (!candidateId) return null;
      const affectedPanel = item.panel
        .map((member, panelMemberIndex) => ({
          name: member.name,
          panelMemberIndex,
        }))
        .filter((member) =>
          biasedByInterviewer.get(member.name)?.has(candidateId),
        );
      const myConflictInOwnPanel =
        conflictSet.has(candidateId) &&
        item.panel.some((member) => isMe(member));
      if (affectedPanel.length === 0 && !myConflictInOwnPanel) return null;
      return {
        item,
        scheduleIndex,
        affectedPanel,
        myConflictInOwnPanel,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const formatTimeLabel = (timeValue: number) =>
    formatSlotLabel(timeValue, dates, savedSchedule.session_duration);

  const timeOptionsForEdit = useMemo(() => {
    const currentTime =
      editingTimeIndex !== null
        ? savedSchedule.schedule[editingTimeIndex]?.time
        : null;
    return enabledTimeOptions.filter(
      (time) => time === currentTime || !occupiedTimes.has(time),
    );
  }, [editingTimeIndex, enabledTimeOptions, occupiedTimes, savedSchedule]);

  const beginTimeEdit = (scheduleIndex: number) => {
    const item = savedSchedule.schedule[scheduleIndex];
    if (!item) return;
    setEditingTimeIndex(scheduleIndex);
    setEditingTimeValue(String(item.time));
  };

  const confirmTimeEdit = async () => {
    if (editingTimeIndex === null || !editingTimeValue) return;

    setIsChangingTime(true);
    try {
      const didUpdate = await onChangeInterviewTime(
        editingTimeIndex,
        Number(editingTimeValue),
      );
      if (didUpdate) {
        setEditingTimeIndex(null);
        setEditingTimeValue("");
      }
    } finally {
      setIsChangingTime(false);
    }
  };

  const handleRerun = async () => {
    setIsRerunning(true);
    try {
      await onRerunWithConflicts();
    } finally {
      setIsRerunning(false);
    }
  };

  const handleExportIcs = (target: "apple" | "google") => {
    const schedule = myInterviewsOnly
      ? myInterviews.map(({ item }) => item)
      : savedSchedule.schedule;
    const icsContent = generateIcs(
      schedule,
      dates,
      savedSchedule.session_duration,
      "Intervjuplan",
      { uidSeed: "intervjuplan" },
    );
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      target === "google"
        ? myInterviewsOnly
          ? "mine-intervjuer-google.ics"
          : "intervjuplan-google.ics"
        : myInterviewsOnly
          ? "mine-intervjuer-apple.ics"
          : "intervjuplan-apple.ics";
    a.click();
    URL.revokeObjectURL(url);

    if (target === "google") {
      window.open(
        "https://calendar.google.com/calendar/u/0/r/settings/importexport",
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const handleExportCsv = () => {
    const rows: string[][] = [["Tidspunkt", "Kandidat", "Panel"]];
    displaySorted.forEach(({ item }) => {
      rows.push([
        formatTimeLabel(item.time),
        namesVisible ? item.candidate : "—",
        item.panel.map((p) => p.name).join("; "),
      ]);
    });
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuplan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectVisibility = async (next: NameVisibility) => {
    if (!canToggleCandidateNames || isUpdatingNames) return;
    if (next === savedSchedule.name_visibility) return;

    if (next === "committee") {
      setIsConfirmingShowNames(true);
      return;
    }

    setIsUpdatingNames(true);
    try {
      await onSetNameVisibility(next);
    } finally {
      setIsUpdatingNames(false);
    }
  };

  const confirmShowNames = async () => {
    if (!canToggleCandidateNames || isUpdatingNames) return;
    setIsUpdatingNames(true);
    try {
      const ok = await onSetNameVisibility("committee");
      if (ok) setIsConfirmingShowNames(false);
    } finally {
      setIsUpdatingNames(false);
    }
  };

  const thClass =
    "bg-surface-base px-4 py-2.5 text-left text-label font-semibold tracking-label text-text-muted border-b border-border-soft";

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={CalendarCheck}
        title="Intervjuplan"
        actions={
          <button
            type="button"
            onClick={() => setIsExportChooserOpen(true)}
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            Eksporter
          </button>
        }
      />

      {/* Filter bar */}
      <PlanFilterBar
        myInterviewsOnly={myInterviewsOnly}
        onToggleMyInterviews={() => setMyInterviewsOnly((v) => !v)}
        myInterviewsCount={myInterviews.length}
        planViewMode={planViewMode}
        onChangePlanViewMode={setPlanViewMode}
        canToggleCandidateNames={canToggleCandidateNames}
        nameVisibility={savedSchedule.name_visibility}
        onSelectVisibility={(next) => {
          if (!isUpdatingNames) handleSelectVisibility(next);
        }}
        isUpdatingNames={isUpdatingNames}
        showRerun={isEditableDraft && myConflicts.length > 0}
        onRerun={handleRerun}
        isRerunning={isRerunning}
        conflictBadgeCount={
          namesVisible && myConflicts.length > 0 ? myConflicts.length : 0
        }
      />

      {/* Plan content */}
      <SchedulePanelBody noPadding>
        {isExportChooserOpen && (
          <ExportChooserModal
            showCsv={isAdmin}
            onExportIcs={handleExportIcs}
            onExportCsv={handleExportCsv}
            onClose={() => setIsExportChooserOpen(false)}
          />
        )}

        <>
          {myInterviewsOnly && myInterviews.length === 0 && (
            <div className="border-b border-border-soft px-6 py-4 text-ui text-text-muted">
              Ingen intervjuer funnet for <strong>{currentUserName}</strong>.
              Filteret matcher på navn.
            </div>
          )}

          {savedSchedule.name_visibility === "committee" && (
            <div className="flex items-center gap-1.5 border-b border-border-soft px-6 py-2 text-detail text-text-faded">
              <Info size={13} className="flex-none" aria-hidden="true" />
              <span>Klikk på et kandidatnavn for å markere inhabilitet</span>
            </div>
          )}

          {namesVisible && conflictImpacts.length > 0 && (
            <div className="border-b border-border-soft bg-surface-subtle px-6 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  Inhabiliteter i publisert plan
                </span>
                <Chip tone="brand">{conflictImpacts.length}</Chip>
              </div>
              <div className="grid gap-2">
                {conflictImpacts.slice(0, 3).map((impact) => {
                  return (
                    <div
                      key={`${impact.item.time}-${impact.scheduleIndex}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-text-primary">
                        {formatTimeLabel(impact.item.time)} —{" "}
                        {namesVisible ? impact.item.candidate : "Kandidat"}
                      </span>
                      <span className="text-text-muted">
                        {impact.affectedPanel.length > 0
                          ? `${impact.affectedPanel.map((p) => p.name).join(", ")} må vurderes`
                          : "Du er i panelet og har markert inhabilitet"}
                      </span>
                    </div>
                  );
                })}
                {conflictImpacts.length > 3 && (
                  <span className="text-detail text-text-muted">
                    + {conflictImpacts.length - 3} flere
                  </span>
                )}
              </div>
            </div>
          )}

          {planViewMode === "calendar" ? (
            <div className="px-6 py-4">
              <GridCalendarView
                schedule={displaySorted.map((s) => s.item)}
                dates={dates}
                sessionDuration={savedSchedule.session_duration}
                dayStartMinute={savedSchedule.day_start_minute}
                dayEndMinute={savedSchedule.day_end_minute}
                chunkSize={savedSchedule.chunk_size}
                chunkBreakMinutes={savedSchedule.chunk_break_minutes}
                availableSlots={enabledSlots}
                renderItem={(item, index) => {
                  const scheduleIndex = displaySorted[index].scheduleIndex;
                  const candidateId = candidateIdByName.get(item.candidate);
                  const isConflict =
                    candidateId !== undefined && conflictSet.has(candidateId);
                  return (
                    <div
                      key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                      className="flex flex-col gap-[0.3rem] rounded border border-border-soft border-l-2 border-l-border-quiet bg-surface-base px-[0.6rem] py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate whitespace-nowrap text-xs font-bold text-text-primary">
                          {namesVisible ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleCandidateConflict(item.candidate)
                              }
                              disabled={!candidateId || isSavingConflict}
                              title={
                                isConflict
                                  ? "Fjern interessekonflikt"
                                  : "Merk som interessekonflikt"
                              }
                              className={cn(
                                "hover:underline",
                                isConflict && "text-brand",
                              )}
                            >
                              {item.candidate}
                            </button>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                          {isEditableDraft ? (
                            <span className="ml-1 inline-flex">
                              <LockToggle
                                size="sm"
                                locked={Boolean(item.locked)}
                                disabled={lockBusyIndex !== null}
                                onToggle={() => toggleLock(scheduleIndex)}
                              />
                            </span>
                          ) : (
                            item.locked && (
                              <span className="ml-1 rounded-full border border-border-soft bg-surface-subtle px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-label text-text-subtle">
                                Låst
                              </span>
                            )
                          )}
                        </div>
                        {isEditableDraft && (
                          <button
                            type="button"
                            className="text-[9px] font-bold uppercase tracking-label text-brand hover:text-brand-hover"
                            onClick={() => beginTimeEdit(scheduleIndex)}
                          >
                            Flytt
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {item.panel.map((p, i) => {
                          const hasCoi =
                            isAdmin && candidateId
                              ? (biasedByInterviewer
                                  .get(p.name)
                                  ?.has(candidateId) ?? false)
                              : false;
                          return (
                            <EditablePanelChip
                              key={`${p.name}-${i}`}
                              label={p.name}
                              tone={p.is_overtime ? "overtime" : "neutral"}
                              conflict={hasCoi}
                              isCurrentUser={isMe(p)}
                              options={
                                isEditableDraft
                                  ? interviewerOptions.map((iv) => ({
                                      id: iv.id,
                                      name: iv.name,
                                      disabled:
                                        iv.name !== p.name &&
                                        item.panel.some(
                                          (member) => member.name === iv.name,
                                        ),
                                    }))
                                  : undefined
                              }
                              onSelect={(newName, newId) =>
                                onReplacePanelMember(scheduleIndex, i, {
                                  id: newId,
                                  name: newName,
                                })
                              }
                              title={
                                hasCoi
                                  ? `${p.name} har meldt interessekonflikt`
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thClass}>Tidspunkt</th>
                    <th className={thClass}>Kandidat</th>
                    <th className={thClass}>Panel</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySorted.map(({ item, scheduleIndex }) => {
                    const candidateId = candidateIdByName.get(item.candidate);
                    const isConflict =
                      candidateId !== undefined && conflictSet.has(candidateId);
                    return (
                      <tr
                        key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                        className="group border-b border-border-faint last:border-0"
                      >
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-text-muted group-hover:bg-surface-soft">
                          <div className="flex flex-col gap-1">
                            <span>{formatTimeLabel(item.time)}</span>
                            {isEditableDraft && (
                              <button
                                type="button"
                                className="self-start text-label font-bold uppercase tracking-label text-brand hover:text-brand-hover"
                                onClick={() => beginTimeEdit(scheduleIndex)}
                              >
                                Endre tid
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3 group-hover:bg-surface-soft">
                          {namesVisible ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleCandidateConflict(item.candidate)
                              }
                              disabled={!candidateId || isSavingConflict}
                              title={
                                isConflict
                                  ? "Fjern interessekonflikt"
                                  : "Merk som interessekonflikt"
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-[border-color,background,transform] duration-150 hover:-translate-y-px",
                                isConflict
                                  ? "border-brand-activeBorder bg-brand-tint text-brand"
                                  : "border-border bg-surface-base text-text-primary hover:border-brand-strongBorder hover:bg-brand-soft",
                                !candidateId &&
                                  "cursor-default opacity-70 hover:translate-y-0",
                              )}
                            >
                              {isConflict && (
                                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                              )}
                              {item.candidate}
                            </button>
                          ) : (
                            <span className="text-sm text-text-muted">—</span>
                          )}
                          {isEditableDraft ? (
                            <span className="ml-2 inline-flex">
                              <LockToggle
                                locked={Boolean(item.locked)}
                                disabled={lockBusyIndex !== null}
                                onToggle={() => toggleLock(scheduleIndex)}
                              />
                            </span>
                          ) : (
                            item.locked && (
                              <span className="ml-2 rounded-full border border-border-soft bg-surface-base px-2 py-0.5 text-[10px] font-bold uppercase tracking-label text-text-subtle">
                                Låst
                              </span>
                            )
                          )}
                        </td>
                        <td className="px-6 py-3 group-hover:bg-surface-soft">
                          <div className="flex flex-wrap gap-1.5">
                            {item.panel.map((p, i) => {
                              const hasCoi =
                                isAdmin && candidateId
                                  ? (biasedByInterviewer
                                      .get(p.name)
                                      ?.has(candidateId) ?? false)
                                  : false;
                              return (
                                <EditablePanelChip
                                  key={`${p.name}-${i}`}
                                  label={p.name}
                                  tone={p.is_overtime ? "overtime" : "neutral"}
                                  conflict={hasCoi}
                                  isCurrentUser={isMe(p)}
                                  options={
                                    isEditableDraft
                                      ? interviewerOptions.map((iv) => ({
                                          id: iv.id,
                                          name: iv.name,
                                          disabled:
                                            iv.name !== p.name &&
                                            item.panel.some(
                                              (member) =>
                                                member.name === iv.name,
                                            ),
                                        }))
                                      : undefined
                                  }
                                  onSelect={(newName, newId) =>
                                    onReplacePanelMember(scheduleIndex, i, {
                                      id: newId,
                                      name: newName,
                                    })
                                  }
                                  title={
                                    hasCoi
                                      ? `${p.name} har meldt interessekonflikt`
                                      : undefined
                                  }
                                />
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      </SchedulePanelBody>

      {isConfirmingShowNames && (
        <ConfirmDialog
          title="Gjør kandidatnavn synlige?"
          confirmLabel={isUpdatingNames ? "Oppdaterer…" : "Vis navn for alle"}
          onConfirm={confirmShowNames}
          onClose={() => setIsConfirmingShowNames(false)}
          busy={isUpdatingNames}
        >
          <p className="m-0">
            Dette gjør navnene synlige for{" "}
            <span className="font-extrabold">alle</span> i komiteen som har
            tilgang til intervjuplanen, ikke bare deg. Bruk det for å markere
            inhabiliteter.
          </p>
        </ConfirmDialog>
      )}

      {editingTimeIndex !== null && (
        <EditTimeDrawer
          value={editingTimeValue}
          onChange={setEditingTimeValue}
          options={timeOptionsForEdit.map((time) => ({
            value: String(time),
            label: formatTimeLabel(time),
          }))}
          onConfirm={confirmTimeEdit}
          onClose={() => setEditingTimeIndex(null)}
          confirmBusy={isChangingTime}
        />
      )}
    </SchedulePanel>
  );
};

export default DistributedPlanView;
