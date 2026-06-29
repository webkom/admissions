import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { isAxiosError } from "axios";
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
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig, {
  ScheduleConfigInput,
} from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import djangoData from "src/utils/djangoData";
import {
  addDays,
  buildLockedAssignments,
  buildSolveBlocks,
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

const CONFLICT_MESSAGE =
  "Planen ble endret av noen andre — last inn siden på nytt.";

const isConflictError = (err: unknown) =>
  isAxiosError(err) && err.response?.status === 409;

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
  const { data: admission } = useAdmission(admissionSlug ?? "");

  if (!admission) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8">
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-2xl border border-border-muted bg-surface-base px-6 py-16"
        >
          <Loader2 size={18} className="animate-spin text-brand" />
          <span className="text-ui font-semibold text-text-muted">Laster…</span>
        </div>
      </div>
    );
  }

  const { is_admin, committee_role } = admission.userdata;
  const canManageSchedule =
    committee_role === "leader" ||
    committee_role === "recruiting" ||
    (is_admin && committee_role !== "member");

  return (
    <CommonScheduleView
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={canManageSchedule}
      committeeRole={committee_role}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  admissionSlug: string;
  isAdmin: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  admissionSlug,
  isAdmin,
  committeeRole,
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
  const { data: interviewCandidates } = useInterviewCandidates(admissionSlug);
  const {
    data: availabilityParticipants,
    isLoading: isAvailabilityLoading,
    isError: isAvailabilityError,
    refetch: refetchAvailability,
  } = useInterviewAvailability(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [activeSection, setActiveSection] = useState<TabType>(
    isAdmin ? "config" : "my-availability",
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
  // Serialized snapshot of the server slots we last applied locally. Used to
  // keep the 10s availability poll from clobbering unsaved selections.
  const lastAppliedServerSlotsRef = useRef<string | null>(null);

  useEffect(() => {
    if (savedSchedule) {
      setStartDate(savedSchedule.start_date);
      setEndDate(inferEndDateFromSchedule(savedSchedule) ?? defaultEnd);
      setDayStartMinute(savedSchedule.day_start_minute);
      setDayEndMinute(savedSchedule.day_end_minute);
      setSessionDuration(savedSchedule.session_duration);
      setChunkSize(savedSchedule.chunk_size);
      setChunkBreakMinutes(savedSchedule.chunk_break_minutes);
      setEnabledSlots(new Set(savedSchedule.enabled_slots));
    }
  }, [savedSchedule]);

  useEffect(() => {
    if (!availabilityParticipants) return;
    const me = availabilityParticipants.find((p) => p.is_me);
    if (!me) return;

    const serverKey = serializeSlots(me.slots);
    if (serverKey === lastAppliedServerSlotsRef.current) return;

    // Only apply incoming server slots when the local selection is untouched
    // since the last apply/save — otherwise the poll would destroy edits.
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
    // Longer messages stay visible longer.
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
      });
      showToast("Rammer lagret.");
    } catch {
      showToast("Kunne ikke lagre rammer.", "error");
    }
  };

  const handleSaveAvailability = async (slots: Set<string>) => {
    try {
      // Only send slots — sending `conflicts` (even empty) trips the backend
      // guard that rejects conflict edits while names are hidden, which would
      // 400 the whole save. Conflicts are saved separately once names show.
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
      });
      lastAppliedServerSlotsRef.current = serializeSlots(slots);
      showToast("Tilgjengelighet lagret.");
    } catch {
      showToast("Kunne ikke lagre tilgjengelighet.", "error");
    }
  };

  const handleSetNameVisibility = async (visibility: NameVisibility) => {
    if (!savedSchedule) return false;
    try {
      await saveSchedule.mutateAsync({
        ...savedSchedule,
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
    // The rerun always operates on the real committee data — mock data must
    // never leak into a saved plan.
    if (realCandidates.length === 0 || realInterviewers.length === 0) {
      showToast(
        "Mangler kandidater eller intervjuere for å kjøre på nytt.",
        "error",
      );
      return false;
    }
    try {
      // Re-solve with the committee's registered conflicts (already folded
      // into each interviewer's `biased` list) while preserving the panel
      // size, solver options and any manually locked rows from the saved plan.
      const planSessionDuration = savedSchedule.session_duration;
      const panelSize =
        savedSchedule.panel_size ??
        (savedSchedule.schedule[0]?.panel.length || 3);
      const blocks = buildSolveBlocks({
        dates,
        dayStartMinute,
        dayEndMinute,
        sessionDuration: planSessionDuration,
        chunkSize,
        chunkBreakMinutes,
      });
      const lockedAssignments = buildLockedAssignments(
        savedSchedule.schedule,
        realCandidates,
        realInterviewers,
      );

      const { data } = await apiClient.post("/solve/", {
        admission_slug: admissionSlug,
        candidates: realCandidates,
        interviewers: realInterviewers,
        panel_size: panelSize,
        all_slots: slotsToSolverAvailability(
          enabledSlots,
          dates,
          planSessionDuration,
        ),
        blocks,
        options: savedSchedule.solver_options ?? { max_solver_seconds: 120 },
        ...(lockedAssignments.length > 0
          ? { locked_assignments: lockedAssignments }
          : {}),
      });

      if (data.status !== "SUCCESS" && data.status !== "PARTIAL") {
        const message =
          data.status === "INFEASIBLE"
            ? "Fant ingen gyldig plan med de registrerte inhabilitetene."
            : data.status === "LOCKED_CONFLICT"
              ? "Låste intervjuer er i konflikt med inhabilitetene."
              : "Solveren brukte for lang tid. Prøv igjen.";
        showToast(message, "error");
        return false;
      }

      await saveSchedule.mutateAsync({
        ...savedSchedule,
        schedule: data.schedule,
        is_distributed: true,
        expected_updated_at: savedSchedule.updated_at,
      });

      const unplaceable: Array<{ candidate: string }> = data.unplaceable ?? [];
      if (data.status === "PARTIAL" && unplaceable.length > 0) {
        const names = unplaceable.map((entry) => entry.candidate).join(", ");
        showToast(
          `Planen ble oppdatert, men ${unplaceable.length} fikk ikke plass: ${names}`,
          "error",
        );
      } else {
        showToast("Planen ble kjørt på nytt med inhabiliteter.");
      }
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
  const myAvailabilitySaved = Boolean(
    myAvailabilityParticipant?.has_submitted || mySelectedSlots.size > 0,
  );

  // A 404 on the saved schedule just means no plan exists yet — not a failure.
  const scheduleLoadFailed =
    isSavedScheduleError && savedScheduleError?.response?.status !== 404;
  const showLoadError = scheduleLoadFailed || isAvailabilityError;
  const handleRetryLoad = () => {
    if (scheduleLoadFailed) refetchSavedSchedule();
    if (isAvailabilityError) refetchAvailability();
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
        // "M" / "F" from LEGO, or "" when unknown — drives same-gender panels.
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

  // Dev-only aid; `import.meta.env.DEV` is inlined so prod strips these branches.
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

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-[300px] flex-1">
          <h1 className="m-0 text-left text-display-md font-semibold tracking-display-tight text-text-primary sm:text-display-lg">
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
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border-muted bg-surface-base px-4 text-sm font-semibold text-text-soft transition-all hover:border-border-quiet hover:bg-surface-subtle hover:text-text-primary"
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
        <details className="group mb-8 overflow-hidden rounded-2xl border border-border-muted bg-surface-base transition-all hover:border-border-quiet">
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
                      className="text-label font-bold uppercase tracking-label text-text-subtle"
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
                      className="text-label font-bold uppercase tracking-label text-text-subtle"
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
        {activeSection === "my-availability" && (
          <>
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
                onSaveSuccess={() => showToast("Tilgjengelighet lagret.")}
              />
            )}
          </>
        )}

        {activeSection === "config" && isAdmin && (
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

        {activeSection === "solver" && isAdmin && (
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
            onNotify={showToast}
          />
        )}

        {activeSection === "plan" && (
          <DistributedPlanView
            savedSchedule={savedSchedule}
            dates={dates}
            isAdmin={isAdmin}
            currentUserName={currentUserName}
            currentUserId={myAvailabilityParticipant?.user_id}
            canToggleCandidateNames={isAdmin}
            onSetNameVisibility={handleSetNameVisibility}
            onReplacePanelMember={handleReplacePanelMember}
            onChangeInterviewTime={handleChangeInterviewTime}
            onToggleLock={handleToggleLock}
            onRerunWithConflicts={handleRerunWithConflicts}
            myConflicts={myAvailabilityParticipant?.conflicts ?? []}
            realCandidates={realCandidates}
            onSaveConflicts={async (ids) => {
              try {
                // Conflict-only update: never send `slots`. The backend leaves
                // omitted fields untouched, so sending the local slot set here
                // would overwrite saved availability with [] whenever it hasn't
                // hydrated yet (participants still loading / no "me" row).
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
