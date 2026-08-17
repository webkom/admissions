import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowRight, HelpCircle, Loader2, RefreshCw } from "lucide-react";
import {
  useAdmission,
  useInterviewCandidates,
  useInterviewAvailability,
  useSavedSchedule,
} from "src/query/hooks";
import StatusToast, { StatusToastState } from "src/components/StatusToast";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import type { DraftPersistenceStatus } from "src/components/Scheduling/Solver/useScheduleDraftPersistence";
import { normalizeSolverOptions } from "src/components/Scheduling/Solver/solverHelpers";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AvailabilityResponseRoster from "src/components/Scheduling/Calendar/AvailabilityResponseRoster";
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
import ConflictCollectionPanel from "./ConflictCollectionPanel";
import PublicationGate from "./PublicationGate";
import { useAvailabilityEditor } from "./useAvailabilityEditor";
import { useDistributedPlanActions } from "./useDistributedPlanActions";
import { useScheduleConfiguration } from "./useScheduleConfiguration";
import { useScheduleParticipants } from "./useScheduleParticipants";
import { useScheduleWorkflow } from "./useScheduleWorkflow";
import { iconSizes } from "src/styles/designTokens";
import type {
  Admission,
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
import {
  SchedulingButton,
  keyboardFocusRingClass,
} from "src/components/Scheduling/ui";
import {
  buildSensitiveAdmissionScopeKey,
  clearAllSensitiveDataForActorChange,
  clearSensitiveAdmissionDataForScopeChange,
  restoreSensitiveAccessAfterVerifiedAdmission,
} from "src/query/sensitiveAccess";
import { publishSensitiveActorIdentity } from "src/query/sensitiveActorSync";
import { apiClient } from "src/utils/callApi";

const sameIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((value) => rightIds.has(value));
};

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const queryClient = useQueryClient();
  const [isAccessRecoveryLoading, setIsAccessRecoveryLoading] = useState(false);
  const [accessRecoveryError, setAccessRecoveryError] = useState("");
  const {
    data: admission,
    isError: isAdmissionError,
    error: admissionError,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");
  const embeddedActorId = djangoData.user.id ?? null;
  const hasServerActorIdentity = Boolean(
    admission &&
      Object.prototype.hasOwnProperty.call(admission.userdata, "actor_id"),
  );
  const serverActorId = hasServerActorIdentity
    ? (admission?.userdata.actor_id ?? null)
    : embeddedActorId;
  const actorIdentityMismatch = Boolean(
    admission && hasServerActorIdentity && serverActorId !== embeddedActorId,
  );
  const sensitiveScopeKey = admission
    ? buildSensitiveAdmissionScopeKey({
        actorId: serverActorId,
        isAdmin: admission.userdata.is_admin,
        committeeRole: admission.userdata.committee_role,
        representedGroups: admission.userdata.represented_groups,
        committeeGroups: admission.userdata.committee_groups,
        applicationViewMode: admission.userdata.application_view_mode,
      })
    : "";
  const [activeSensitiveScopeKey, setActiveSensitiveScopeKey] = useState("");
  const sensitiveScopeChangePending = Boolean(
    admission && activeSensitiveScopeKey !== sensitiveScopeKey,
  );

  React.useLayoutEffect(() => {
    if (!admission || !sensitiveScopeKey) return;
    if (actorIdentityMismatch) {
      clearAllSensitiveDataForActorChange(queryClient);
      publishSensitiveActorIdentity(serverActorId);
      window.location.reload();
      return;
    }
    publishSensitiveActorIdentity(serverActorId);
    if (activeSensitiveScopeKey === sensitiveScopeKey) return;
    clearSensitiveAdmissionDataForScopeChange(queryClient, admissionSlug ?? "");
    setActiveSensitiveScopeKey(sensitiveScopeKey);
  }, [
    activeSensitiveScopeKey,
    admission,
    admissionSlug,
    actorIdentityMismatch,
    queryClient,
    serverActorId,
    sensitiveScopeKey,
  ]);

  const recoverSensitiveAccess = async () => {
    if (!admissionSlug || isAccessRecoveryLoading) return;
    setIsAccessRecoveryLoading(true);
    setAccessRecoveryError("");
    try {
      const freshAdmission = (
        await apiClient.get<Admission>(`/admission/${admissionSlug}/`)
      ).data;
      const restored = restoreSensitiveAccessAfterVerifiedAdmission(
        queryClient,
        admissionSlug,
        freshAdmission,
      );
      if (!restored) {
        setAccessRecoveryError(
          "Serveren bekreftet ikke en aktiv rolle i intervjuplanleggingen.",
        );
        return;
      }

      queryClient.setQueryData(
        [`/admission/${admissionSlug}/`],
        freshAdmission,
      );
    } catch {
      setAccessRecoveryError(
        "Tilgangen er fortsatt utilgjengelig. Logg inn på nytt hvis økten er utløpt.",
      );
    } finally {
      setIsAccessRecoveryLoading(false);
    }
  };

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
          {accessDenied ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void recoverSensitiveAccess()}
                disabled={isAccessRecoveryLoading}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger disabled:cursor-not-allowed disabled:opacity-60",
                  keyboardFocusRingClass,
                )}
              >
                {isAccessRecoveryLoading && (
                  <Loader2
                    size={iconSizes.detail}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                )}
                Kontroller tilgang
              </button>
              <a
                href="/login/lego/"
                className={cn(
                  "rounded-lg px-3 py-2 text-detail font-bold text-danger underline decoration-danger/50 underline-offset-4",
                  keyboardFocusRingClass,
                )}
              >
                Logg inn på nytt
              </a>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => refetchAdmission()}
              className={cn(
                "rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger",
                keyboardFocusRingClass,
              )}
            >
              Prøv igjen
            </button>
          )}
        </div>
        {accessRecoveryError && (
          <p
            role="alert"
            className="m-0 mt-3 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-detail font-semibold text-danger"
          >
            {accessRecoveryError}
          </p>
        )}
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

  if (sensitiveScopeChangePending) {
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
          <span className="text-ui font-semibold text-text-muted">
            Oppdaterer tilgang…
          </span>
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
  const canManageInterviewWorkflow =
    is_admin || committee_role === "leader" || committee_role === "recruiting";
  const canManageSchedule = is_admin;

  return (
    <CommonScheduleView
      key={`${admissionSlug}:${sensitiveScopeKey}`}
      admissionTitle={admission.title}
      committeeName={committeeName}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={canManageSchedule}
      canManageSchedule={canManageSchedule}
      committeeRole={committee_role}
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
  canManageInterviewWorkflow: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = (props) => {
  const { admissionSlug, isAdmin } = props;
  const queryClient = useQueryClient();
  const previousCollectionOpenRef = React.useRef<boolean | undefined>(
    undefined,
  );
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

  useEffect(() => {
    if (isAdmin || savedSchedule === undefined) return;
    const collectionOpen = Boolean(savedSchedule.conflict_collection_open);
    if (previousCollectionOpenRef.current === collectionOpen) return;
    previousCollectionOpenRef.current = collectionOpen;
    if (collectionOpen) return;

    const candidatesQueryKey = [
      `/admin/admission/${admissionSlug}/candidates/`,
    ];
    queryClient.setQueryData(candidatesQueryKey, []);
    void queryClient.invalidateQueries({
      queryKey: candidatesQueryKey,
      exact: true,
      refetchType: "active",
    });
  }, [
    admissionSlug,
    isAdmin,
    queryClient,
    savedSchedule?.conflict_collection_open,
  ]);

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
    isAvailabilityError,
    interviewCandidates,
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
  const foundationWorkspaceChosen = React.useRef(false);
  const [frameworkDraftStatus, setFrameworkDraftStatus] = useState({
    hasPendingChanges: false,
    isValid: true,
  });
  const [draftPersistenceStatus, setDraftPersistenceStatus] =
    useState<DraftPersistenceStatus | null>(null);
  const draftPersistenceReady =
    draftPersistenceStatus === null ||
    (draftPersistenceStatus.isSaved &&
      !draftPersistenceStatus.hasLocalDraft &&
      !draftPersistenceStatus.isSaving &&
      !draftPersistenceStatus.hasConflict &&
      !draftPersistenceStatus.error);

  useEffect(() => {
    setDraftPersistenceStatus(null);
  }, [admissionSlug]);

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
    draftPersistenceReady,
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
    draftPersistenceReady,
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
    setConflictCollectionOpen,
  } = configuration;
  const {
    selectedSlots: mySelectedSlots,
    setSelectedSlots: setMySelectedSlots,
    currentParticipant: myAvailabilityParticipant,
    saveAvailability,
    saveConflictReview,
    saveConflictCollectionReview,
    setParticipation,
    setExperienceLevel,
  } = availability;
  const [conflictCollectionSaving, setConflictCollectionSaving] =
    useState(false);
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
    foundationStage,
    publicationStage,
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
  const closeAdminConflictReview = () => {
    setConflictReviewRequestKey(0);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-cy="proposal-review"] h2')
        ?.focus({ preventScroll: true });
    });
  };
  const activeAvailabilityParticipants =
    availabilityParticipants?.filter(
      (participant) => participant.participation !== "not_participating",
    ) ?? [];
  const submittedAvailabilityCount = activeAvailabilityParticipants.filter(
    (participant) => participant.has_submitted,
  ).length;
  const recommendedFoundationWorkspace: FoundationWorkspace =
    foundationStage.kind === "framework"
      ? "framework"
      : foundationStage.kind === "availability"
        ? "availability"
        : "coverage";
  const openFoundationWorkspace = (workspace: FoundationWorkspace) => {
    foundationWorkspaceChosen.current = true;
    setFoundationWorkspace(workspace);
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `#foundation-panel-${workspace} [data-cy="schedule-stage"] h2`,
        )
        ?.focus({ preventScroll: true });
    });
  };
  // The same conditions the review stage renders under, minus the request key.
  // Without this an action offering to open the review can resolve to nothing.
  const conflictReviewReachable = Boolean(
    savedSchedule?.conflict_review_open && myAvailabilityParticipant,
  );
  const showAdminConflictReviewStage = Boolean(
    conflictReviewReachable && conflictReviewRequestKey > 0,
  );
  const collectionParticipants = (availabilityParticipants ?? []).filter(
    (participant) =>
      savedSchedule?.conflict_collection_participant_ids?.includes(
        participant.user_id,
      ),
  );
  const collectionParticipantCount =
    savedSchedule?.conflict_collection_participant_ids?.length ?? 0;
  const completedCollectionCount = collectionParticipants.filter(
    (participant) => participant.conflict_collection_complete,
  ).length;
  const collectionScopeStale = Boolean(
    savedSchedule?.conflict_collection_open &&
      interviewCandidates !== undefined &&
      availabilityParticipants !== undefined &&
      (!sameIds(
        savedSchedule.conflict_collection_candidate_ids ?? [],
        interviewCandidates.map((candidate) => candidate.id),
      ) ||
        !sameIds(
          savedSchedule.conflict_collection_participant_ids ?? [],
          availabilityParticipants
            .filter(
              (participant) => participant.participation === "participating",
            )
            .map((participant) => participant.user_id),
        )),
  );
  const toggleConflictCollection = async (open: boolean) => {
    if (conflictCollectionSaving) return;
    setConflictCollectionSaving(true);
    try {
      await setConflictCollectionOpen(open);
    } finally {
      setConflictCollectionSaving(false);
    }
  };

  useEffect(() => {
    if (foundationWorkspaceChosen.current) return;
    setFoundationWorkspace(recommendedFoundationWorkspace);
  }, [recommendedFoundationWorkspace]);

  const foundationNav = (
    <FoundationWorkspaceNav
      active={foundationWorkspace}
      onChange={openFoundationWorkspace}
      frameworkComplete={hasConfiguredAvailabilityWindows}
      availabilityComplete={Boolean(
        myAvailabilityParticipant?.has_submitted ||
          myAvailabilityParticipant?.participation === "not_participating",
      )}
      submittedCount={submittedAvailabilityCount}
      participantCount={activeAvailabilityParticipants.length}
      frameworkDraftValid={frameworkDraftStatus.isValid}
      frameworkHasPendingChanges={frameworkDraftStatus.hasPendingChanges}
    />
  );

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
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface-subtle px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-neutral",
              keyboardFocusRingClass,
            )}
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
                {savedSchedule?.conflict_collection_open &&
                  myAvailabilityParticipant?.participation ===
                    "participating" && (
                    <ConflictReviewView
                      candidates={interviewCandidates}
                      currentParticipant={myAvailabilityParticipant}
                      onSaveReview={saveConflictCollectionReview}
                      scope="collection"
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
              foundationNav={
                foundationWorkspace === "framework" ? foundationNav : undefined
              }
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
              onSaveSuccess={() => openFoundationWorkspace("availability")}
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
                  foundationNav={foundationNav}
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
                  onSaveSuccess={() => openFoundationWorkspace("coverage")}
                  participation={myAvailabilityParticipant?.participation}
                  affectedAssignmentCount={
                    myAvailabilityParticipant?.affected_assignment_count ?? 0
                  }
                  onOptOut={() => setParticipation("not_participating")}
                  onRejoin={() => setParticipation("awaiting_response")}
                  stage="foundation-availability"
                  foundationNav={
                    foundationWorkspace === "availability"
                      ? foundationNav
                      : undefined
                  }
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
                  foundationNav={foundationNav}
                />
              ) : (
                <>
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
                    stage={
                      foundationStage.kind === "coverage_ready"
                        ? "foundation-coverage-ready"
                        : "foundation-coverage-waiting"
                    }
                    foundationNav={
                      foundationWorkspace === "coverage"
                        ? foundationNav
                        : undefined
                    }
                    footerStatus={
                      <span
                        data-cy="foundation-stage-status"
                        className={
                          foundationStage.kind === "coverage_ready"
                            ? "text-detail font-semibold text-success"
                            : "text-detail font-semibold text-text-muted"
                        }
                      >
                        {foundationStage.description}
                      </span>
                    }
                    footerAction={
                      foundationStage.kind === "coverage_ready" ? (
                        <SchedulingButton
                          variant="primary"
                          onClick={() => handleSectionChange("solver")}
                          data-cy="schedule-stage-primary-action"
                        >
                          Lag planutkast
                          <ArrowRight
                            size={iconSizes.small}
                            aria-hidden="true"
                          />
                        </SchedulingButton>
                      ) : (
                        <span className="text-detail tabular-nums text-text-subtle">
                          {submittedAvailabilityCount} av{" "}
                          {activeAvailabilityParticipants.length} har svart
                        </span>
                      )
                    }
                  />
                  <AvailabilityResponseRoster
                    participants={availabilityParticipants ?? []}
                  />
                  <ConflictCollectionPanel
                    open={Boolean(savedSchedule?.conflict_collection_open)}
                    participantCount={collectionParticipantCount}
                    completedCount={completedCollectionCount}
                    candidateCount={interviewCandidates?.length ?? 0}
                    saving={conflictCollectionSaving}
                    stale={collectionScopeStale}
                    onToggle={(open) => void toggleConflictCollection(open)}
                  >
                    {myAvailabilityParticipant &&
                      myAvailabilityParticipant.participation ===
                        "participating" && (
                        <ConflictReviewView
                          candidates={interviewCandidates}
                          currentParticipant={myAvailabilityParticipant}
                          onSaveReview={saveConflictCollectionReview}
                          scope="collection"
                        />
                      )}
                  </ConflictCollectionPanel>
                </>
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
            {showAdminConflictReviewStage && myAvailabilityParticipant && (
              <ConflictReviewView
                candidates={interviewCandidates}
                currentParticipant={myAvailabilityParticipant}
                onSaveReview={saveConflictReview}
                openRequestKey={Math.max(1, conflictReviewRequestKey)}
                onCloseStage={closeAdminConflictReview}
                reviewProgress={{
                  complete: publicationReadiness.completeReviewerCount,
                  total: publicationReadiness.requiredReviewerCount,
                  missingNames: publicationReadiness.missingReviewerNames,
                }}
              />
            )}
            <section
              aria-label={
                showAdminConflictReviewStage && myAvailabilityParticipant
                  ? "Gjeldende planutkast"
                  : undefined
              }
            >
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
                completeReviewerCount={
                  publicationReadiness.completeReviewerCount
                }
                requiredReviewerCount={
                  publicationReadiness.requiredReviewerCount
                }
                pendingReviewerCount={
                  publicationReadiness.incompleteReviewerCount
                }
                missingReviewerNames={publicationReadiness.missingReviewerNames}
                publicationReady={publicationReadiness.ready}
                backgroundMode={Boolean(
                  showAdminConflictReviewStage && myAvailabilityParticipant,
                )}
                onDraftPersistenceChange={setDraftPersistenceStatus}
                onExperienceLevelChange={setExperienceLevel}
                onOpenAvailability={() => {
                  setFoundationWorkspace("availability");
                  handleSectionChange("config");
                }}
                onOpenFramework={() => {
                  setFoundationWorkspace("framework");
                  handleSectionChange("config");
                }}
                onOpenConflictReview={openConflictReview}
                conflictReviewReachable={conflictReviewReachable}
                onOpenPlan={() => handleSectionChange("plan")}
              />
            </section>
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
              canToggleCandidateNames={isAdmin}
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
              stage={publicationStage}
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
