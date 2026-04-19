import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import { useAdmission, useSavedSchedule } from "src/query/hooks";
import {
  Candidate,
  Interviewer,
  SavedSchedule,
} from "../../types";
import TimeScheduler from "src/components/Scheduling/Calendar/Calendar";
import PersonListView from "src/components/Scheduling/PersonList/PersonListView";
import SolverView from "src/components/Scheduling/Solver/SolverView";
import AvailabilityHeatmap from "src/components/Scheduling/Calendar/AvailabilityHeatmap";
import AdminScheduleConfig from "src/components/Scheduling/Calendar/AdminScheduleConfig";
import {
  DEFAULT_MOCK_CANDIDATE_COUNT,
  DEFAULT_MOCK_INTERVIEWER_COUNT,
  createMockCandidates,
  createMockInterviewers,
} from "./mockData";
import {
  addDays,
  dateRangeDates,
  formatDateHeader,
  generateIcs,
  makeSlotKey,
  nextMonday,
  parseSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";

const SchedulePage: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");

  if (!admission) {
    return <div>Loading...</div>;
  }

  const { is_privileged } = admission.userdata;

  return (
    <CommonScheduleView
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={is_privileged}
    />
  );
};

interface CommonScheduleViewProps {
  admissionTitle: string;
  admissionSlug: string;
  isAdmin: boolean;
}

type TabType = "my-availability" | "heatmap" | "config" | "solver" | "plan";

interface TabDefinition {
  key: TabType;
  title: string;
  description: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const CommonScheduleView: React.FC<CommonScheduleViewProps> = ({
  admissionTitle,
  admissionSlug,
  isAdmin,
}) => {
  const { data: savedSchedule } = useSavedSchedule(admissionSlug);
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(() => {
    const slots = new Set<string>();
    const initDates = dateRangeDates(defaultStart, addDays(defaultStart, 4));
    initDates.forEach((date) => {
      for (let hour = 8; hour < 17; hour++) {
        slots.add(makeSlotKey(date, hour * 60));
      }
    });
    return slots;
  });

  const handleDateRangeChange = (start: string, end: string) => {
    const newDates = new Set(dateRangeDates(start, end));
    const cleaned = new Set<string>();
    enabledSlots.forEach((key) => {
      const { date } = parseSlotKey(key);
      if (newDates.has(date)) cleaned.add(key);
    });
    setEnabledSlots(cleaned);
    setStartDate(start);
    setEndDate(end);
  };

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
  const candidates = useMemo<Candidate[]>(
    () => createMockCandidates(candidateCount),
    [candidateCount],
  );
  const interviewers = useMemo<Interviewer[]>(
    () => createMockInterviewers(interviewerCount),
    [interviewerCount],
  );
  const [sessionDuration, setSessionDuration] = useState<number>(60);

  const handleSaveConfig = async () => {
    console.log("Saving config:", {
      startDate,
      endDate,
      slots: Array.from(enabledSlots),
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    alert("Konfigurasjon lagret!");
  };
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
  const hasPendingScaleChanges =
    candidateInput !== String(candidateCount) ||
    interviewerInput !== String(interviewerCount);
  const hasValidScaleInput = isCandidateInputValid && isInterviewerInputValid;

  const handleSaveScale = () => {
    if (!hasValidScaleInput || !hasPendingScaleChanges) return;

    setCandidateCount(parsedCandidateInput);
    setInterviewerCount(parsedInterviewerInput);
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
              {isAdmin ? "Admin" : "Intervjuer"}
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
                Skru opp antall kandidater og intervjuere for å stressteste
                planleggingen.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
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
                  className="w-28 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                  onChange={(event) => setInterviewerInput(event.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={handleSaveScale}
                disabled={!hasValidScaleInput}
                className={cn(
                  "rounded-lg border border-brand bg-brand text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40",
                  "self-end cursor-pointer px-4 py-2 text-ui font-bold",
                  !hasPendingScaleChanges &&
                    "border-brand bg-brand hover:border-brand hover:bg-brand",
                )}
              >
                {hasPendingScaleChanges ? "Lagre testdata" : "Lagret"}
              </button>
            </div>
          </section>
        )}

        <nav className="mb-3 flex flex-wrap gap-1.5 border-b border-border pb-4">
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                title={tab.description}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-ui font-semibold transition-all duration-100",
                  tab.key === activeSection
                    ? "border-brand-border bg-brand-muted text-brand"
                    : "border-transparent bg-transparent text-text-muted hover:border-border hover:bg-surface-neutral hover:text-text-primary",
                )}
              >
                <Icon size={13} />
                {tab.title}
              </button>
            );
          })}
        </nav>

        <main className="flex flex-col gap-3">
          {activeSection === "my-availability" && (
            <TimeScheduler
              enabledSlots={enabledSlots}
              dates={dates}
              sessionDuration={sessionDuration}
              onSave={async (slots) => {
                console.log("Saving availability:", Array.from(slots));
                await new Promise((resolve) => setTimeout(resolve, 500));
                alert("Tilgjengelighet lagret!");
              }}
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
              onDateRangeChange={handleDateRangeChange}
              enabledSlots={enabledSlots}
              onSlotsChange={setEnabledSlots}
              onSave={handleSaveConfig}
              sessionDuration={sessionDuration}
              onSessionDurationChange={setSessionDuration}
              candidateCount={candidateCount}
              interviewerCount={interviewerCount}
            />
          )}

          {activeSection === "plan" && (
            <DistributedPlanView
              savedSchedule={savedSchedule}
              dates={dates}
              isAdmin={isAdmin}
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
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
}) => {
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

  const handleExport = () => {
    const icsContent = generateIcs(
      savedSchedule.schedule,
      dates,
      savedSchedule.session_duration,
      "Intervjuplan",
    );
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuplan.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sorted = [...savedSchedule.schedule].sort((a, b) => a.time - b.time);

  return (
    <div className="rounded-panel border border-border bg-surface-base p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
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
        </div>
        <button
          type="button"
          onClick={handleExport}
          className={cn(
            "rounded-lg border border-brand bg-brand text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40",
            "cursor-pointer px-4 py-2 text-ui font-bold",
          )}
        >
          Eksporter til kalender (.ics)
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                className={cn(
                  "text-label font-bold uppercase tracking-label text-text-subtle",
                  "bg-surface-subtle px-4 py-3 text-left border-b border-border",
                )}
              >
                Tidspunkt
              </th>
              <th
                className={cn(
                  "text-label font-bold uppercase tracking-label text-text-subtle",
                  "bg-surface-subtle px-4 py-3 text-left border-b border-border",
                )}
              >
                Kandidat
              </th>
              <th
                className={cn(
                  "text-label font-bold uppercase tracking-label text-text-subtle",
                  "bg-surface-subtle px-4 py-3 text-left border-b border-border",
                )}
              >
                Panel
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => {
              const dayIndex = Math.floor(item.time / 24);
              const hour = item.time % 24;
              const date = dates[dayIndex];
              const timeLabel = date
                ? `${formatDateHeader(date).weekday} ${formatDateHeader(date).dayMonth} ${hour}:00`
                : `Dag ${dayIndex + 1} ${hour}:00`;
              return (
                <tr key={idx} className="group">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-text-muted group-hover:bg-surface-hover">
                    {timeLabel}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary group-hover:bg-surface-hover">
                    {item.candidate}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary group-hover:bg-surface-hover">
                    <div className="flex flex-wrap gap-1.5">
                      {item.panel.map((p, i) => (
                        <span
                          key={i}
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold",
                            p.is_overtime
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SchedulePage;
