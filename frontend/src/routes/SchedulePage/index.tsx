import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { HelpCircle, Loader2, RefreshCw } from "lucide-react";
import {
  useAdmission,
  useInterviewCandidates,
  useInterviewAvailability,
  useSavedSchedule,
} from "src/query/hooks";
import StatusToast, { StatusToastState } from "src/components/StatusToast";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import { normalizeSolverOptions } from "src/components/Scheduling/Solver/solverHelpers";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import djangoData from "src/utils/djangoData";
import cn from "src/utils/cn";
import WizardTour, {
  useWizardTour,
} from "src/components/Scheduling/WizardTour";
import WorkflowStepper from "./WorkflowStepper";
import MemberAvailabilityPending from "./MemberAvailabilityPending";
import DistributedPlanView from "./DistributedPlanView";
import ConflictReviewView from "./ConflictReviewView";
import PublicationGate from "./PublicationGate";
import { useAvailabilityEditor } from "./useAvailabilityEditor";
import { useDistributedPlanActions } from "./useDistributedPlanActions";
import { useScheduleConfiguration } from "./useScheduleConfiguration";
import { useScheduleParticipants } from "./useScheduleParticipants";
import { useScheduleWorkflow } from "./useScheduleWorkflow";
import { iconSizes } from "src/styles/designTokens";
import type {
  Candidate,
  InterviewAvailabilityParticipant,
  SavedSchedule,
} from "src/types";
import FoundationWorkspaceNav, {
  type FoundationWorkspace,
} from "./FoundationWorkspaceNav";
import {
  deriveScheduleDataHealth,
  scheduleDataSourceLabel,
  type ScheduleDataHealth,
  type ScheduleDataSource,
} from "./scheduleDataHealth";
import { SchedulingButton } from "src/components/Scheduling/ui";

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const {
    data: admission,
    isError: isAdmissionError,
    error: admissionError,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");

  if (isAdmissionError) {
    const accessDenied = [401, 403].includes(
      admissionError?.response?.status ?? 0,
    );
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3">
          <p className="m-0 text-ui font-semibold text-danger">
            {accessDenied
              ? "Tilgangen til intervjuplanleggingen er fjernet. Kandidatdata er tømt fra visningen."
              : "Kunne ikke hente opptaket."}
          </p>
          {!accessDenied && (
            <button
              type="button"
              onClick={() => refetchAdmission()}
              className="rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger"
            >
              Prøv igjen
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-panel border border-border bg-surface-base px-6 py-16 shadow-sm"
        >
          <Loader2
            size={iconSizes.standard}
            className="animate-spin text-brand"
          />
          <span className="text-ui font-semibold text-text-muted">Laster…</span>
        </div>
      </div>
    );
  }

  const { is_admin, committee_role, represented_groups, committee_groups } =
    admission.userdata;
  const committeeName =
    represented_groups[0] ??
    committee_groups[0] ??
    (admission.groups.length === 1
      ? admission.groups[0].name
      : admission.title);
  const canRevealCandidateNames =
    is_admin || committee_role === "leader" || committee_role === "recruiting";
  const canManageInterviewWorkflow = canRevealCandidateNames;
  const canManageSchedule = canRevealCandidateNames;

  return (
    <CommonScheduleView
      key={admissionSlug}
      admissionTitle={admission.title}
      committeeName={committeeName}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={canManageSchedule}
      canManageSchedule={canManageSchedule}
      committeeRole={committee_role}
      canRevealCandidateNames={canRevealCandidateNames}
      canManageInterviewWorkflow={canManageInterviewWorkflow}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  committeeName: string;
  admissionSlug: string;
  isAdmin: boolean;
  canManageSchedule: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
  canRevealCandidateNames: boolean;
  canManageInterviewWorkflow: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = (props) => {
  const { admissionSlug } = props;
  const {
    data: savedSchedule,
    isError: isSavedScheduleError,
    error: savedScheduleError,
    refetch: refetchSavedSchedule,
  } = useSavedSchedule(admissionSlug);
  const {
    data: interviewCandidates,
    isError: isCandidatesError,
    error: candidatesError,
    refetch: refetchCandidates,
  } = useInterviewCandidates(admissionSlug);
  const {
    data: availabilityParticipants,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    error: availabilityError,
    refetch: refetchAvailability,
  } = useInterviewAvailability(admissionSlug);

  const accessDenied = [
    savedScheduleError,
    availabilityError,
    candidatesError,
  ].some((error) => [401, 403].includes(error?.response?.status ?? 0));
  const admissionUnavailable = [availabilityError, candidatesError].some(
    (error) => error?.response?.status === 404,
  );

  if (accessDenied || admissionUnavailable) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16 handheld:px-4">
        <div
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-bg px-5 py-4 text-ui font-semibold text-danger"
        >
          Tilgangen til intervjuplanleggingen er fjernet, eller opptaket finnes
          ikke lenger. Kandidatdata er tømt fra visningen.
        </div>
      </div>
    );
  }

  const dataHealth = deriveScheduleDataHealth({
    savedSchedule,
    savedScheduleError,
    isSavedScheduleError,
    availabilityParticipants,
    availabilityError,
    isAvailabilityError,
    interviewCandidates,
    candidatesError,
    isCandidatesError,
  });
  const candidateScopeResolved =
    interviewCandidates !== undefined ||
    [401, 403, 404].includes(candidatesError?.response?.status ?? 0);
  const retryLoad = (
    sources: ScheduleDataSource[] = dataHealth.failedSources,
  ) => {
    if (sources.includes("schedule")) void refetchSavedSchedule();
    if (sources.includes("availability")) void refetchAvailability();
    if (sources.includes("candidates")) void refetchCandidates();
  };

  if (dataHealth.kind === "initial_error") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-16 handheld:px-4">
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger-border bg-danger-bg px-5 py-4"
        >
          <div>
            <p className="m-0 text-ui font-semibold text-danger">
              Kunne ikke laste intervjuplanleggingen.
            </p>
            <p className="m-0 mt-1 text-detail text-danger">
              Prøv igjen for å hente nødvendige data før du fortsetter.
            </p>
          </div>
          <SchedulingButton variant="danger" onClick={() => retryLoad()}>
            <RefreshCw size={iconSizes.detail} aria-hidden="true" />
            Prøv igjen
          </SchedulingButton>
        </div>
      </div>
    );
  }

  return (
    <LoadedScheduleView
      {...props}
      savedSchedule={savedSchedule}
      interviewCandidates={interviewCandidates}
      availabilityParticipants={availabilityParticipants}
      isAvailabilityLoading={isAvailabilityLoading}
      dataHealth={dataHealth}
      candidateScopeResolved={candidateScopeResolved}
      onRetryLoad={retryLoad}
    />
  );
};

interface LoadedScheduleViewProps extends CommonScheduleViewProps {
  savedSchedule: SavedSchedule | undefined;
  interviewCandidates: Candidate[] | undefined;
  availabilityParticipants: InterviewAvailabilityParticipant[] | undefined;
  isAvailabilityLoading: boolean;
  dataHealth: ScheduleDataHealth;
  candidateScopeResolved: boolean;
  onRetryLoad: () => void;
}

const LoadedScheduleView: React.FC<LoadedScheduleViewProps> = ({
  admissionTitle,
  committeeName,
  admissionSlug,
  isAdmin,
  committeeRole,
  canManageSchedule,
  canRevealCandidateNames,
  canManageInterviewWorkflow,
  savedSchedule,
  interviewCandidates,
  availabilityParticipants,
  dataHealth,
  candidateScopeResolved,
  onRetryLoad,
}) => {
  const roleLabel = (() => {
    if (committeeRole === "leader") return "Leder";
    if (committeeRole === "recruiting") return "Opptaksansvarlig";
    if (committeeRole === "member") return "Medlem";
    return "Intervjuer";
  })();

  const wizard = useWizardTour(canManageSchedule);

  useEffect(() => {
    wizard.openIfNotDismissed();
  }, []);

  const [toast, setToast] = useState<StatusToastState | null>(null);
  const [solverEditRequestKey, setSolverEditRequestKey] = useState(0);
  const [conflictReviewRequestKey, setConflictReviewRequestKey] = useState(0);
  const [foundationWorkspace, setFoundationWorkspace] =
    useState<FoundationWorkspace>("framework");
  const [frameworkDraftStatus, setFrameworkDraftStatus] = useState({
    hasPendingChanges: false,
    isValid: true,
  });

  const showToast = (
    message: string,
    tone: StatusToastState["tone"] = "success",
  ) => {
    setToast({ id: Date.now(), message, tone });
  };

  useEffect(() => {
    if (!toast) return;
    const duration = Math.min(8000, Math.max(2800, toast.message.length * 40));
    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const configuration = useScheduleConfiguration({
    admissionSlug,
    savedSchedule,
    notify: showToast,
  });
  const availability = useAvailabilityEditor({
    admissionSlug,
    participants: availabilityParticipants,
    notify: showToast,
  });
  const workflow = useScheduleWorkflow({
    isAdmin: canManageSchedule,
    savedSchedule,
    participants: availabilityParticipants,
    candidateIds: interviewCandidates?.map((candidate) => candidate.id) ?? [],
    candidateScopeResolved,
  });
  const participants = useScheduleParticipants({
    isAdmin: canManageSchedule,
    candidates: interviewCandidates,
    participants: availabilityParticipants,
    dates: configuration.dates,
    sessionDuration: configuration.sessionDuration,
    dayStartMinute: configuration.dayStartMinute,
    dayEndMinute: configuration.dayEndMinute,
    chunkSize: configuration.chunkSize,
  });
  const planActions = useDistributedPlanActions({
    admissionSlug,
    savedSchedule,
    notify: showToast,
  });
  const {
    startDate,
    endDate,
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
    blockMode,
    manualBlocks,
    layoutVersion,
    slotOverrides,
    enabledWindows,
    enabledSlots,
    dates,
    revision: configurationRevision,
    saveConfig,
  } = configuration;
  const {
    selectedSlots: mySelectedSlots,
    setSelectedSlots: setMySelectedSlots,
    currentParticipant: myAvailabilityParticipant,
    saveAvailability,
    saveConflictReview,
    setParticipation,
    setExperienceLevel,
  } = availability;
  const {
    activeSection,
    visitedSections,
    steps: workflowSteps,
    changeSection: handleSectionChange,
    hasConfiguredAvailabilityWindows,
    hasScheduleDraft,
    currentReviewRequired,
    currentReviewComplete,
    publicationReadiness,
    workflowPhase,
    availabilityReady,
  } = workflow;
  const {
    realCandidates,
    realInterviewers,
    solverCandidates: candidates,
    solverInterviewers: interviewers,
    syntheticInput,
    developmentTools,
  } = participants;
  const {
    publishSchedule: handlePublishSchedule,
    unlockSchedule: handleUnlockSchedule,
    planTransition,
    planTransitionError,
    setNameVisibility: handleSetNameVisibility,
    replacePanelMember: handleReplacePanelMember,
    changeInterviewTime: handleChangeInterviewTime,
    toggleLock: handleToggleLock,
    setBookingSource: handleSetBookingSource,
  } = planActions;
  const openProposalForEditing = () => {
    setSolverEditRequestKey((key) => key + 1);
    handleSectionChange("solver");
  };
  const openConflictReview = () => {
    setConflictReviewRequestKey((key) => key + 1);
    handleSectionChange(isAdmin ? "solver" : "my-availability");
  };
  const activeAvailabilityParticipants =
    availabilityParticipants?.filter(
      (participant) => participant.participation !== "not_participating",
    ) ?? [];
  const submittedAvailabilityCount = activeAvailabilityParticipants.filter(
    (participant) => participant.has_submitted,
  ).length;

  const currentUserName = djangoData.user?.full_name ?? "";

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 handheld:px-4">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-6 border-b border-border-soft pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-left text-display-sm font-semibold text-text-primary">
            {admissionTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {developmentTools}
          <span className="hidden text-detail font-semibold text-text-subtle sm:inline">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => wizard.open()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface-subtle px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-neutral"
          >
            <HelpCircle size={iconSizes.medium} />
            Hjelp
          </button>
        </div>
      </header>

      {dataHealth.kind === "refresh_error" && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-border-soft bg-surface-subtle px-4 py-3"
        >
          <p className="m-0 text-detail text-text-muted">
            Viser sist hentede data. Kunne ikke oppdatere{" "}
            {dataHealth.failedSources.map(scheduleDataSourceLabel).join(", ")}.
          </p>
          <SchedulingButton
            variant="quiet"
            onClick={onRetryLoad}
            className="h-8 px-3 text-detail"
          >
            <RefreshCw size={iconSizes.detail} aria-hidden="true" />
            Oppdater
          </SchedulingButton>
        </div>
      )}

      <div
        data-cy="workflow-phase"
        data-phase={workflowPhase}
        className="border-b border-border bg-surface-base"
      >
        <WorkflowStepper
          steps={workflowSteps}
          activeKey={activeSection}
          onChange={handleSectionChange}
        />
        {isAdmin && activeSection === "config" && (
          <FoundationWorkspaceNav
            active={foundationWorkspace}
            onChange={setFoundationWorkspace}
            frameworkComplete={hasConfiguredAvailabilityWindows}
            availabilityComplete={Boolean(
              myAvailabilityParticipant?.has_submitted ||
                myAvailabilityParticipant?.participation ===
                  "not_participating",
            )}
            submittedCount={submittedAvailabilityCount}
            participantCount={activeAvailabilityParticipants.length}
            frameworkDraftValid={frameworkDraftStatus.isValid}
            frameworkHasPendingChanges={frameworkDraftStatus.hasPendingChanges}
          />
        )}
      </div>

      <main className="mt-3 flex flex-col gap-3">
        {!isAdmin && visitedSections.has("my-availability") && (
          <div className={activeSection === "my-availability" ? "" : "hidden"}>
            {!isAdmin && !hasConfiguredAvailabilityWindows ? (
              <MemberAvailabilityPending />
            ) : (
              <div className="flex flex-col gap-3">
                <TimeScheduler
                  enabledSlots={enabledSlots}
                  selectedSlots={mySelectedSlots}
                  onSlotsChange={setMySelectedSlots}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  chunkSize={chunkSize}
                  chunkBreakMinutes={chunkBreakMinutes}
                  dayStartMinute={dayStartMinute}
                  dayEndMinute={dayEndMinute}
                  onSave={saveAvailability}
                  participation={myAvailabilityParticipant?.participation}
                  affectedAssignmentCount={
                    myAvailabilityParticipant?.affected_assignment_count ?? 0
                  }
                  onOptOut={() => setParticipation("not_participating")}
                  onRejoin={() => setParticipation("awaiting_response")}
                />
                {savedSchedule?.conflict_review_open &&
                  (myAvailabilityParticipant?.slots.length ?? 0) > 0 && (
                    <ConflictReviewView
                      candidates={interviewCandidates}
                      currentParticipant={myAvailabilityParticipant}
                      onSaveReview={saveConflictReview}
                      openRequestKey={conflictReviewRequestKey}
                    />
                  )}
              </div>
            )}
          </div>
        )}

        {isAdmin && visitedSections.has("config") && (
          <div className={activeSection === "config" ? "" : "hidden"}>
            <AdminScheduleConfig
              activeTab={foundationWorkspace}
              startDate={startDate}
              endDate={endDate}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              sessionDuration={sessionDuration}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              layoutVersion={layoutVersion}
              slotOverrides={slotOverrides}
              enabledSlots={enabledSlots}
              enabledWindows={enabledWindows}
              scheduleRevision={configurationRevision}
              hasScheduleDraft={hasScheduleDraft}
              onDraftStatusChange={setFrameworkDraftStatus}
              onSave={saveConfig}
              onAvailabilityAdditionSaved={() =>
                showToast(
                  "Nye intervjutider er lagt til. Intervjuerne må bekrefte tilgjengelighet på nytt.",
                )
              }
            />
            <div
              id="foundation-panel-availability"
              role="tabpanel"
              aria-labelledby="foundation-tab-availability"
              hidden={foundationWorkspace !== "availability"}
            >
              {!hasConfiguredAvailabilityWindows ? (
                <MemberAvailabilityPending
                  title="Lagre oppsettet først"
                  description="Du kan velge din egen tilgjengelighet så snart tidsrammer og intervjublokker er lagret under Oppsett."
                />
              ) : (
                <TimeScheduler
                  enabledSlots={enabledSlots}
                  selectedSlots={mySelectedSlots}
                  onSlotsChange={setMySelectedSlots}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  chunkSize={chunkSize}
                  chunkBreakMinutes={chunkBreakMinutes}
                  dayStartMinute={dayStartMinute}
                  dayEndMinute={dayEndMinute}
                  onSave={saveAvailability}
                  participation={myAvailabilityParticipant?.participation}
                  affectedAssignmentCount={
                    myAvailabilityParticipant?.affected_assignment_count ?? 0
                  }
                  onOptOut={() => setParticipation("not_participating")}
                  onRejoin={() => setParticipation("awaiting_response")}
                />
              )}
            </div>
            <div
              id="foundation-panel-coverage"
              role="tabpanel"
              aria-labelledby="foundation-tab-coverage"
              hidden={foundationWorkspace !== "coverage"}
              className={
                foundationWorkspace === "coverage"
                  ? "flex flex-col gap-3"
                  : "hidden"
              }
            >
              {!hasConfiguredAvailabilityWindows ? (
                <MemberAvailabilityPending
                  title="Ingen dekning å vise ennå"
                  description="Når oppsettet er lagret, kan du se intervjuernes svar, manglende svar og samlet kapasitet her."
                />
              ) : (
                <AvailabilityHeatmap
                  dates={dates}
                  interviewers={realInterviewers}
                  availableSlots={enabledSlots}
                  panelSize={savedSchedule?.panel_size ?? 3}
                  samePanelPerBlock={
                    savedSchedule
                      ? normalizeSolverOptions(
                          savedSchedule.solver_options ?? {},
                        ).panel_stability === "required"
                      : false
                  }
                  sessionDuration={sessionDuration}
                  chunkSize={chunkSize}
                  chunkBreakMinutes={chunkBreakMinutes}
                  dayStartMinute={dayStartMinute}
                  dayEndMinute={dayEndMinute}
                  onParticipationChange={(userId, participation) =>
                    setParticipation(participation, userId)
                  }
                  onExperienceLevelChange={setExperienceLevel}
                />
              )}
            </div>
          </div>
        )}

        {isAdmin && visitedSections.has("solver") && (
          <div
            className={cn(
              "flex flex-col gap-3",
              activeSection !== "solver" && "hidden",
            )}
          >
            {savedSchedule?.conflict_review_open &&
              myAvailabilityParticipant && (
                <ConflictReviewView
                  candidates={interviewCandidates}
                  currentParticipant={myAvailabilityParticipant}
                  onSaveReview={saveConflictReview}
                  openRequestKey={conflictReviewRequestKey}
                  reviewProgress={{
                    complete: publicationReadiness.completeReviewerCount,
                    total: publicationReadiness.requiredReviewerCount,
                    missingNames: publicationReadiness.missingReviewerNames,
                  }}
                />
              )}
            <SolverView
              candidates={candidates}
              interviewers={interviewers}
              dates={dates}
              sessionDuration={sessionDuration}
              admissionTitle={admissionTitle}
              admissionSlug={admissionSlug}
              startDate={startDate}
              endDate={endDate}
              enabledWindows={savedSchedule?.enabled_windows ?? []}
              enabledSlots={enabledSlots}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              blockMode={blockMode}
              manualBlocks={manualBlocks}
              slotOverrides={slotOverrides}
              candidateScopeResolved={candidateScopeResolved}
              availabilityReady={availabilityReady}
              syntheticInput={syntheticInput}
              editRequestKey={solverEditRequestKey}
              currentReviewRequired={currentReviewRequired}
              currentReviewComplete={currentReviewComplete}
              completeReviewerCount={publicationReadiness.completeReviewerCount}
              requiredReviewerCount={publicationReadiness.requiredReviewerCount}
              pendingReviewerCount={
                publicationReadiness.incompleteReviewerCount
              }
              missingReviewerNames={publicationReadiness.missingReviewerNames}
              publicationReady={publicationReadiness.ready}
              onOpenAvailability={() => {
                setFoundationWorkspace("availability");
                handleSectionChange("config");
              }}
              onOpenFramework={() => {
                setFoundationWorkspace("framework");
                handleSectionChange("config");
              }}
              onOpenConflictReview={openConflictReview}
              onOpenPlan={() => handleSectionChange("plan")}
            />
          </div>
        )}

        {activeSection === "plan" &&
          (savedSchedule?.is_distributed ? (
            <DistributedPlanView
              admissionSlug={admissionSlug}
              admissionTitle={admissionTitle}
              committeeName={committeeName}
              savedSchedule={savedSchedule}
              dates={dates}
              isAdmin={isAdmin}
              canManageInterviewWorkflow={canManageInterviewWorkflow}
              currentUserName={currentUserName}
              currentUserId={myAvailabilityParticipant?.user_id}
              canToggleCandidateNames={canRevealCandidateNames}
              onSetNameVisibility={handleSetNameVisibility}
              onReplacePanelMember={handleReplacePanelMember}
              onChangeInterviewTime={handleChangeInterviewTime}
              onToggleLock={handleToggleLock}
              onSetBookingSource={handleSetBookingSource}
              onUnlock={handleUnlockSchedule}
              onUnlocked={openProposalForEditing}
              planTransition={planTransition}
              planTransitionError={planTransitionError}
              myConflicts={myAvailabilityParticipant?.conflicts ?? []}
              realCandidates={realCandidates}
              interviewers={interviewers}
              enabledSlots={enabledSlots}
            />
          ) : (
            <PublicationGate
              savedSchedule={savedSchedule}
              readiness={publicationReadiness}
              currentReviewRequired={currentReviewRequired}
              currentReviewComplete={currentReviewComplete}
              planTransition={planTransition}
              planTransitionError={planTransitionError}
              onOpenDraft={() => handleSectionChange("solver")}
              onOpenOwnReview={openConflictReview}
              onPublish={handlePublishSchedule}
            />
          ))}
      </main>

      <WizardTour
        isOpen={wizard.isOpen}
        onClose={wizard.close}
        isAdmin={isAdmin}
        onNavigate={handleSectionChange}
      />

      <StatusToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default SchedulePage;
