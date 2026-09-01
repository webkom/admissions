import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  Download,
  Pencil,
  Save,
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
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "src/components/Scheduling/ui";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import ExportChooserModal from "src/components/Scheduling/Solver/ExportChooserModal";
import { useInterviewCandidateTexts } from "src/query/hooks";
import PlanDayStrip from "src/components/Scheduling/Solver/PlanDayStrip";
import {
  Candidate,
  Interviewer,
  NameVisibility,
  SavedSchedule,
  ScheduleItem,
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
import SelfDeclareConflictPanel from "./SelfDeclareConflictPanel";
import {
  DistributedPlanNotices,
  EmptyDistributedPlan,
} from "./DistributedPlanStatus";
import {
  buildCanonicalBlocks,
  candidateNamesAreVisible,
  createDistributedPlanLookups,
  selectConflictImpacts,
  selectDistributedScheduleEntries,
  selectEnabledTimeOptions,
  selectTimeOptionsForEdit,
} from "./distributedPlanSelectors";
import { buildInterviewerDistribution } from "src/components/Scheduling/Solver/solverSelectors";
import InterviewerLoadView from "src/components/Scheduling/Solver/InterviewerLoadView";
import {
  exportAnonymizedScheduleIcs,
  exportVisibleScheduleCsv,
  type ScheduleCsvFields,
} from "./distributedPlanExports";
import InterviewOutreachTemplateEditor from "./InterviewOutreachTemplateEditor";
import {
  createDefaultInterviewOutreachTemplates,
  normalizeStoredOutreachTemplates,
  type InterviewOutreachTemplates,
} from "./interviewOutreach";
import { iconSizes } from "src/styles/designTokens";

/** Compare the working copy against the committed snapshot. Only plan content
 *  counts here (candidate placement, time, panel composition) - annotation
 *  fields like interview_status or locked can drift between the two copies
 *  without the admin having anything to commit. */
const planContentKey = (item: ScheduleItem) =>
  [
    item.candidate_id ?? item.candidate,
    item.time,
    (item.panel ?? [])
      .map((m) => String(m.id))
      .filter(Boolean)
      .sort()
      .join(","),
  ].join("|");

const planContentDiffers = (
  working: ScheduleItem[] | undefined,
  published: ScheduleItem[] | undefined,
): boolean => {
  const workingList = Array.isArray(working) ? working : [];
  const publishedList = Array.isArray(published) ? published : [];
  if (workingList.length !== publishedList.length) return true;
  const publishedKeys = new Set(publishedList.map(planContentKey));
  return workingList.some((item) => !publishedKeys.has(planContentKey(item)));
};

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
  /** Commit the working copy to what the committee reads - the "Lagre"
   *  button. Only meaningful while the plan is published. */
  onCommitPublishedSnapshot: () => Promise<boolean>;
  onExtendDistributedThrough: (date: string) => Promise<boolean>;
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  myConflicts: string[];
  realCandidates: Candidate[];
  /** The candidate pool this reader is actually allowed to see (mirrors the
   *  candidates/ endpoint's own visibility scoping) - backs the self-declare
   *  picker below. Empty whenever `namesVisible` is false, so the picker
   *  simply has nothing to show rather than needing a separate check. */
  selfDeclareCandidates: Candidate[];
  /** Add one or more candidates to this reader's own declared conflicts.
   *  Works at any time, published or not - see availability_views.py's
   *  is_self_only_conflict_declaration. */
  onDeclareOwnConflict: (candidateIds: string[]) => Promise<void>;
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
  onCommitPublishedSnapshot,
  onExtendDistributedThrough,
  planTransition,
  planTransitionError,
  myConflicts,
  realCandidates,
  selfDeclareCandidates,
  onDeclareOwnConflict,
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
  // Belastning on the published plan. Computed over the whole saved schedule,
  // never the filtered view: "how loaded is this person" is a fact about the
  // plan, and answering it from whatever the date/mine filters happen to show
  // would report a different number depending on where the admin was looking.
  const interviewerDistribution = useMemo(
    () =>
      savedSchedule
        ? buildInterviewerDistribution(
            interviewers,
            savedSchedule.schedule,
            lookups.availabilityStatusFor,
            buildCanonicalBlocks(savedSchedule, dates),
          )
        : [],
    [dates, interviewers, lookups, savedSchedule],
  );
  const totalAssignments = useMemo(
    () =>
      interviewerDistribution.reduce(
        (sum, interviewer) => sum + interviewer.count,
        0,
      ),
    [interviewerDistribution],
  );
  const [loadSelectedInterviewer, setLoadSelectedInterviewer] = useState("");

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
  // Søknadstekst is fetched only once the export chooser is open, and only for
  // someone who runs this committee - it is the heaviest and most sensitive
  // thing this page can hold, and the plain CSV never needs it. Declared here,
  // above the "no saved schedule" early return below, so the hook count does
  // not change between renders (React #300).
  const candidateTexts = useInterviewCandidateTexts(
    admissionSlug,
    groupId,
    isAdmin && isExportChooserOpen,
  );
  const applicationTextById = useMemo(() => {
    const byId = new Map<string, string>();
    (candidateTexts.data ?? []).forEach((candidate) => {
      if (candidate.application_text) {
        byId.set(candidate.id, candidate.application_text);
      }
    });
    return byId;
  }, [candidateTexts.data]);
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
  // Days holding interviews. Only these are worth releasing: publishing an
  // empty day tells the committee nothing and spends a boundary that can
  // never be moved back.
  const publishedDayDates = useMemo(
    () => new Set(dateCounts.keys()),
    [dateCounts],
  );
  const waivedReviewers = savedSchedule?.published_without_review_by ?? [];
  // The admin's working copy has drifted from what the committee reads, i.e.
  // there are edits that have not been saved out yet. Only an interview admin
  // is served `published_schedule` at all - for everyone else the snapshot
  // *is* their `schedule`, so this is always false and the Lagre button never
  // appears.
  //
  // Compared semantically, not with JSON.stringify: legacy responses may omit
  // `published_schedule` entirely (which must read as "nothing unsaved", not
  // "always unsaved"), and the two copies can differ in annotation-only
  // fields (interview_status, locked, booking_source, phone, timestamps) that
  // the committee does not need a re-commit for. Only plan content counts:
  // which candidate sits where, at what time, with which panel members.
  const hasUnsavedPlanChanges = useMemo(
    () =>
      Boolean(savedSchedule?.distributed_through) &&
      planContentDiffers(
        savedSchedule?.schedule,
        savedSchedule?.published_schedule,
      ),
    [savedSchedule],
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

  const handleExportCsv = (fields: ScheduleCsvFields) => {
    exportVisibleScheduleCsv({
      entries: displayEntries,
      fields,
      formatTimeLabel,
      applicationTextById: fields.applicationText
        ? applicationTextById
        : undefined,
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
            {isAdmin && hasUnsavedPlanChanges && (
              <button
                type="button"
                onClick={() => void onCommitPublishedSnapshot()}
                disabled={planTransition !== null}
                data-cy="commit-published-snapshot"
                className={cn(
                  actionButtonBase,
                  actionButtonPrimary,
                  "inline-flex items-center gap-1.5",
                )}
              >
                <Save size={iconSizes.small} aria-hidden="true" />
                {planTransition === "publishing" ? "Lagrer…" : "Lagre"}
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={onUnlocked}
                disabled={planTransition !== null}
                data-cy="edit-published-plan"
                title="Åpne planen i planutkast. Komiteen beholder planen slik den er lagret til du lagrer på nytt."
                className={cn(
                  actionButtonBase,
                  actionButtonNeutral,
                  "inline-flex items-center gap-1.5",
                )}
              >
                <Pencil size={iconSizes.small} aria-hidden="true" />
                Rediger
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
                <Unlock size={iconSizes.small} aria-hidden="true" />
                Avpubliser
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

      {/* Shown to everyone who can see the plan, not just the admin who
          decided it: a committee member who is inhabil in one of these
          pairings is the last line of defence when nobody ran the check. A
          list of who *else* didn't check is not actionable for that reader -
          this is the actual action, standing and available whether or not
          anyone was ever waived, not only a reaction to that one event.
          `selfDeclareCandidates` is already scoped to what this reader may
          see, so it is simply empty (and the panel renders nothing) when
          names are not visible to them - there is nothing to pick from. */}
      {selfDeclareCandidates.length > 0 && (
        <SelfDeclareConflictPanel
          candidates={selfDeclareCandidates}
          alreadyDeclared={new Set(myConflicts)}
          onDeclare={onDeclareOwnConflict}
          waivedReviewerNames={isAdmin ? waivedReviewers : []}
        />
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
            csvTextAvailable={isAdmin && !candidateTexts.isError}
            csvTextLoading={candidateTexts.isLoading}
            namesShownByDefault={namesVisible}
            onClose={() => setIsExportChooserOpen(false)}
          />
        )}

        {/* Only while there is still something to release. The strip is the
            control for moving the publication boundary; once the whole plan
            is out there is no boundary left to move, every cell is an
            identical lock, and its summary line just repeats the "Publisert"
            chip in the header above. */}
        {isAdmin && sortedDates.length > 1 && extendableDates.length > 0 && (
          <div className="mx-6 my-3">
            <PlanDayStrip
              dates={sortedDates}
              filledDates={publishedDayDates}
              distributedThrough={distributedThrough}
              onPublishThrough={
                extendableDates.length > 0 && planTransition === null
                  ? (date) => {
                      setExtendThroughDate(date);
                      setIsExtendDialogOpen(true);
                    }
                  : undefined
              }
              loading={planTransition !== null}
            />
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
            fullDates={dates}
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
            onReplacePanelMember={onReplacePanelMember}
          />
        )}
      </SchedulePanelBody>

      {/* Belastning, admin only. Collapsed by default: it answers a question
          the admin comes looking for ("is this spread fairly?"), not one the
          plan itself needs to keep answering, and the plan is what this view
          is for. Same component and the same numbers as the draft's
          Belastning section, so a plan does not report one workload before
          publication and another after. */}
      {isAdmin && interviewerDistribution.length > 0 && (
        <details className="group border-t border-border-soft">
          <summary
            data-cy="published-load-summary"
            className={cn(
              "flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-ui font-bold text-text-primary [&::-webkit-details-marker]:hidden",
              keyboardFocusRingClass,
            )}
          >
            Belastning
            <ChevronDown
              size={iconSizes.small}
              aria-hidden="true"
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-border-soft px-6 pb-6 pt-4">
            <InterviewerLoadView
              entries={sortedEntries}
              distribution={interviewerDistribution}
              totalAssignments={totalAssignments}
              selectedInterviewer={loadSelectedInterviewer}
              onSelectInterviewer={setLoadSelectedInterviewer}
              canEditDraft={isAdmin}
              interviewerOptions={lookups.interviewerOptions}
              onSwapPanelMember={(
                scheduleIndex,
                panelMemberIndex,
                newName,
                newId,
              ) =>
                void onReplacePanelMember(scheduleIndex, panelMemberIndex, {
                  id: newId,
                  name: newName,
                })
              }
              // Honours the plan's own name visibility, exactly as the table
              // and the CSV export do - a plan set to hide candidate names
              // must not reveal them through the workload drill-down.
              displayCandidate={(item) =>
                namesVisible ? item.candidate : "Skjult"
              }
              formatSlotTime={(time) =>
                formatSlotLabel(time, dates, savedSchedule.session_duration)
              }
              availabilityStatusFor={lookups.availabilityStatusFor}
              hasConflictFor={(scheduleIndex, member) => {
                const item = savedSchedule.schedule[scheduleIndex];
                const candidateId = item
                  ? lookups.candidateIdFor(item)
                  : undefined;
                return Boolean(
                  candidateId && lookups.biasedFor(member)?.has(candidateId),
                );
              }}
            />
          </div>
        </details>
      )}

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
