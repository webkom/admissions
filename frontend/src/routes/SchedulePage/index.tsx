import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";
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
import OnBehalfAvailabilityEditor from "./OnBehalfAvailabilityEditor";
import FadderbarnPicker, { type Fadderbarn } from "./FadderbarnPicker";
import CommitteePicker from "./CommitteePicker";
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
import CommitteeConflictsModal from "./CommitteeConflictsModal";
import PublicationGate from "./PublicationGate";
import DraftPreview from "./DraftPreview";
import { useAvailabilityEditor } from "./useAvailabilityEditor";
import { useDistributedPlanActions } from "./useDistributedPlanActions";
import { splitScheduleAtPublicationBoundary } from "src/components/Scheduling/Solver/solverSelectors";
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

const SchedulePage: React.FC = () => {
  const { admissionSlug, groupId } = useParams();
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
      <div className="mx-auto w-full max-w-page px-5 pb-20 pt-8 handheld:px-4">
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
      <div className="mx-auto w-full max-w-page px-5 pb-20 pt-8 handheld:px-4">
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
      <div className="mx-auto w-full max-w-page px-5 pb-20 pt-8 handheld:px-4">
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

  const { committee_group_details } = admission.userdata;
  const availableCommittees = committee_group_details;

  if (!groupId) {
    if (availableCommittees.length === 1) {
      return (
        <Navigate
          to={`/${admissionSlug}/schedule/${availableCommittees[0].pk}`}
          replace
        />
      );
    }
    return (
      <CommitteePicker
        admissionSlug={admissionSlug ?? ""}
        admissionTitle={admission.title}
        committees={availableCommittees}
      />
    );
  }

  const resolvedCommittee = committee_group_details.find(
    (committee) => committee.pk === groupId,
  );
  const committeeName = resolvedCommittee?.name ?? admission.title;
  const committeeRole = resolvedCommittee?.role ?? null;
  const canManageSchedule =
    committeeRole === "leader" || committeeRole === "recruiting";
  const canManageInterviewWorkflow = canManageSchedule;

  return (
    <CommonScheduleView
      key={`${admissionSlug}:${groupId}:${sensitiveScopeKey}`}
      admissionTitle={admission.title}
      committeeName={committeeName}
      admissionSlug={admissionSlug ?? ""}
      groupId={groupId}
      isAdmin={canManageSchedule}
      canManageSchedule={canManageSchedule}
      committeeRole={committeeRole}
      canManageInterviewWorkflow={canManageInterviewWorkflow}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  committeeName: string;
  admissionSlug: string;
  groupId: string;
  isAdmin: boolean;
  canManageSchedule: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
  canManageInterviewWorkflow: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = (props) => {
  const { admissionSlug, groupId } = props;
  const {
    data: savedSchedule,
    isError: isSavedScheduleError,
    error: savedScheduleError,
    refetch: refetchSavedSchedule,
  } = useSavedSchedule(admissionSlug, groupId);
  const {
    data: interviewCandidates,
    isError: isCandidatesError,
    error: candidatesError,
    refetch: refetchCandidates,
  } = useInterviewCandidates(admissionSlug, groupId);
  const {
    data: availabilityParticipants,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    error: availabilityError,
    refetch: refetchAvailability,
  } = useInterviewAvailability(admissionSlug, groupId);

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
      <div className="mx-auto w-full max-w-page px-5 py-16 handheld:px-4">
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
      <div className="mx-auto w-full max-w-page px-5 py-16 handheld:px-4">
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
  onRetryLoad: (sources?: ScheduleDataSource[]) => void;
}

const LoadedScheduleView: React.FC<LoadedScheduleViewProps> = ({
  admissionTitle,
  committeeName,
  admissionSlug,
  groupId,
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
  const [conflictsOverviewOpen, setConflictsOverviewOpen] = useState(false);
  // Interview-admin on-behalf editing: which interviewer's availability is
  // open in the editor under the heatmap. Null = closed. Dev-only by design:
  // it exists to drive mock committees while testing locally; the production
  // build never renders the entry point (see the onEditAvailability wiring),
  // so recruiters cannot reach it there.
  const onBehalfEditingEnabled = import.meta.env.DEV;
  const [onBehalfEditTargetId, setOnBehalfEditTargetId] = useState<
    string | null
  >(null);
  const [fadderbarn, setFadderbarn] = useState<Fadderbarn[]>([]);
  // Hydrate once per identity, so a poll cannot overwrite an in-progress edit.
  const hydratedFadderbarnFor = React.useRef<string | null>(null);
  // Declarations ride along on a save only when edited here - sending local
  // state unconditionally let a pre-hydration or stale-tab save wipe them.
  const [fadderbarnDirty, setFadderbarnDirty] = useState(false);
  const editFadderbarn = (next: Fadderbarn[]) => {
    setFadderbarn(next);
    setFadderbarnDirty(true);
  };
  const fadderbarnToSave = fadderbarnDirty ? fadderbarn : undefined;
  const saveAvailabilityWithFadderbarn = async (
    slots: Set<string>,
    discouraged: Set<string>,
  ) => {
    await saveAvailability(slots, fadderbarnToSave, discouraged);
    setFadderbarnDirty(false);
  };
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
  }, [admissionSlug, groupId]);

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
    groupId,
    savedSchedule,
    notify: showToast,
  });
  const availability = useAvailabilityEditor({
    admissionSlug,
    groupId,
    participants: availabilityParticipants,
    notify: showToast,
    knownSlots: configuration.enabledSlots,
    // The schedule and availability queries poll on independent timers, so
    // after a framework change the grid can briefly be built from a stale
    // plan while the save is answered with a 409. Refetch both immediately
    // so the grid rebuilds against the current plan instead of leaving the
    // user to guess that a manual reload is needed.
    onStale: () => onRetryLoad(["schedule", "availability"]),
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
    groupId,
    savedSchedule,
    draftPersistenceReady,
    syntheticInput: participants.syntheticInput,
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
    discouragedSlots: myDiscouragedSlots,
    setDiscouragedSlots: setMyDiscouragedSlots,
    currentParticipant: myAvailabilityParticipant,
    saveAvailability,
    saveConflictReview,
    declareOwnConflicts,
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
    foundationStage,
    publicationStage,
    workflowPhase,
    availabilityReady,
    proposalConflicts,
  } = workflow;
  const {
    realCandidates,
    realInterviewers,
    solverCandidates: candidates,
    solverInterviewers: interviewers,
    syntheticInput,
    developmentTools,
  } = participants;
  // The day strip is the single place the publication cursor moves. On an
  // already-published plan that is a direct extend; on an unpublished one it
  // has to go through the gate's checks first, so the chosen boundary is
  // carried over and the gate opens primed with it.
  const [publishThroughIntent, setPublishThroughIntent] = useState<
    string | null
  >(null);
  const {
    publishSchedule: handlePublishSchedule,
    extendDistributedThrough: handleExtendDistributedThrough,
    unlockSchedule: handleUnlockSchedule,
    planTransition,
    planTransitionError,
    scheduleFieldError,
    reviewRefusalActive,
    setNameVisibility: handleSetNameVisibility,
    replacePanelMember: handleReplacePanelMember,
    updateOutreachTemplates: handleUpdateOutreachTemplates,
    changeInterviewTime: handleChangeInterviewTime,
    swapCandidates: handleSwapCandidates,
    toggleLock: handleToggleLock,
    setBookingSource: handleSetBookingSource,
    clearUnpublishedDraft,
  } = planActions;
  // "Slett utkast": published interviews are a commitment and always
  // survive, so only the tail past the boundary is deletable.
  const draftSplit = useMemo(
    () =>
      splitScheduleAtPublicationBoundary({
        schedule: savedSchedule?.schedule ?? [],
        scheduleDates: dates,
        distributedThrough: savedSchedule?.distributed_through ?? null,
        sessionDuration,
      }),
    [dates, savedSchedule, sessionDuration],
  );
  const handleClearDraft = useCallback(
    () =>
      clearUnpublishedDraft(
        draftSplit.published,
        draftSplit.unpublished.length,
      ),
    [clearUnpublishedDraft, draftSplit],
  );
  const openProposalForEditing = () => {
    setSolverEditRequestKey((key) => key + 1);
    handleSectionChange("solver");
  };
  const openConflictReview = () => {
    setConflictReviewRequestKey((key) => key + 1);
    handleSectionChange("solver");
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
  const totalCommitteeConflicts = useMemo(() => {
    return (availabilityParticipants ?? []).reduce(
      (acc, participant) =>
        acc +
        (participant.conflicts?.length ?? 0) +
        (participant.derived_conflicts?.length ?? 0),
      0,
    );
  }, [availabilityParticipants]);
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
  // Load existing declarations once per identity. Keyed on user_id rather than
  // the object, because the availability payload changes on every poll and a
  // refetch mid-edit must not overwrite what someone is typing.
  React.useEffect(() => {
    const userId = myAvailabilityParticipant?.user_id;
    if (!userId || hydratedFadderbarnFor.current === userId) return;
    hydratedFadderbarnFor.current = userId;
    setFadderbarn(myAvailabilityParticipant?.fadderbarn ?? []);
    setFadderbarnDirty(false);
  }, [myAvailabilityParticipant]);

  const conflictReviewReachable = Boolean(
    savedSchedule?.conflict_review_open && myAvailabilityParticipant,
  );
  const showAdminConflictReviewStage = Boolean(
    conflictReviewReachable && conflictReviewRequestKey > 0,
  );

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
    <div className="mx-auto w-full max-w-page px-5 pb-20 pt-8 handheld:px-4">
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
              "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface-subtle px-4 text-ui font-semibold text-text-primary transition-colors hover:bg-surface-neutral",
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
            onClick={() => onRetryLoad()}
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
        className="rounded-panel border border-border bg-surface-base"
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
            {!hasConfiguredAvailabilityWindows ? (
              <MemberAvailabilityPending />
            ) : (
              <div className="flex flex-col gap-3">
                <TimeScheduler
                  enabledSlots={enabledSlots}
                  selectedSlots={mySelectedSlots}
                  onSlotsChange={setMySelectedSlots}
                  discouragedSlots={myDiscouragedSlots}
                  onDiscouragedChange={setMyDiscouragedSlots}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  chunkSize={chunkSize}
                  chunkBreakMinutes={chunkBreakMinutes}
                  dayStartMinute={dayStartMinute}
                  dayEndMinute={dayEndMinute}
                  onSave={saveAvailabilityWithFadderbarn}
                  extraDirty={fadderbarnDirty}
                  extraSection={
                    <FadderbarnPicker
                      admissionSlug={admissionSlug ?? ""}
                      value={fadderbarn}
                      onChange={editFadderbarn}
                    />
                  }
                  participation={myAvailabilityParticipant?.participation}
                  affectedAssignmentCount={
                    myAvailabilityParticipant?.affected_assignment_count ?? 0
                  }
                  onOptOut={() => setParticipation("not_participating")}
                  onRejoin={() => setParticipation("awaiting_response")}
                />
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
                  discouragedSlots={myDiscouragedSlots}
                  onDiscouragedChange={setMyDiscouragedSlots}
                  dates={dates}
                  sessionDuration={sessionDuration}
                  chunkSize={chunkSize}
                  chunkBreakMinutes={chunkBreakMinutes}
                  dayStartMinute={dayStartMinute}
                  dayEndMinute={dayEndMinute}
                  onSave={saveAvailabilityWithFadderbarn}
                  onSaveSuccess={() => openFoundationWorkspace("coverage")}
                  extraDirty={fadderbarnDirty}
                  extraSection={
                    <FadderbarnPicker
                      admissionSlug={admissionSlug ?? ""}
                      value={fadderbarn}
                      onChange={editFadderbarn}
                    />
                  }
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
                    onEditAvailability={
                      onBehalfEditingEnabled
                        ? (userId) => setOnBehalfEditTargetId(userId)
                        : undefined
                    }
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
                  {onBehalfEditingEnabled && onBehalfEditTargetId && (
                    <OnBehalfAvailabilityEditor
                      key={onBehalfEditTargetId}
                      admissionSlug={admissionSlug ?? ""}
                      groupId={groupId}
                      targetUserId={onBehalfEditTargetId}
                      participants={availabilityParticipants}
                      candidates={interviewCandidates}
                      notify={showToast}
                      enabledSlots={enabledSlots}
                      dates={dates}
                      sessionDuration={sessionDuration}
                      chunkSize={chunkSize}
                      chunkBreakMinutes={chunkBreakMinutes}
                      dayStartMinute={dayStartMinute}
                      dayEndMinute={dayEndMinute}
                      onClose={() => setOnBehalfEditTargetId(null)}
                    />
                  )}
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
                isAdmin={isAdmin}
                onOpenOverview={() => setConflictsOverviewOpen(true)}
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
                currentUserName={currentUserName}
                dates={dates}
                sessionDuration={sessionDuration}
                admissionTitle={admissionTitle}
                admissionSlug={admissionSlug}
                groupId={groupId}
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
                onClearDraft={
                  canManageSchedule && !syntheticInput
                    ? handleClearDraft
                    : undefined
                }
                clearableDraftCount={draftSplit.unpublished.length}
                publishedDraftCount={draftSplit.published.length}
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
                onPublishThrough={
                  canManageSchedule
                    ? (date) => {
                        if (savedSchedule?.is_distributed) {
                          void handleExtendDistributedThrough(date);
                          return;
                        }
                        setPublishThroughIntent(date);
                        handleSectionChange("plan");
                      }
                    : undefined
                }
              />
            </section>
          </div>
        )}

        {activeSection === "plan" &&
          (!isAdmin &&
          myAvailabilityParticipant?.participation === "not_participating" ? (
            <MemberAvailabilityPending
              title="Du deltar ikke i intervjuene"
              description="Du har meldt at du ikke deltar, og har derfor ikke tilgang til intervjuplanen. Kontakt opptaksansvarlig hvis du likevel skal delta."
            />
          ) : !isAdmin &&
            savedSchedule?.conflict_review_open &&
            myAvailabilityParticipant &&
            (myAvailabilityParticipant.proposed_candidate_ids?.length ?? 0) >
              0 &&
            !myAvailabilityParticipant.conflict_review_complete ? (
            <div className="flex flex-col gap-3">
              {/* A member's only pre-publication stake in the plan is their
                  own inhabilitetssjekk - publication waits on it, so it must
                  be reachable here, not only after the plan is published.
                  Names resolve from the member's own row (review_candidates
                  plus decoys); the candidate pool stays admin-only. */}
              <ConflictReviewView
                candidates={interviewCandidates}
                currentParticipant={myAvailabilityParticipant}
                onSaveReview={saveConflictReview}
                showSummary
              />
              <MemberAvailabilityPending
                title="Planen er ikke publisert ennå"
                description="Når opptaksansvarlig har publisert intervjuplanen, finner du dine intervjuer her."
              />
            </div>
          ) : savedSchedule?.is_distributed ? (
            <DistributedPlanView
              admissionSlug={admissionSlug}
              groupId={groupId}
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
              onExtendDistributedThrough={handleExtendDistributedThrough}
              planTransition={planTransition}
              planTransitionError={planTransitionError}
              myConflicts={myAvailabilityParticipant?.conflicts ?? []}
              realCandidates={realCandidates}
              selfDeclareCandidates={interviewCandidates ?? []}
              onDeclareOwnConflict={declareOwnConflicts}
              interviewers={interviewers}
              enabledSlots={enabledSlots}
              onOpenConflictsOverview={() => setConflictsOverviewOpen(true)}
              totalCommitteeConflicts={totalCommitteeConflicts}
              onSwapCandidates={handleSwapCandidates}
              onUpdateOutreachTemplates={handleUpdateOutreachTemplates}
            />
          ) : isAdmin ? (
            <PublicationGate
              savedSchedule={savedSchedule}
              readiness={publicationReadiness}
              proposalConflicts={proposalConflicts}
              stage={publicationStage}
              dates={dates}
              planTransition={planTransition}
              planTransitionError={planTransitionError}
              scheduleFieldError={scheduleFieldError}
              reviewRefusalActive={reviewRefusalActive}
              onOpenDraft={() => handleSectionChange("solver")}
              onOpenOwnReview={openConflictReview}
              onOpenConflictsOverview={() => setConflictsOverviewOpen(true)}
              onPublish={handlePublishSchedule}
              publishThroughIntent={publishThroughIntent}
              onConsumePublishThroughIntent={() =>
                setPublishThroughIntent(null)
              }
              draftPreview={
                savedSchedule?.schedule?.length ? (
                  <DraftPreview
                    savedSchedule={savedSchedule}
                    candidates={realCandidates}
                    interviewers={interviewers}
                    currentUserName={currentUserName}
                    currentUserId={myAvailabilityParticipant?.user_id}
                    enabledSlots={enabledSlots}
                    dates={dates}
                  />
                ) : undefined
              }
            />
          ) : (
            <MemberAvailabilityPending
              title="Planen er ikke publisert ennå"
              description="Når opptaksansvarlig har publisert intervjuplanen, finner du dine intervjuer her."
            />
          ))}
      </main>

      <CommitteeConflictsModal
        isOpen={conflictsOverviewOpen}
        onClose={() => setConflictsOverviewOpen(false)}
        participants={availabilityParticipants ?? []}
        candidates={candidates}
      />

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
