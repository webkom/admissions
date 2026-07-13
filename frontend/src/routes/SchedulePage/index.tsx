import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, LayoutPanelTop, Loader2, RefreshCw } from "lucide-react";
import {
  useAdmission,
  useInterviewCandidates,
  useInterviewAvailability,
  useSaveInterviewAvailability,
  useSavedSchedule,
  useSaveSchedule,
} from "src/query/hooks";
import {
  Candidate,
  Interviewer,
  NameVisibility,
  SavedSchedule,
} from "../../types";
import StatusToast, { StatusToastState } from "src/components/StatusToast";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import {
  CONFLICT_MESSAGE,
  isConflictError,
  pollSolveJob,
  type SolveJob,
} from "src/components/Scheduling/Solver/solverHelpers";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig, {
  ScheduleConfigInput,
} from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import djangoData from "src/utils/djangoData";
import {
  addDays,
  buildLockedAssignments,
  decodeScheduleTime,
  dateRangeDates,
  nextMonday,
  slotsToSolverAvailability,
} from "src/components/Scheduling/scheduleUtils";
import { apiClient } from "src/utils/callApi";
import WizardTour, {
  useWizardTour,
} from "src/components/Scheduling/WizardTour";
import { HelpCircle } from "lucide-react";
import {
  DEFAULT_MOCK_CANDIDATE_COUNT,
  DEFAULT_MOCK_INTERVIEWER_COUNT,
  createMockCandidates,
  createMockInterviewers,
} from "./mockData";
import WorkflowStepper from "./WorkflowStepper";
import MemberAvailabilityPending from "./MemberAvailabilityPending";
import AvailabilityStatusPanel from "./AvailabilityStatusPanel";
import PhaseAdvanceTip from "./PhaseAdvanceTip";
import DistributedPlanView from "./DistributedPlanView";
import type { TabType, WorkflowStepDefinition } from "./types";
import { buildWorkflowSteps } from "./workflowSteps";

const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 18 * 60;
const DEFAULT_SESSION_DURATION = 20;

const serializeSlots = (slots: Iterable<string>) =>
  Array.from(slots).sort().join("\n");

const inferEndDateFromSchedule = (savedSchedule: SavedSchedule) => {
  if (savedSchedule.end_date) return savedSchedule.end_date;
  if (savedSchedule.schedule.length === 0) return null;

  const lastDayOffset = savedSchedule.schedule.reduce(
    (max, item) =>
      Math.max(
        max,
        decodeScheduleTime(item.time, savedSchedule.session_duration).dayIndex,
      ),
    0,
  );

  return addDays(savedSchedule.start_date, lastDayOffset);
};

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const {
    data: admission,
    isError: isAdmissionError,
    refetch: refetchAdmission,
  } = useAdmission(admissionSlug ?? "");

  if (isAdmissionError) {
    return (
      <div className="mx-auto w-full max-w-lego px-4 pb-20 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3">
          <p className="m-0 text-ui font-semibold text-danger">
            Kunne ikke hente opptaket.
          </p>
          <button
            type="button"
            onClick={() => refetchAdmission()}
            className="rounded-lg border border-danger-border bg-surface-base px-3 py-2 text-detail font-bold text-danger"
          >
            Prøv igjen
          </button>
        </div>
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="mx-auto w-full max-w-lego px-4 pb-20 pt-8">
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-panel border border-border bg-surface-base px-6 py-16 shadow-sm"
        >
          <Loader2 size={18} className="animate-spin text-brand" />
          <span className="text-ui font-semibold text-text-muted">Laster…</span>
        </div>
      </div>
    );
  }

  const { is_admin, committee_role } = admission.userdata;
  const canRevealCandidateNames =
    is_admin || committee_role === "leader" || committee_role === "recruiting";

  return (
    <CommonScheduleView
      key={admissionSlug}
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={is_admin}
      committeeRole={committee_role}
      canRevealCandidateNames={canRevealCandidateNames}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  admissionSlug: string;
  isAdmin: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
  canRevealCandidateNames: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  admissionSlug,
  isAdmin,
  committeeRole,
  canRevealCandidateNames,
}) => {
  const roleLabel = (() => {
    if (committeeRole === "leader") return "Leder";
    if (committeeRole === "recruiting") return "Opptaksansvarlig";
    if (committeeRole === "member") return "Medlem";
    return "Intervjuer";
  })();

  const wizard = useWizardTour(isAdmin);

  useEffect(() => {
    wizard.openIfNotDismissed();
  }, []);

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
  const saveSchedule = useSaveSchedule(admissionSlug);
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [activeSection, setActiveSection] = useState<TabType>(
    isAdmin ? "config" : "my-availability",
  );
  const [visitedSections, setVisitedSections] = useState<Set<TabType>>(
    () => new Set([isAdmin ? "config" : "my-availability"]),
  );

  const [useMockData, setUseMockData] = useState(false);
  const [appendMockToReal, setAppendMockToReal] = useState(false);
  const [candidateInput, setCandidateInput] = useState(
    String(DEFAULT_MOCK_CANDIDATE_COUNT),
  );
  const [interviewerInput, setInterviewerInput] = useState(
    String(DEFAULT_MOCK_INTERVIEWER_COUNT),
  );

  const clampMockCount = (raw: string, fallback: number) => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 1 && n <= 200 ? n : fallback;
  };
  const candidateCount = clampMockCount(
    candidateInput,
    DEFAULT_MOCK_CANDIDATE_COUNT,
  );
  const interviewerCount = clampMockCount(
    interviewerInput,
    DEFAULT_MOCK_INTERVIEWER_COUNT,
  );

  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [dayStartMinute, setDayStartMinute] = useState(
    DEFAULT_DAY_START_MINUTE,
  );
  const [dayEndMinute, setDayEndMinute] = useState(DEFAULT_DAY_END_MINUTE);
  const [sessionDuration, setSessionDuration] = useState(
    DEFAULT_SESSION_DURATION,
  );
  const [chunkSize, setChunkSize] = useState(4);
  const [chunkBreakMinutes, setChunkBreakMinutes] = useState(0);
  const [toast, setToast] = useState<StatusToastState | null>(null);

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(new Set());
  const [mySelectedSlots, setMySelectedSlots] = useState<Set<string>>(
    new Set(),
  );
  const lastAppliedScheduleRevisionRef = useRef<string | null>(null);
  const lastAppliedServerSlotsRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !savedSchedule ||
      savedSchedule.updated_at === lastAppliedScheduleRevisionRef.current
    )
      return;

    lastAppliedScheduleRevisionRef.current = savedSchedule.updated_at;
    setStartDate(savedSchedule.start_date);
    setEndDate(inferEndDateFromSchedule(savedSchedule) ?? defaultEnd);
    setDayStartMinute(savedSchedule.day_start_minute);
    setDayEndMinute(savedSchedule.day_end_minute);
    setSessionDuration(savedSchedule.session_duration);
    setChunkSize(savedSchedule.chunk_size);
    setChunkBreakMinutes(savedSchedule.chunk_break_minutes);
    setEnabledSlots(new Set(savedSchedule.enabled_slots));
  }, [defaultEnd, savedSchedule]);

  useEffect(() => {
    if (!availabilityParticipants) return;
    const me = availabilityParticipants.find((p) => p.is_me);
    if (!me) return;

    const serverKey = serializeSlots(me.slots);
    if (serverKey === lastAppliedServerSlotsRef.current) return;

    const localKey = serializeSlots(mySelectedSlots);
    const baselineKey = lastAppliedServerSlotsRef.current ?? "";
    if (localKey !== baselineKey) return;

    setMySelectedSlots(new Set(me.slots));
    lastAppliedServerSlotsRef.current = serverKey;
  }, [availabilityParticipants, mySelectedSlots]);

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

  const handleSaveConfig = async (input: ScheduleConfigInput) => {
    try {
      await saveSchedule.mutateAsync({
        start_date: input.startDate,
        end_date: input.endDate,
        day_start_minute: input.dayStartMinute,
        day_end_minute: input.dayEndMinute,
        session_duration: input.sessionDuration,
        chunk_size: input.chunkSize,
        chunk_break_minutes: input.chunkBreakMinutes,
        enabled_slots: Array.from(input.enabledSlots),
        schedule: savedSchedule?.schedule ?? [],
        ...(savedSchedule
          ? { expected_updated_at: savedSchedule.updated_at }
          : {}),
      });
      showToast("Rammer lagret.");
    } catch {
      showToast("Kunne ikke lagre rammer.", "error");
      throw new Error("Kunne ikke lagre rammer.");
    }
  };

  const handleSaveAvailability = async (slots: Set<string>) => {
    try {
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
      });
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
      showToast("Tilgjengelighet lagret.");
    } catch {
      showToast("Kunne ikke lagre tilgjengelighet.", "error");
      throw new Error("Kunne ikke lagre tilgjengelighet.");
    }
  };

  const handleSetNameVisibility = async (visibility: NameVisibility) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        name_visibility: visibility,
        expected_updated_at: savedSchedule.updated_at,
      });
      showToast("Synlighet oppdatert.");
      return true;
    } catch (err) {
      showToast(
        isConflictError(err)
          ? CONFLICT_MESSAGE
          : "Kunne ikke oppdatere synlighet.",
        "error",
      );
      return false;
    }
  };

  const handleReplacePanelMember = async (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacement: { id?: string; name: string },
  ) => {
    if (!savedSchedule) return false;
    const nextSchedule = [...savedSchedule.schedule];
    const item = { ...nextSchedule[scheduleIndex] };
    const nextPanel = [...item.panel];
    nextPanel[panelMemberIndex] = {
      ...nextPanel[panelMemberIndex],
      id: replacement.id,
      name: replacement.name,
    };
    item.panel = nextPanel;
    item.locked = true;
    nextSchedule[scheduleIndex] = item;

    try {
      await saveSchedule.mutateAsync({
        ...savedSchedule,
        schedule: nextSchedule,
        expected_updated_at: savedSchedule.updated_at,
      });
      showToast("Panelmedlem byttet.");
      return true;
    } catch (err) {
      showToast(
        isConflictError(err)
          ? CONFLICT_MESSAGE
          : "Kunne ikke bytte panelmedlem.",
        "error",
      );
      return false;
    }
  };

  const handleChangeInterviewTime = async (
    scheduleIndex: number,
    nextTime: number,
  ) => {
    if (!savedSchedule) return false;
    const nextSchedule = [...savedSchedule.schedule];
    const item = { ...nextSchedule[scheduleIndex] };
    item.time = nextTime;
    item.locked = true;
    nextSchedule[scheduleIndex] = item;

    try {
      await saveSchedule.mutateAsync({
        ...savedSchedule,
        schedule: nextSchedule,
        expected_updated_at: savedSchedule.updated_at,
      });
      showToast("Tidspunkt endret.");
      return true;
    } catch (err) {
      showToast(
        isConflictError(err) ? CONFLICT_MESSAGE : "Kunne ikke endre tidspunkt.",
        "error",
      );
      return false;
    }
  };

  const handleToggleLock = async (scheduleIndex: number) => {
    if (!savedSchedule) return false;
    const nextSchedule = [...savedSchedule.schedule];
    const item = { ...nextSchedule[scheduleIndex] };
    item.locked = !item.locked;
    nextSchedule[scheduleIndex] = item;

    try {
      await saveSchedule.mutateAsync({
        ...savedSchedule,
        schedule: nextSchedule,
        expected_updated_at: savedSchedule.updated_at,
      });
      showToast(item.locked ? "Raden er låst." : "Raden er låst opp.");
      return true;
    } catch (err) {
      showToast(
        isConflictError(err)
          ? CONFLICT_MESSAGE
          : "Kunne ikke oppdatere låsing.",
        "error",
      );
      return false;
    }
  };

  const handleRerunWithConflicts = async () => {
    if (!savedSchedule) return false;
    if (realCandidates.length === 0 || realInterviewers.length === 0) {
      showToast(
        "Mangler kandidater eller intervjuere for å kjøre på nytt.",
        "error",
      );
      return false;
    }
    try {
      const panelSize =
        savedSchedule.panel_size ??
        (savedSchedule.schedule[0]?.panel.length || 3);
      const lockedAssignments = buildLockedAssignments(
        savedSchedule.schedule,
        realCandidates,
        realInterviewers,
      );

      const { data: created } = await apiClient.post<SolveJob>("/solve/", {
        admission_slug: admissionSlug,
        candidates: realCandidates.map(({ id }) => ({ id })),
        interviewers: realInterviewers.map(({ id }) => ({ id })),
        panel_size: panelSize,
        options: savedSchedule.solver_options ?? { max_solver_seconds: 120 },
        ...(lockedAssignments.length > 0
          ? {
              locked_assignments: lockedAssignments.map((assignment) => ({
                candidate_id: assignment.candidate_id,
                time: assignment.time,
                panel: assignment.panel.map((member) => ({ id: member.id })),
              })),
            }
          : {}),
      });
      const outcome = await pollSolveJob(created);
      if (outcome.kind === "timeout") {
        await apiClient
          .delete(`/solve/${created.job_id}/`)
          .catch(() => undefined);
        showToast("Solveren brukte for lang tid. Prøv igjen.", "error");
        return false;
      }
      if (outcome.kind !== "finished") return false;
      const { job } = outcome;
      if (job.status !== "DONE" || !job.result) {
        showToast(job.error || "Kunne ikke kjøre planen på nytt.", "error");
        return false;
      }
      const result = job.result;

      if (result.status !== "SUCCESS") {
        const message =
          result.status === "PARTIAL"
            ? "Planen ble ikke endret fordi ikke alle kandidater fikk plass."
            : result.status === "INFEASIBLE"
              ? "Fant ingen gyldig plan med de registrerte inhabilitetene."
              : result.status === "LOCKED_CONFLICT"
                ? "Låste intervjuer er i konflikt med inhabilitetene."
                : "Solveren brukte for lang tid. Prøv igjen.";
        showToast(message, "error");
        return false;
      }

      await saveSchedule.mutateAsync({
        ...savedSchedule,
        schedule: result.schedule,
        is_distributed: true,
        expected_updated_at: savedSchedule.updated_at,
      });

      showToast("Planen ble kjørt på nytt med inhabiliteter.");
      return true;
    } catch (err) {
      showToast(
        isConflictError(err)
          ? CONFLICT_MESSAGE
          : "Kunne ikke kjøre planen på nytt.",
        "error",
      );
      return false;
    }
  };

  const hasSavedConfig = Boolean(
    savedSchedule &&
      (savedSchedule.end_date !== null ||
        (savedSchedule.enabled_windows?.length ?? 0) > 0 ||
        savedSchedule.enabled_slots.length > 0),
  );
  const hasConfiguredAvailabilityWindows = Boolean(
    savedSchedule &&
      ((savedSchedule.enabled_windows?.length ?? 0) > 0 ||
        savedSchedule.enabled_slots.length > 0),
  );
  const hasScheduleDraft = Boolean(savedSchedule?.schedule.length);
  const hasDistributedPlan = Boolean(savedSchedule?.is_distributed);
  const submittedParticipants = availabilityParticipants?.filter(
    (participant) => participant.has_submitted,
  );
  const submittedAvailabilityCount = submittedParticipants?.length ?? 0;
  const availabilityParticipantCount = availabilityParticipants?.length ?? 0;
  const myAvailabilityParticipant = availabilityParticipants?.find(
    (participant) => participant.is_me,
  );
  const myAvailabilitySaved = Boolean(myAvailabilityParticipant?.has_submitted);

  const scheduleLoadFailed =
    isSavedScheduleError && savedScheduleError?.response?.status !== 404;
  const showLoadError =
    scheduleLoadFailed || isAvailabilityError || isCandidatesError;
  const handleRetryLoad = () => {
    if (scheduleLoadFailed) refetchSavedSchedule();
    if (isAvailabilityError) refetchAvailability();
    if (isCandidatesError) refetchCandidates();
  };

  const workflowSteps = useMemo<WorkflowStepDefinition[]>(
    () =>
      buildWorkflowSteps({
        isAdmin,
        activeSection,
        hasConfiguredAvailabilityWindows,
        hasDistributedPlan,
        hasSavedConfig,
        hasScheduleDraft,
        myAvailabilitySaved,
        availabilityParticipantCount,
        submittedAvailabilityCount,
      }),
    [
      activeSection,
      availabilityParticipantCount,
      hasConfiguredAvailabilityWindows,
      hasDistributedPlan,
      hasSavedConfig,
      hasScheduleDraft,
      isAdmin,
      myAvailabilitySaved,
      submittedAvailabilityCount,
    ],
  );

  const handleSectionChange = (key: TabType) => {
    setVisitedSections((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setActiveSection(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const realCandidates = useMemo<Candidate[]>(
    () => interviewCandidates ?? [],
    [interviewCandidates],
  );
  const realInterviewers = useMemo<Interviewer[]>(
    () =>
      (availabilityParticipants ?? []).map((p) => ({
        id: p.user_id,
        name: p.full_name,
        gender: p.gender,
        availability: slotsToSolverAvailability(
          new Set(p.slots),
          dates,
          sessionDuration,
        ),
        biased: p.conflicts,
      })),
    [availabilityParticipants, dates, sessionDuration],
  );

  const mockScheduleConfig = useMemo(
    () => ({
      numDays: dates.length,
      dayStartHour: Math.floor(dayStartMinute / 60),
      dayEndHour: Math.floor(dayEndMinute / 60),
      chunkSize,
      sessionDurationMinutes: sessionDuration,
    }),
    [dates.length, dayStartMinute, dayEndMinute, chunkSize, sessionDuration],
  );

  const candidates = useMemo<Candidate[]>(() => {
    if (!import.meta.env.DEV || !useMockData) return realCandidates;
    const mocks = createMockCandidates(candidateCount);
    return appendMockToReal ? [...realCandidates, ...mocks] : mocks;
  }, [useMockData, appendMockToReal, realCandidates, candidateCount]);

  const interviewers = useMemo<Interviewer[]>(() => {
    if (!import.meta.env.DEV || !useMockData) return realInterviewers;
    const mocks = createMockInterviewers(interviewerCount, mockScheduleConfig);
    return appendMockToReal ? [...realInterviewers, ...mocks] : mocks;
  }, [
    useMockData,
    appendMockToReal,
    realInterviewers,
    interviewerCount,
    mockScheduleConfig,
  ]);

  const currentUserName = djangoData.user?.full_name ?? "";
  const accessDenied = [
    savedScheduleError,
    availabilityError,
    candidatesError,
  ].some((error) => [401, 403].includes(error?.response?.status ?? 0));

  if (accessDenied) {
    return (
      <div className="mx-auto w-full max-w-lego px-4 py-16">
        <div
          role="alert"
          className="rounded-xl border border-danger-border bg-danger-bg px-5 py-4 text-ui font-semibold text-danger"
        >
          Tilgangen til intervjuplanleggingen er fjernet. Kandidatdata er tømt
          fra visningen.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lego px-4 pb-20 pt-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-6 border-b border-border-soft pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-left text-display-sm font-semibold text-text-primary">
            {admissionTitle}
          </h1>
          <p className="m-0 mt-1 text-ui text-text-muted">Opptaksprosess</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-detail font-semibold text-text-subtle sm:inline">
            {roleLabel}
          </span>
          <button
            type="button"
            onClick={() => wizard.open()}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface-subtle px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-neutral"
          >
            <HelpCircle size={16} />
            Hjelp
          </button>
        </div>
      </header>

      {showLoadError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-border bg-danger-bg px-4 py-3">
          <p className="m-0 text-ui font-semibold text-danger">
            Kunne ikke hente oppdaterte data for intervjuplanleggingen.
          </p>
          <button
            type="button"
            onClick={handleRetryLoad}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger-border bg-surface-base px-3 text-detail font-bold text-danger transition-colors hover:bg-danger-bg"
          >
            <RefreshCw size={13} />
            Prøv igjen
          </button>
        </div>
      )}

      {isAdmin && import.meta.env.DEV && (
        <details className="group mb-8 overflow-hidden rounded-panel border border-border bg-surface-base shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-bold text-text-muted hover:text-text-primary">
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-surface-subtle text-text-faded group-hover:bg-brand-soft group-hover:text-brand">
                <LayoutPanelTop size={12} />
              </span>
              Testdata
            </div>
            <ChevronDown
              size={16}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-border-faint px-6 py-5">
            <div className="flex flex-wrap items-end gap-6">
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted">
                  <input
                    type="checkbox"
                    checked={useMockData}
                    onChange={(e) => setUseMockData(e.target.checked)}
                    className="h-4 w-4 rounded border-border-muted text-brand focus:ring-brand"
                  />
                  Simuler testdata
                </label>
                {useMockData && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text-muted">
                    <input
                      type="checkbox"
                      checked={appendMockToReal}
                      onChange={(e) => setAppendMockToReal(e.target.checked)}
                      className="h-4 w-4 rounded border-border-muted text-brand focus:ring-brand"
                    />
                    Kombiner med ekte data
                  </label>
                )}
              </div>
              {useMockData && (
                <>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="mock-candidate-count"
                      className="text-detail font-medium text-text-muted"
                    >
                      Antall kandidater
                    </label>
                    <input
                      id="mock-candidate-count"
                      type="number"
                      min="1"
                      max="200"
                      value={candidateInput}
                      onChange={(e) => setCandidateInput(e.target.value)}
                      className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="mock-interviewer-count"
                      className="text-detail font-medium text-text-muted"
                    >
                      Antall intervjuere
                    </label>
                    <input
                      id="mock-interviewer-count"
                      type="number"
                      min="1"
                      max="200"
                      value={interviewerInput}
                      onChange={(e) => setInterviewerInput(e.target.value)}
                      className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </details>
      )}

      <WorkflowStepper
        steps={workflowSteps}
        activeKey={activeSection}
        onChange={handleSectionChange}
      />

      <main className="mt-3 flex flex-col gap-3">
        {visitedSections.has("my-availability") && (
          <div className={activeSection === "my-availability" ? "" : "hidden"}>
            {!isAdmin && !hasConfiguredAvailabilityWindows ? (
              <MemberAvailabilityPending />
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
                onSave={handleSaveAvailability}
              />
            )}
          </div>
        )}

        {isAdmin && visitedSections.has("config") && (
          <div className={activeSection === "config" ? "" : "hidden"}>
            <AdminScheduleConfig
              startDate={startDate}
              endDate={endDate}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              sessionDuration={sessionDuration}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              enabledSlots={enabledSlots}
              enabledWindows={savedSchedule?.enabled_windows ?? []}
              hasScheduleDraft={hasScheduleDraft}
              onSave={handleSaveConfig}
            />
          </div>
        )}

        {activeSection === "heatmap" && isAdmin && (
          <>
            <AvailabilityHeatmap
              dates={dates}
              interviewers={interviewers}
              availableSlots={enabledSlots}
              sessionDuration={sessionDuration}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
            />
            <AvailabilityStatusPanel
              participants={availabilityParticipants ?? []}
              isLoading={isAvailabilityLoading}
            />
          </>
        )}

        {isAdmin && visitedSections.has("solver") && (
          <div className={activeSection === "solver" ? undefined : "hidden"}>
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
              syntheticInput={import.meta.env.DEV && useMockData}
              onNotify={showToast}
            />
          </div>
        )}

        {activeSection === "plan" && (
          <DistributedPlanView
            savedSchedule={savedSchedule}
            dates={dates}
            isAdmin={isAdmin}
            currentUserName={currentUserName}
            currentUserId={myAvailabilityParticipant?.user_id}
            canToggleCandidateNames={canRevealCandidateNames}
            onSetNameVisibility={handleSetNameVisibility}
            onReplacePanelMember={handleReplacePanelMember}
            onChangeInterviewTime={handleChangeInterviewTime}
            onToggleLock={handleToggleLock}
            onRerunWithConflicts={handleRerunWithConflicts}
            myConflicts={myAvailabilityParticipant?.conflicts ?? []}
            realCandidates={realCandidates}
            onSaveConflicts={async (ids) => {
              try {
                await saveInterviewAvailability.mutateAsync({
                  conflicts: ids,
                });
              } catch {
                showToast("Kunne ikke lagre inhabilitet.", "error");
              }
            }}
            interviewers={interviewers}
            enabledSlots={enabledSlots}
          />
        )}

        <PhaseAdvanceTip
          steps={workflowSteps}
          activeKey={activeSection}
          onAdvance={handleSectionChange}
        />
      </main>

      <WizardTour
        isOpen={wizard.isOpen}
        onClose={wizard.close}
        isAdmin={isAdmin}
      />

      <StatusToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default SchedulePage;
