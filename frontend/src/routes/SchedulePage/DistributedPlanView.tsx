import React, { useEffect, useMemo, useState } from "react";
import { CalendarCheck, MoreHorizontal, Unlock } from "lucide-react";
import {
  Chip,
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  actionButtonBase,
  actionButtonNeutral,
  keyboardFocusRingClass,
  useDetailsMenu,
} from "src/components/Scheduling/ui";
import ConfirmDialog from "src/components/Scheduling/ConfirmDialog";
import ExportChooserModal from "src/components/Scheduling/Solver/ExportChooserModal";
import {
  Candidate,
  Interviewer,
  NameVisibility,
  SavedSchedule,
} from "../../types";
import { formatSlotLabel } from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";
import PlanFilterBar from "./PlanFilterBar";
import DistributedPlanCalendar from "./DistributedPlanCalendar";
import DistributedPlanTable from "./DistributedPlanTable";
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
  type InterviewOutreachTemplates,
  normalizeStoredOutreachTemplates,
} from "./interviewOutreach";
import { iconSizes } from "src/styles/designTokens";
import { buildInterviewOutreachTemplateStorageKey } from "src/query/sensitiveBrowserStorage";

interface DistributedPlanViewProps {
  admissionSlug: string;
  admissionTitle: string;
  committeeName: string;
  committeeScopeId: string;
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
  planTransition: "publishing" | "unlocking" | null;
  planTransitionError: string;
  myConflicts: string[];
  realCandidates: Candidate[];
  interviewers: Interviewer[];
  enabledSlots: Set<string>;
}

const loadOutreachTemplates = (
  storageKey: string | null,
  committeeName: string,
  defaultTemplates: InterviewOutreachTemplates,
): InterviewOutreachTemplates => {
  if (!storageKey) return defaultTemplates;
  try {
    return normalizeStoredOutreachTemplates(
      window.localStorage.getItem(storageKey),
      committeeName,
    );
  } catch {
    return defaultTemplates;
  }
};

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  admissionSlug,
  admissionTitle,
  committeeName,
  committeeScopeId,
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
  planTransition,
  planTransitionError,
  myConflicts,
  realCandidates,
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
  const [isChangingTime, setIsChangingTime] = useState(false);
  const [lockBusyIndex, setLockBusyIndex] = useState<number | null>(null);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const {
    detailsRef: actionMenuRef,
    closeDetails: closeActionMenu,
    handleDetailsToggle: handleActionMenuToggle,
  } = useDetailsMenu();
  const [outreachPersistenceState, setOutreachPersistenceState] = useState<
    "saving" | "saved" | "error"
  >("saved");
  const outreachTemplateStorageKey = currentUserId
    ? buildInterviewOutreachTemplateStorageKey(
        admissionSlug,
        currentUserId,
        committeeScopeId,
      )
    : null;
  const defaultOutreachTemplates = useMemo(
    () => createDefaultInterviewOutreachTemplates(committeeName),
    [committeeName],
  );
  const [outreachTemplateState, setOutreachTemplateState] = useState(() => ({
    storageKey: outreachTemplateStorageKey,
    templates: loadOutreachTemplates(
      outreachTemplateStorageKey,
      committeeName,
      defaultOutreachTemplates,
    ),
  }));
  const outreachTemplates =
    outreachTemplateState.storageKey === outreachTemplateStorageKey
      ? outreachTemplateState.templates
      : defaultOutreachTemplates;

  useEffect(() => {
    setOutreachTemplateState({
      storageKey: outreachTemplateStorageKey,
      templates: loadOutreachTemplates(
        outreachTemplateStorageKey,
        committeeName,
        defaultOutreachTemplates,
      ),
    });
  }, [committeeName, defaultOutreachTemplates, outreachTemplateStorageKey]);

  const setOutreachTemplates = (templates: InterviewOutreachTemplates) => {
    setOutreachTemplateState({
      storageKey: outreachTemplateStorageKey,
      templates,
    });
  };

  useEffect(() => {
    if (
      !outreachTemplateStorageKey ||
      outreachTemplateState.storageKey !== outreachTemplateStorageKey
    ) {
      return;
    }
    try {
      window.localStorage.setItem(
        outreachTemplateStorageKey,
        JSON.stringify(outreachTemplateState.templates),
      );
      setOutreachPersistenceState("saved");
    } catch {
      setOutreachPersistenceState("error");
    }
  }, [outreachTemplateState, outreachTemplateStorageKey]);

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
  const hasPartialCandidateDisclosure = Boolean(
    isAdmin &&
      savedSchedule &&
      savedSchedule.name_visibility !== "committee" &&
      savedSchedule.revealed_groups?.length,
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
    if (
      next === savedSchedule.name_visibility &&
      !hasPartialCandidateDisclosure
    ) {
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

  return (
    <SchedulePanel>
      <SchedulePanelHeader
        icon={CalendarCheck}
        title="Intervjuplan"
        chips={<Chip tone="success">Publisert</Chip>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <details
              ref={actionMenuRef}
              onToggle={handleActionMenuToggle}
              className="relative"
            >
              <summary
                aria-haspopup="menu"
                className={cn(
                  actionButtonBase,
                  actionButtonNeutral,
                  "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                )}
              >
                <MoreHorizontal size={iconSizes.small} aria-hidden="true" />
                Flere handlinger
              </summary>
              <div
                role="menu"
                aria-label="Flere handlinger for intervjuplanen"
                className="absolute right-0 top-full z-30 mt-2 grid min-w-56 gap-1 overflow-hidden rounded-lg border border-border bg-surface-base p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeActionMenu(true);
                    setIsExportChooserOpen(true);
                  }}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-left text-ui font-semibold text-text-primary hover:bg-surface-subtle",
                    keyboardFocusRingClass,
                  )}
                >
                  Eksporter plan
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeActionMenu(true);
                      setIsUnlockDialogOpen(true);
                    }}
                    disabled={planTransition !== null}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-left text-ui font-semibold text-danger hover:bg-danger-bg",
                      keyboardFocusRingClass,
                    )}
                  >
                    <Unlock size={iconSizes.small} aria-hidden="true" />
                    Lås opp og rediger
                  </button>
                )}
              </div>
            </details>
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
        revealedGroupNames={
          savedSchedule.revealed_groups?.map((group) => group.name) ?? []
        }
        onSelectVisibility={(next) => {
          if (!isUpdatingNames) handleSelectVisibility(next);
        }}
        isUpdatingNames={isUpdatingNames}
        conflictBadgeCount={
          namesVisible && myConflicts.length > 0 ? myConflicts.length : 0
        }
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
            onChange={(nextTemplates) => {
              setOutreachPersistenceState("saving");
              setOutreachTemplates(nextTemplates);
            }}
            persistenceState={outreachPersistenceState}
            committeeName={committeeName}
          />
        )}

        {planViewMode === "calendar" ? (
          <DistributedPlanCalendar
            entries={displayEntries}
            admissionSlug={admissionSlug}
            admissionTitle={admissionTitle}
            committeeName={committeeName}
            savedSchedule={savedSchedule}
            dates={dates}
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
          />
        ) : (
          <DistributedPlanTable
            entries={displayEntries}
            admissionSlug={admissionSlug}
            admissionTitle={admissionTitle}
            committeeName={committeeName}
            savedSchedule={savedSchedule}
            dates={dates}
            enabledSlots={enabledSlots}
            candidateNamesVisible={namesVisible}
            isEditableDraft={false}
            isAdmin={isAdmin}
            canManageInterviewWorkflow={canManageInterviewWorkflow}
            outreachTemplates={outreachTemplates}
            conflictIds={conflictSet}
            lockBusy={lockBusyIndex !== null}
            lookups={lookups}
            formatTimeLabel={formatTimeLabel}
            onToggleLock={toggleLock}
            onSetBookingSource={setBookingSource}
            isChangingTime={isChangingTime}
            getTimeOptionsForEdit={getTimeOptionsForEdit}
            onChangeTime={changeTime}
            onReplacePanelMember={onReplacePanelMember}
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
    </SchedulePanel>
  );
};

export default DistributedPlanView;
