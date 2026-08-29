import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Download,
  Pencil,
  Unlock,
} from "lucide-react";
import {
  Chip,
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonDanger,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import ExportChooserModal from "src/components/Scheduling/Solver/ExportChooserModal";
import {
  Candidate,
  Interviewer,
  NameVisibility,
  SavedSchedule,
} from "../../types";
import {
  decodeScheduleTime,
  formatAccessibleDate,
  formatSlotLabel,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";
import PlanFilterBar from "./PlanFilterBar";
import DistributedPlanCalendar from "./DistributedPlanCalendar";
import PublishedScheduleTable from "./PublishedScheduleTable";
import {
  DistributedPlanNotices,
  EmptyDistributedPlan,
} from "./DistributedPlanStatus";
import {
  candidateNamesAreVisible,
  createDistributedPlanLookups,
  selectConflictImpacts,
  selectDistributedScheduleEntries,
  selectEnabledTimeOptions,
  selectTimeOptionsForEdit,
} from "./distributedPlanSelectors";
import {
  exportAnonymizedScheduleIcs,
  exportVisibleScheduleCsv,
} from "./distributedPlanExports";
import InterviewOutreachTemplateEditor from "./InterviewOutreachTemplateEditor";
import {
  createDefaultInterviewOutreachTemplates,
  normalizeStoredOutreachTemplates,
  type InterviewOutreachTemplates,
} from "./interviewOutreach";
import { iconSizes } from "src/styles/designTokens";

interface DistributedPlanViewProps {
  admissionSlug: string;
  groupId: string;
  admissionTitle: string;
  committeeName: string;
  savedSchedule: SavedSchedule | undefined;
  dates: string[];
  isAdmin: boolean;
  canManageInterviewWorkflow: boolean;
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
  onSetBookingSource: (
    scheduleIndex: number,
    source: "solver" | "manual",
  ) => Promise<boolean>;
  onUnlock: () => Promise<boolean>;
  onUnlocked: () => void;
  onExtendDistributedThrough: (date: string) => Promise<boolean>;
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  myConflicts: string[];
  realCandidates: Candidate[];
  interviewers: Interviewer[];
  enabledSlots: Set<string>;
  onOpenConflictsOverview?: () => void;
  totalCommitteeConflicts?: number;
  onSwapCandidates?: (
    sourceScheduleIndex: number,
    targetScheduleIndex: number,
  ) => Promise<boolean>;
  onUpdateOutreachTemplates?: (
    templates: InterviewOutreachTemplates,
  ) => Promise<boolean>;
}

const formatDisplayDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return dateStr;
  }
};

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  admissionSlug,
  groupId,
  admissionTitle,
  committeeName,
  savedSchedule,
  dates,
  isAdmin,
  canManageInterviewWorkflow,
  currentUserName,
  currentUserId,
  canToggleCandidateNames,
  onSetNameVisibility,
  onReplacePanelMember,
  onChangeInterviewTime,
  onToggleLock,
  onSetBookingSource,
  onUnlock,
  onUnlocked,
  onExtendDistributedThrough,
  planTransition,
  planTransitionError,
  myConflicts,
  realCandidates,
  interviewers,
  enabledSlots,
  onOpenConflictsOverview,
  totalCommitteeConflicts,
  onSwapCandidates,
  onUpdateOutreachTemplates,
}) => {
  const [myInterviewsOnly, setMyInterviewsOnly] = useState(!isAdmin);
  const [planViewMode, setPlanViewMode] = useState<"calendar" | "table">(
    "table",
  );
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(
    null,
  );
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<
    string | null
  >(null);
  const [isUpdatingNames, setIsUpdatingNames] = useState(false);
  const [isExportChooserOpen, setIsExportChooserOpen] = useState(false);
  const [isConfirmingShowNames, setIsConfirmingShowNames] = useState(false);
  const [isChangingTime, setIsChangingTime] = useState(false);
  const [lockBusyIndex, setLockBusyIndex] = useState<number | null>(null);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [isExtendDialogOpen, setIsExtendDialogOpen] = useState(false);
  const [extendThroughDate, setExtendThroughDate] = useState("");
  const [outreachPersistenceState, setOutreachPersistenceState] = useState<
    "saving" | "saved" | "error"
  >("saved");
  const outreachTemplateStorageKey = `admissions:${admissionSlug}:${groupId}:interview-outreach-template`;
  const defaultOutreachTemplates = useMemo(
    () => createDefaultInterviewOutreachTemplates(committeeName),
    [committeeName],
  );
  const [outreachTemplates, setOutreachTemplates] =
    useState<InterviewOutreachTemplates>(() => {
      if (savedSchedule?.outreach_templates) {
        return normalizeStoredOutreachTemplates(
          savedSchedule.outreach_templates,
          committeeName,
        );
      }
      try {
        return normalizeStoredOutreachTemplates(
          window.localStorage.getItem(outreachTemplateStorageKey),
          committeeName,
        );
      } catch {
        return defaultOutreachTemplates;
      }
    });

  useEffect(() => {
    if (savedSchedule?.outreach_templates) {
      setOutreachTemplates(
        normalizeStoredOutreachTemplates(
          savedSchedule.outreach_templates,
          committeeName,
        ),
      );
    }
  }, [committeeName, savedSchedule?.outreach_templates]);

  const handleTemplateChange = useCallback(
    async (nextTemplates: InterviewOutreachTemplates) => {
      setOutreachTemplates(nextTemplates);
      try {
        window.localStorage.setItem(
          outreachTemplateStorageKey,
          JSON.stringify(nextTemplates),
        );
      } catch {
        // ignore
      }
      if (onUpdateOutreachTemplates) {
        setOutreachPersistenceState("saving");
        const ok = await onUpdateOutreachTemplates(nextTemplates);
        setOutreachPersistenceState(ok ? "saved" : "error");
      } else {
        setOutreachPersistenceState("saved");
      }
    },
    [onUpdateOutreachTemplates, outreachTemplateStorageKey],
  );

  const conflictSet = useMemo(() => new Set(myConflicts), [myConflicts]);
  const lookups = useMemo(
    () =>
      createDistributedPlanLookups(
        realCandidates,
        interviewers,
        currentUserName,
        currentUserId,
      ),
    [currentUserId, currentUserName, interviewers, realCandidates],
  );
  const { sortedEntries, myInterviews, displayEntries } = useMemo(
    () =>
      selectDistributedScheduleEntries(
        savedSchedule?.schedule ?? [],
        myInterviewsOnly,
        lookups.isCurrentUser,
      ),
    [lookups, myInterviewsOnly, savedSchedule?.schedule],
  );
  const conflictImpacts = useMemo(
    () => selectConflictImpacts(sortedEntries, conflictSet, lookups),
    [conflictSet, lookups, sortedEntries],
  );

  const dateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedEntries.forEach((entry) => {
      const { dayIndex } = decodeScheduleTime(
        entry.item.time,
        savedSchedule?.session_duration ?? 60,
      );
      const d = dates[dayIndex];
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    return counts;
  }, [sortedEntries, dates, savedSchedule?.session_duration]);

  const statusCounts = useMemo(() => {
    if (!isAdmin) return null;
    const counts = {
      total: sortedEntries.length,
      not_invited: 0,
      invited: 0,
      confirmed: 0,
      completed: 0,
      declined: 0,
      cancelled: 0,
    };
    sortedEntries.forEach(({ item }) => {
      const s = item.interview_status ?? "not_invited";
      if (s === "confirmed") counts.confirmed++;
      else if (s === "invited") counts.invited++;
      else if (s === "completed") counts.completed++;
      else if (s === "not_invited") counts.not_invited++;
      else if (s === "declined") counts.declined++;
      else if (s === "cancelled") counts.cancelled++;
    });
    return counts;
  }, [isAdmin, sortedEntries]);

  const filteredDisplayEntries = useMemo(() => {
    return displayEntries.filter((entry) => {
      if (selectedDateFilter) {
        const { dayIndex } = decodeScheduleTime(
          entry.item.time,
          savedSchedule?.session_duration ?? 60,
        );
        if (dates[dayIndex] !== selectedDateFilter) return false;
      }
      if (selectedStatusFilter) {
        const s = entry.item.interview_status ?? "not_invited";
        if (s !== selectedStatusFilter) return false;
      }
      return true;
    });
  }, [
    displayEntries,
    selectedDateFilter,
    selectedStatusFilter,
    dates,
    savedSchedule?.session_duration,
  ]);

  const calendarDates = useMemo(() => {
    if (selectedDateFilter) return [selectedDateFilter];
    return dates;
  }, [dates, selectedDateFilter]);
  const enabledTimeOptions = useMemo(
    () =>
      savedSchedule
        ? selectEnabledTimeOptions(
            dates,
            enabledSlots,
            savedSchedule.session_duration,
          )
        : [],
    [dates, enabledSlots, savedSchedule],
  );
  const namesVisible = Boolean(
    savedSchedule &&
      candidateNamesAreVisible(savedSchedule, canToggleCandidateNames),
  );
  const sortedDates = useMemo(() => [...dates].sort(), [dates]);
  const lastConfiguredDate = sortedDates[sortedDates.length - 1];
  const distributedThrough = savedSchedule?.distributed_through ?? null;
  const isPartiallyPublished = Boolean(
    distributedThrough &&
      lastConfiguredDate &&
      distributedThrough <= lastConfiguredDate,
  );
  const extendableDates = sortedDates.filter(
    (date) => !distributedThrough || date > distributedThrough,
  );

  const toggleLock = async (scheduleIndex: number) => {
    if (lockBusyIndex !== null) return;
    setLockBusyIndex(scheduleIndex);
    try {
      await onToggleLock(scheduleIndex);
    } finally {
      setLockBusyIndex(null);
    }
  };

  const setBookingSource = async (
    scheduleIndex: number,
    source: "solver" | "manual",
  ) => {
    if (lockBusyIndex !== null) return;
    setLockBusyIndex(scheduleIndex);
    try {
      await onSetBookingSource(scheduleIndex, source);
    } finally {
      setLockBusyIndex(null);
    }
  };

  if (!savedSchedule) {
    return <EmptyDistributedPlan isAdmin={isAdmin} />;
  }

  const formatTimeLabel = (timeValue: number) =>
    formatSlotLabel(timeValue, dates, savedSchedule.session_duration);

  const changeTime = async (scheduleIndex: number, nextTime: string) => {
    const item = savedSchedule.schedule[scheduleIndex];
    if (!item || !nextTime || isChangingTime) return;
    if (String(item.time) === nextTime) return;
    setIsChangingTime(true);
    try {
      await onChangeInterviewTime(scheduleIndex, Number(nextTime));
    } finally {
      setIsChangingTime(false);
    }
  };

  const getTimeOptionsForEdit = (scheduleIndex: number) =>
    savedSchedule
      ? selectTimeOptionsForEdit(
          savedSchedule,
          enabledTimeOptions,
          scheduleIndex,
        ).map((time) => ({
          value: String(time),
          label: formatTimeLabel(time),
        }))
      : [];

  const handleExportIcs = (target: "apple" | "google") => {
    const selectedSchedule = myInterviewsOnly
      ? myInterviews.map(({ item }) => item)
      : savedSchedule.schedule;
    exportAnonymizedScheduleIcs({
      schedule: selectedSchedule,
      dates,
      sessionDuration: savedSchedule.session_duration,
      target,
      myInterviewsOnly,
    });
  };

  const handleExportCsv = () => {
    exportVisibleScheduleCsv({
      entries: displayEntries,
      candidateNamesVisible: namesVisible,
      formatTimeLabel,
    });
  };

  const handleSelectVisibility = async (next: NameVisibility) => {
    if (!canToggleCandidateNames || isUpdatingNames) return;
    if (next === savedSchedule.name_visibility) {
      return;
    }

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

  const confirmUnlock = async () => {
    const unlocked = await onUnlock();
    if (!unlocked) return;
    setIsUnlockDialogOpen(false);
    onUnlocked();
  };

  const confirmExtend = async () => {
    if (!extendThroughDate) return;
    const extended = await onExtendDistributedThrough(extendThroughDate);
    if (extended) setIsExtendDialogOpen(false);
  };

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={CalendarCheck}
        title="Intervjuplan"
        chips={
          <Chip tone="success">
            {isPartiallyPublished && distributedThrough
              ? `Publisert t.o.m. ${formatAccessibleDate(distributedThrough)}`
              : "Publisert"}
          </Chip>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExportChooserOpen(true)}
              className={cn(
                actionButtonBase,
                actionButtonNeutral,
                "inline-flex items-center gap-1.5",
              )}
            >
              <Download size={iconSizes.small} aria-hidden="true" />
              Eksporter
            </button>
            {isAdmin && isPartiallyPublished && extendableDates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setExtendThroughDate(
                    extendableDates[extendableDates.length - 1],
                  );
                  setIsExtendDialogOpen(true);
                }}
                disabled={planTransition !== null}
                className={cn(
                  actionButtonBase,
                  actionButtonNeutral,
                  "inline-flex items-center gap-1.5",
                )}
              >
                Utvid publisering
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsUnlockDialogOpen(true)}
                disabled={planTransition !== null}
                className={cn(
                  actionButtonBase,
                  actionButtonDanger,
                  "inline-flex items-center gap-1.5",
                )}
              >
                <Pencil size={iconSizes.small} aria-hidden="true" />
                Rediger
              </button>
            )}
          </div>
        }
      />

      {planTransitionError && (
        <div
          role="alert"
          className="border-b border-danger-border bg-danger-bg px-6 py-3 text-ui font-semibold text-danger"
        >
          {planTransitionError}
        </div>
      )}

      <PlanFilterBar
        myInterviewsOnly={myInterviewsOnly}
        onToggleMyInterviews={() => setMyInterviewsOnly((value) => !value)}
        myInterviewsCount={myInterviews.length}
        planViewMode={planViewMode}
        onChangePlanViewMode={setPlanViewMode}
        canToggleCandidateNames={canToggleCandidateNames}
        canHideCandidateNames={isAdmin}
        nameVisibility={savedSchedule.name_visibility}
        onSelectVisibility={(next) => {
          if (!isUpdatingNames) handleSelectVisibility(next);
        }}
        isUpdatingNames={isUpdatingNames}
        conflictBadgeCount={
          isAdmin
            ? (totalCommitteeConflicts ?? 0)
            : namesVisible && myConflicts.length > 0
              ? myConflicts.length
              : 0
        }
        onOpenConflictsOverview={isAdmin ? onOpenConflictsOverview : undefined}
        dates={sortedDates}
        selectedDateFilter={selectedDateFilter}
        onSelectDateFilter={setSelectedDateFilter}
        dateCounts={dateCounts}
        canFilterByStatus={isAdmin}
        statusCounts={isAdmin ? (statusCounts ?? undefined) : undefined}
        selectedStatusFilter={selectedStatusFilter}
        onSelectStatusFilter={isAdmin ? setSelectedStatusFilter : undefined}
      />

      <SchedulePanelBody noPadding>
        {isExportChooserOpen && (
          <ExportChooserModal
            showCsv={isAdmin}
            onExportIcs={handleExportIcs}
            onExportCsv={handleExportCsv}
            onClose={() => setIsExportChooserOpen(false)}
          />
        )}

        {isPartiallyPublished && distributedThrough && (
          <div className="mx-6 my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-soft/70 px-4 py-3 text-ui">
            <div className="flex items-center gap-2.5">
              <CalendarDays
                className="text-brand flex-none"
                size={iconSizes.small}
              />
              <div>
                <p className="m-0 font-bold text-text-primary">
                  Planen er delvis publisert frem til{" "}
                  {formatDisplayDate(distributedThrough)}
                </p>
                <p className="m-0 text-detail text-text-muted">
                  Kandidater og komité ser bare intervjuer frem til denne
                  datoen. Intervjuer på senere dager holdes tilbake inntil dere
                  utvider.
                </p>
              </div>
            </div>
            {isAdmin && extendableDates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setExtendThroughDate(
                    extendableDates[extendableDates.length - 1],
                  );
                  setIsExtendDialogOpen(true);
                }}
                disabled={planTransition !== null}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-detail font-bold text-white shadow-sm hover:bg-brand-hover transition-colors cursor-pointer"
              >
                Utvid publisering
              </button>
            )}
          </div>
        )}

        <DistributedPlanNotices
          myInterviewsOnly={myInterviewsOnly}
          myInterviewsCount={myInterviews.length}
          currentUserName={currentUserName}
          candidateNamesVisible={namesVisible}
          conflictImpacts={conflictImpacts}
          formatTimeLabel={formatTimeLabel}
        />

        {canManageInterviewWorkflow && namesVisible && (
          <InterviewOutreachTemplateEditor
            value={outreachTemplates}
            onChange={handleTemplateChange}
            persistenceState={outreachPersistenceState}
            committeeName={committeeName}
          />
        )}

        {planViewMode === "calendar" ? (
          <DistributedPlanCalendar
            entries={filteredDisplayEntries}
            admissionSlug={admissionSlug}
            groupId={groupId}
            admissionTitle={admissionTitle}
            committeeName={committeeName}
            savedSchedule={savedSchedule}
            dates={calendarDates}
            enabledSlots={enabledSlots}
            candidateNamesVisible={namesVisible}
            isEditableDraft={false}
            isAdmin={isAdmin}
            canManageInterviewWorkflow={canManageInterviewWorkflow}
            outreachTemplates={outreachTemplates}
            conflictIds={conflictSet}
            lockBusy={lockBusyIndex !== null}
            lookups={lookups}
            onToggleLock={toggleLock}
            onSetBookingSource={setBookingSource}
            isChangingTime={isChangingTime}
            getTimeOptionsForEdit={getTimeOptionsForEdit}
            onChangeTime={changeTime}
            onReplacePanelMember={onReplacePanelMember}
            onSwapCandidates={onSwapCandidates}
          />
        ) : (
          <PublishedScheduleTable
            entries={filteredDisplayEntries}
            admissionSlug={admissionSlug}
            groupId={groupId}
            admissionTitle={admissionTitle}
            committeeName={committeeName}
            savedSchedule={savedSchedule}
            dates={dates}
            enabledSlots={enabledSlots}
            candidateNamesVisible={namesVisible}
            isAdmin={isAdmin}
            canManageInterviewWorkflow={canManageInterviewWorkflow}
            outreachTemplates={outreachTemplates}
            conflictIds={conflictSet}
            lookups={lookups}
          />
        )}
      </SchedulePanelBody>

      {isConfirmingShowNames && (
        <ConfirmDialog
          title="Gjør kandidatnavn synlige for hele komiteen?"
          confirmLabel={isUpdatingNames ? "Oppdaterer…" : "Ja, vis navn"}
          onConfirm={confirmShowNames}
          onClose={() => setIsConfirmingShowNames(false)}
          busy={isUpdatingNames}
          tone="danger"
        >
          <p className="m-0">
            Kandidatnavnene blir synlige for{" "}
            <span className="font-extrabold">alle</span> som har tilgang til
            intervjuplanen, ikke bare deg. Bruk det kun når komiteen trenger
            navnene for å gjennomføre intervjuene.
          </p>
        </ConfirmDialog>
      )}

      {isUnlockDialogOpen && (
        <ConfirmDialog
          title="Lås opp intervjuplan"
          tone="danger"
          icon={<Unlock size={iconSizes.standard} aria-hidden="true" />}
          confirmLabel={
            planTransition === "unlocking" ? "Låser opp…" : "Lås opp"
          }
          onConfirm={confirmUnlock}
          onClose={() => setIsUnlockDialogOpen(false)}
          busy={planTransition === "unlocking"}
        >
          <p className="m-0">
            Planen skjules for komiteen og åpnes i Planutkast, der du kan gjøre
            endringer og lagre et nytt utkast.
          </p>
        </ConfirmDialog>
      )}

      {isExtendDialogOpen && (
        <ConfirmDialog
          title="Utvid publisering"
          confirmLabel={
            planTransition === "publishing" ? "Utvider…" : "Utvid publisering"
          }
          onConfirm={confirmExtend}
          onClose={() => setIsExtendDialogOpen(false)}
          busy={planTransition === "publishing"}
        >
          <p className="m-0">
            Flere intervjuer blir synlige for komiteen. Planen er nå publisert
            til og med{" "}
            {distributedThrough ? formatAccessibleDate(distributedThrough) : ""}
            .
          </p>
          <label
            htmlFor="extend-through-date"
            className="m-0 mt-4 block text-detail font-semibold text-text-primary"
          >
            Publiser til og med
          </label>
          <select
            id="extend-through-date"
            value={extendThroughDate}
            onChange={(event) => setExtendThroughDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-ui text-text-primary"
          >
            {extendableDates.map((date) => (
              <option key={date} value={date}>
                {formatAccessibleDate(date)}
              </option>
            ))}
          </select>
        </ConfirmDialog>
      )}
    </SchedulePanel>
  );
};

export default DistributedPlanView;
