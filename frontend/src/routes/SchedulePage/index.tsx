import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart3,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import { TabNav, type TabNavItem } from "src/components/Scheduling/ui";
import {
  useAdminApplications,
  useAdmission,
  useSavedSchedule,
  useSaveSchedule,
} from "src/query/hooks";
import {
  Candidate,
  Interviewer,
  SavedSchedule,
} from "../../types";
import StatusToast, { StatusToastState } from "src/components/StatusToast";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import PersonListView from "src/components/Scheduling/PersonList/PersonListView";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig, {
  ScheduleConfigInput,
} from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import {
  DEFAULT_MOCK_CANDIDATE_COUNT,
  DEFAULT_MOCK_INTERVIEWER_COUNT,
  createMockCandidates,
  createMockInterviewers,
  mergeAvailability,
  type ScheduleConfig,
} from "./mockData";
import djangoData, { isLoggedIn } from "src/utils/djangoData";
import {
  addDays,
  dateRangeDates,
  formatDateHeader,
  generateIcs,
  makeSlotKey,
  nextMonday,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";

const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 18 * 60;
const DEFAULT_SESSION_DURATION = 60;

const slotsToSolverAvailability = (slots: Set<string>, dates: string[]): number[] => {
  const availability = new Set<number>();
  slots.forEach((key) => {
    const colonIdx = key.indexOf(":");
    const date = key.slice(0, colonIdx);
    const minute = Number(key.slice(colonIdx + 1));
    const dayIndex = dates.indexOf(date);
    if (dayIndex === -1) return;
    availability.add(dayIndex * 24 + Math.floor(minute / 60));
  });
  return Array.from(availability).sort((a, b) => a - b);
};

const buildEnabledSlots = (
  start: string,
  end: string,
  dayStartMinute = DEFAULT_DAY_START_MINUTE,
  dayEndMinute = DEFAULT_DAY_END_MINUTE,
  sessionDuration = DEFAULT_SESSION_DURATION,
) => {
  const slots = new Set<string>();
  const step = sessionDuration > 0 ? sessionDuration : DEFAULT_SESSION_DURATION;

  dateRangeDates(start, end).forEach((date) => {
    for (let minute = dayStartMinute; minute < dayEndMinute; minute += step) {
      slots.add(makeSlotKey(date, minute));
    }
  });

  return slots;
};

const inferEndDateFromSchedule = (savedSchedule: SavedSchedule) => {
  if (savedSchedule.end_date) return savedSchedule.end_date;
  if (savedSchedule.schedule.length === 0) return null;

  const lastDayOffset = savedSchedule.schedule.reduce(
    (max, item) => Math.max(max, Math.floor(item.time / 24)),
    0,
  );

  return addDays(savedSchedule.start_date, lastDayOffset);
};

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");

  if (!admission) {
    return <div>Loading...</div>;
  }

  const { is_recruiter, is_admin, committee_role } = admission.userdata;

  return (
    <CommonScheduleView
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={is_recruiter}
      isAdmissionAdmin={is_admin}
      committeeRole={committee_role}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  admissionSlug: string;
  isAdmin: boolean;
  isAdmissionAdmin: boolean;
  committeeRole: "leader" | "recruiting" | "member" | null;
}

type TabType = "my-availability" | "heatmap" | "config" | "solver" | "plan";

type TabDefinition = TabNavItem<TabType> & { adminOnly?: boolean };

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  admissionSlug,
  isAdmin,
  isAdmissionAdmin,
  committeeRole,
}) => {
  const roleLabel = (() => {
    if (committeeRole === "leader") return "Leder";
    if (committeeRole === "recruiting") return "Opptaksansvarlig";
    if (isAdmissionAdmin) return "Admin";
    if (committeeRole === "member") return "Medlem";
    return "Intervjuer";
  })();
  const { data: savedSchedule } = useSavedSchedule(admissionSlug);
  const { data: adminApplications } = useAdminApplications(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const [useMockData, setUseMockData] = useState(true);
  const [appendMockToReal, setAppendMockToReal] = useState(true);

  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [dayStartMinute, setDayStartMinute] = useState(DEFAULT_DAY_START_MINUTE);
  const [dayEndMinute, setDayEndMinute] = useState(DEFAULT_DAY_END_MINUTE);
  const [chunkSize, setChunkSize] = useState(4);
  const [chunkBreakMinutes, setChunkBreakMinutes] = useState(0);
  const [toast, setToast] = useState<StatusToastState | null>(null);

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(() =>
    buildEnabledSlots(defaultStart, defaultEnd),
  );

  const [candidateCount, setCandidateCount] = useState(
    DEFAULT_MOCK_CANDIDATE_COUNT,
  );
  const [interviewerCount, setInterviewerCount] = useState(
    DEFAULT_MOCK_INTERVIEWER_COUNT,
  );
  const [candidateInput, setCandidateInput] = useState(
    String(DEFAULT_MOCK_CANDIDATE_COUNT),
  );
  const [interviewerInput, setInterviewerInput] = useState(
    String(DEFAULT_MOCK_INTERVIEWER_COUNT),
  );

  const parsedCandidateInput = Number(candidateInput);
  const parsedInterviewerInput = Number(interviewerInput);
  const isCandidateInputValid =
    Number.isInteger(parsedCandidateInput) &&
    parsedCandidateInput >= 1 &&
    parsedCandidateInput <= 200;
  const isInterviewerInputValid =
    Number.isInteger(parsedInterviewerInput) &&
    parsedInterviewerInput >= 1 &&
    parsedInterviewerInput <= 200;

  const effectiveCandidateCount =
    useMockData && isCandidateInputValid ? parsedCandidateInput : candidateCount;
  const effectiveInterviewerCount =
    useMockData && isInterviewerInputValid
      ? parsedInterviewerInput
      : interviewerCount;

  useEffect(() => {
    if (!useMockData || !isCandidateInputValid) return;
    if (candidateCount !== parsedCandidateInput) {
      setCandidateCount(parsedCandidateInput);
    }
  }, [useMockData, isCandidateInputValid, parsedCandidateInput, candidateCount]);

  useEffect(() => {
    if (!useMockData || !isInterviewerInputValid) return;
    if (interviewerCount !== parsedInterviewerInput) {
      setInterviewerCount(parsedInterviewerInput);
    }
  }, [
    useMockData,
    isInterviewerInputValid,
    parsedInterviewerInput,
    interviewerCount,
  ]);

  const mockCandidates = useMemo<Candidate[]>(
    () => createMockCandidates(effectiveCandidateCount),
    [effectiveCandidateCount],
  );

  const realCandidates = useMemo<Candidate[]>(
    () =>
      (adminApplications ?? []).map((application) => ({
        id: `real-candidate-${application.user.username}`,
        name: application.user.full_name,
        // Unknown genders should not trigger the same-gender hard constraint.
        gender: "",
      })),
    [adminApplications],
  );

  const candidates = useMemo<Candidate[]>(() => {
    if (!useMockData) return realCandidates;
    if (!appendMockToReal) return mockCandidates;
    return [...realCandidates, ...mockCandidates];
  }, [useMockData, appendMockToReal, realCandidates, mockCandidates]);

  const currentUserName = djangoData.user.full_name ?? "Meg";

  const [sessionDuration, setSessionDuration] = useState<number>(
    DEFAULT_SESSION_DURATION,
  );

  const availabilityStorageKey = useMemo(
    () => `admissions.availability.${admissionSlug}`,
    [admissionSlug],
  );

  const [mySelectedSlots, setMySelectedSlots] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(
        `admissions.availability.${admissionSlug}`,
      );
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(availabilityStorageKey);
      setMySelectedSlots(
        raw && Array.isArray(JSON.parse(raw))
          ? new Set(JSON.parse(raw))
          : new Set(),
      );
    } catch {
      setMySelectedSlots(new Set());
    }
  }, [availabilityStorageKey]);

  const interviewers = useMemo<Interviewer[]>(() => {
    const scheduleConfig: ScheduleConfig = {
      numDays: dates.length,
      dayStartHour: Math.floor(dayStartMinute / 60),
      dayEndHour: Math.floor(dayEndMinute / 60),
      chunkSize,
    };

    const myAvailability = slotsToSolverAvailability(mySelectedSlots, dates);
    const realInterviewers: Interviewer[] = isLoggedIn()
      ? [
          {
            id: "current-user",
            name: currentUserName,
            gender: "M",
            availability: myAvailability,
          },
        ]
      : [];

    const mocks = createMockInterviewers(effectiveInterviewerCount, scheduleConfig);

    if (!useMockData) {
      return realInterviewers;
    }

    if (!appendMockToReal || realInterviewers.length === 0) {
      return mocks;
    }

    const seededAvailability = mocks[0]?.availability ?? [];
    const mergedCurrentUser: Interviewer = {
      ...realInterviewers[0],
      availability:
        realInterviewers[0].availability.length > 0
          ? mergeAvailability(realInterviewers[0].availability, seededAvailability)
          : seededAvailability,
    };

    if (mocks.length === 0) {
      return [mergedCurrentUser];
    }

    return [mergedCurrentUser, ...mocks.slice(1)];
  }, [
    effectiveInterviewerCount,
    dates,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    mySelectedSlots,
    currentUserName,
    useMockData,
    appendMockToReal,
  ]);

  const showToast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      setToast({ id: Date.now(), message, tone });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;

    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!savedSchedule) return;

    setStartDate(savedSchedule.start_date);
    setSessionDuration(savedSchedule.session_duration);

    const inferredEndDate = inferEndDateFromSchedule(savedSchedule);
    if (inferredEndDate) {
      setEndDate(inferredEndDate);
    }

    const hasSavedConfig =
      savedSchedule.end_date !== null || savedSchedule.enabled_slots.length > 0;

    if (!hasSavedConfig) return;

    setEndDate(savedSchedule.end_date ?? savedSchedule.start_date);
    setDayStartMinute(savedSchedule.day_start_minute);
    setDayEndMinute(savedSchedule.day_end_minute);
    setChunkSize(savedSchedule.chunk_size);
    setChunkBreakMinutes(savedSchedule.chunk_break_minutes);
    setEnabledSlots(new Set(savedSchedule.enabled_slots));
  }, [savedSchedule]);

  const handleSaveAvailability = async (slots: Set<string>) => {
    try {
      window.localStorage.setItem(
        availabilityStorageKey,
        JSON.stringify(Array.from(slots)),
      );
    } catch {
      showToast("Kunne ikke lagre tilgjengeligheten.", "error");
      throw new Error("Failed to persist availability");
    }
  };

  const handleSaveConfig = async (config: ScheduleConfigInput) => {
    try {
      await saveSchedule.mutateAsync({
        schedule: savedSchedule?.schedule ?? [],
        start_date: config.startDate,
        end_date: config.endDate,
        session_duration: config.sessionDuration,
        enabled_slots: config.enabledSlots,
        day_start_minute: config.dayStartMinute,
        day_end_minute: config.dayEndMinute,
        chunk_size: config.chunkSize,
        chunk_break_minutes: config.chunkBreakMinutes,
        is_distributed: savedSchedule?.is_distributed ?? false,
        show_candidate_names: savedSchedule?.show_candidate_names ?? false,
      });
      setStartDate(config.startDate);
      setEndDate(config.endDate);
      setDayStartMinute(config.dayStartMinute);
      setDayEndMinute(config.dayEndMinute);
      setChunkSize(config.chunkSize);
      setChunkBreakMinutes(config.chunkBreakMinutes);
      setSessionDuration(config.sessionDuration);
      setEnabledSlots(new Set(config.enabledSlots));
      showToast("Konfigurasjon lagret.");
    } catch {
      showToast("Kunne ikke lagre konfigurasjonen.", "error");
      // Keep UI responsive even if backend save fails.
      return;
    }
  };

  const hasPendingScaleChanges =
    candidateInput !== String(candidateCount) ||
    interviewerInput !== String(interviewerCount);
  const hasValidScaleInput = isCandidateInputValid && isInterviewerInputValid;

  const handleSaveScale = () => {
    // No-op: scale is now applied live.
  };

  const tabDefinitions = useMemo<TabDefinition[]>(() => {
    const tabs: TabDefinition[] = [
      {
        key: "plan",
        title: "Intervjuplan",
        description: "Se den distribuerte intervjuplanen.",
        icon: CalendarCheck,
      },
      {
        key: "config",
        title: "Rammer",
        description: "Sett hvilke slotter og hvilken varighet som gjelder.",
        icon: LayoutPanelTop,
        adminOnly: true,
      },
      {
        key: "my-availability",
        title: "Min tilgjengelighet",
        description: "Marker når du faktisk kan sitte i intervju.",
        icon: CalendarRange,
      },
      {
        key: "heatmap",
        title: "Fordeling",
        description: "Se dekning og kandidatlisten i samme arbeidsflate.",
        icon: BarChart3,
        adminOnly: true,
      },
      {
        key: "solver",
        title: "Intervjuforslag",
        description: "Generer et forslag når datagrunnlaget er klart.",
        icon: Sparkles,
        adminOnly: true,
      },
    ];

    return tabs.filter((tab) => !tab.adminOnly || isAdmin);
  }, [isAdmin]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-surface-page">
      <StatusToast toast={toast} />
      <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-8 handheld:px-4 handheld:pb-8 handheld:pt-5">
        <header className="mb-6">
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[clamp(1.5rem,3.5vw,2rem)] font-bold leading-tight tracking-tight text-text-primary">
              {admissionTitle}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tracking-badge",
                isAdmin
                  ? "border-brand-strongBorder bg-brand-tint text-brand"
                  : "border-border bg-surface-neutral text-text-muted",
              )}
            >
              {roleLabel}
            </span>
          </div>
        </header>

        {isAdmin && (
          <section
            className={cn(
              "rounded-panel border border-border bg-surface-base",
              "mb-3 flex flex-wrap items-start justify-between gap-4 px-5 py-4",
            )}
          >
            <div className="flex min-w-[220px] flex-col gap-1">
              <h2 className="m-0 text-sm font-bold text-text-primary">Testdata</h2>
              <p className="m-0 text-ui leading-6 text-text-muted">
                Skru på mockdata for å simulere større opptak, og velg om den
                skal legges oppa reelle data.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 self-end rounded-md border border-border-soft bg-surface-muted px-3 py-2 text-ui font-semibold text-text-primary">
                <input
                  type="checkbox"
                  checked={useMockData}
                  onChange={(event) => setUseMockData(event.target.checked)}
                />
                Bruk mockdata
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 self-end rounded-md border border-border-soft bg-surface-muted px-3 py-2 text-ui font-semibold text-text-primary",
                  !useMockData && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={appendMockToReal}
                  disabled={!useMockData}
                  onChange={(event) => setAppendMockToReal(event.target.checked)}
                />
                Legg mockdata til reelle data
              </label>

              <div className="flex flex-col gap-1">
                <label
                  className="text-label font-bold uppercase tracking-label text-text-subtle"
                  htmlFor="candidate-count"
                >
                  Kandidater
                </label>
                <input
                  id="candidate-count"
                  type="number"
                  min="1"
                  max="200"
                  value={candidateInput}
                  disabled={!useMockData}
                  className="w-28 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                  onChange={(event) => setCandidateInput(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  className="text-label font-bold uppercase tracking-label text-text-subtle"
                  htmlFor="interviewer-count"
                >
                  Intervjuere
                </label>
                <input
                  id="interviewer-count"
                  type="number"
                  min="1"
                  max="200"
                  value={interviewerInput}
                  disabled={!useMockData}
                  className="w-28 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                  onChange={(event) => setInterviewerInput(event.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={handleSaveScale}
                disabled={!useMockData || !hasValidScaleInput}
                className={cn(
                  "rounded-lg border border-brand bg-brand text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40",
                  "self-end cursor-pointer px-4 py-2 text-ui font-bold",
                  !hasPendingScaleChanges &&
                    "border-brand bg-brand hover:border-brand hover:bg-brand",
                )}
              >
                {!useMockData
                  ? "Mock av"
                  : hasPendingScaleChanges
                    ? "Lagre testdata"
                    : "Lagret"}
              </button>
            </div>
          </section>
        )}

        <TabNav
          tabs={tabDefinitions}
          activeKey={activeSection}
          onChange={setActiveSection}
          className="mb-3"
        />

        <main className="flex flex-col gap-3">
          {activeSection === "my-availability" && (
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

          {activeSection === "heatmap" && (
            <>
              <AvailabilityHeatmap
                interviewers={interviewers}
                availableSlots={enabledSlots}
                dates={dates}
                sessionDuration={sessionDuration}
              />

              <section className="rounded-panel border border-border bg-surface-base p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="m-0 text-sm font-bold text-text-primary">
                    Kandidater
                  </h3>
                  <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                    {candidates.length}
                  </span>
                </div>
                <PersonListView data={candidates} />
              </section>
            </>
          )}

          {activeSection === "config" && isAdmin && (
            <AdminScheduleConfig
              startDate={startDate}
              endDate={endDate}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              enabledSlots={enabledSlots}
              onSave={handleSaveConfig}
              sessionDuration={sessionDuration}
              candidateCount={candidateCount}
              interviewerCount={interviewerCount}
            />
          )}

          {activeSection === "plan" && (
            <DistributedPlanView
              savedSchedule={savedSchedule}
              dates={dates}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
            />
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
              enabledSlots={enabledSlots}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              onNotify={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
};

interface DistributedPlanViewProps {
  savedSchedule: SavedSchedule | undefined;
  dates: string[];
  isAdmin: boolean;
  currentUserName: string;
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
  currentUserName,
}) => {
  const [myInterviewsOnly, setMyInterviewsOnly] = useState(false);

  if (!savedSchedule) {
    return (
      <div className="rounded-panel border border-border bg-surface-base px-6 py-12 text-center">
        <h3 className="mb-2 mt-0 text-sm font-bold text-text-primary">
          Ingen plan distribuert ennå
        </h3>
        <p className="m-0 text-ui leading-relaxed text-text-muted">
          {isAdmin
            ? 'Gå til "Intervjuforslag" for å generere og distribuere en intervjuplan.'
            : "Admins har ikke distribuert en intervjuplan ennå. Kom tilbake senere."}
        </p>
      </div>
    );
  }

  const namesVisible = isAdmin || savedSchedule.show_candidate_names;
  const sorted = [...savedSchedule.schedule].sort((a, b) => a.time - b.time);
  const myInterviews = sorted.filter((item) =>
    item.panel.some((p) => p.name === currentUserName),
  );
  const displaySorted = myInterviewsOnly ? myInterviews : sorted;

  const formatTimeLabel = (timeValue: number) => {
    const dayIndex = Math.floor(timeValue / 24);
    const hour = timeValue % 24;
    const date = dates[dayIndex];
    return date
      ? `${formatDateHeader(date).weekday} ${formatDateHeader(date).dayMonth} ${hour}:00`
      : `Dag ${dayIndex + 1} ${hour}:00`;
  };

  const handleExportIcs = () => {
    const schedule = myInterviewsOnly ? myInterviews : savedSchedule.schedule;
    const icsContent = generateIcs(
      schedule,
      dates,
      savedSchedule.session_duration,
      "Intervjuplan",
    );
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = myInterviewsOnly ? "mine-intervjuer.ics" : "intervjuplan.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const rows: string[][] = [["Tidspunkt", "Kandidat", "Panel"]];
    displaySorted.forEach((item) => {
      rows.push([
        formatTimeLabel(item.time),
        namesVisible ? item.candidate : "—",
        item.panel.map((p) => p.name).join("; "),
      ]);
    });
    const csv = rows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuplan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const thClass =
    "bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle border-b border-border";

  return (
    <div className="rounded-panel border border-border bg-surface-base p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="m-0 text-sm font-bold text-text-primary">Intervjuplan</h3>
          {savedSchedule.is_distributed ? (
            <span className="inline-flex items-center rounded-full border border-success-border bg-success-bg px-2.5 py-1 text-label font-bold uppercase tracking-caps text-success">
              Distribuert
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-1 text-label font-bold uppercase tracking-caps text-text-muted">
              Utkast
            </span>
          )}
          {myInterviewsOnly && myInterviews.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-brand-border bg-brand-muted px-2.5 py-1 text-label font-bold uppercase tracking-caps text-brand">
              {myInterviews.length} intervjuer
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMyInterviewsOnly((v) => !v)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-ui font-semibold transition-all duration-100",
              myInterviewsOnly
                ? "border-brand-border bg-brand-muted text-brand"
                : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-surface-neutral hover:text-text-primary",
            )}
          >
            Mine intervjuer
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleExportCsv}
              title="Kan importeres til Google Regneark via Fil → Importer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-muted bg-surface-base px-4 py-2 text-ui font-semibold text-text-soft transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle"
            >
              Eksporter CSV
            </button>
          )}

          <button
            type="button"
            onClick={handleExportIcs}
            className="cursor-pointer rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed"
          >
            {myInterviewsOnly ? "Eksporter mine (.ics)" : "Eksporter (.ics)"}
          </button>
        </div>
      </div>

      {myInterviewsOnly && myInterviews.length === 0 && (
        <div className="mb-4 rounded-lg border border-border-soft bg-surface-muted px-4 py-3 text-ui text-text-muted">
          Ingen intervjuer funnet for <strong>{currentUserName}</strong>. Filteret matcher på navn — du må ha vært med i solveren for at intervjuene skal dukke opp.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={thClass}>Tidspunkt</th>
              <th className={thClass}>Kandidat</th>
              <th className={thClass}>Panel</th>
            </tr>
          </thead>
          <tbody>
            {displaySorted.map((item, idx) => (
              <tr
                key={idx}
                className={cn(
                  "group",
                  item.panel.some((p) => p.name === currentUserName) &&
                    !myInterviewsOnly &&
                    "bg-brand-subtle/30",
                )}
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-muted group-hover:bg-surface-hover">
                  {formatTimeLabel(item.time)}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-text-primary group-hover:bg-surface-hover">
                  {namesVisible ? item.candidate : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary group-hover:bg-surface-hover">
                  <div className="flex flex-wrap gap-1.5">
                    {item.panel.map((p, i) => (
                      <span
                        key={i}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold",
                          p.name === currentUserName
                            ? "border-brand-strongBorder bg-brand-tint font-bold text-brand"
                            : p.is_overtime
                              ? "border-brand-panelBorder bg-brand-badge text-brand"
                              : "border-border bg-surface-neutral text-text-soft",
                        )}
                      >
                        {p.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SchedulePage;
