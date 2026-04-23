import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  BarChart3,
  CalendarRange,
  ChevronDown,
  LayoutPanelTop,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import {
  TabNav,
  type TabNavItem,
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  Chip,
  actionButtonBase,
  actionButtonPrimary,
  actionButtonNeutral,
  actionButtonActive,
} from "src/components/Scheduling/ui";
import {
  useAdmission,
  useInterviewCandidates,
  useInterviewAvailability,
  useSaveInterviewAvailability,
  useSavedSchedule,
  useSaveSchedule,
} from "src/query/hooks";
import { Candidate, Interviewer, SavedSchedule } from "../../types";
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
} from "./mockData";
import djangoData from "src/utils/djangoData";
import {
  addDays,
  decodeScheduleTime,
  encodeScheduleTime,
  dateRangeDates,
  formatDateHeader,
  generateIcs,
  makeSlotKey,
  nextMonday,
  parseSlotKey,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";
import WizardTour, { useWizardTour } from "src/components/Scheduling/WizardTour";
import { HelpCircle } from "lucide-react";

const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 18 * 60;
const DEFAULT_SESSION_DURATION = 60;

const slotsToSolverAvailability = (
  slots: Set<string>,
  dates: string[],
  sessionDuration: number,
): number[] => {
  const availability = new Set<number>();
  slots.forEach((key) => {
    const { date, minute } = parseSlotKey(key);
    if (!Number.isFinite(minute)) return;
    const dayIndex = dates.indexOf(date);
    if (dayIndex === -1) return;
    availability.add(encodeScheduleTime(dayIndex, minute, sessionDuration));
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
    return <div>Loading...</div>;
  }

  const { is_recruiter, committee_role } = admission.userdata;

  return (
    <CommonScheduleView
      admissionTitle={admission.title}
      admissionSlug={admissionSlug ?? ""}
      isAdmin={is_recruiter}
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

type TabType = "my-availability" | "heatmap" | "config" | "solver" | "plan";

type TabDefinition = TabNavItem<TabType> & { adminOnly?: boolean };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: savedSchedule } = useSavedSchedule(admissionSlug);
  const { data: interviewCandidates } = useInterviewCandidates(admissionSlug);
  const { data: availabilityParticipants } =
    useInterviewAvailability(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [activeSection, setActiveSection] =
    useState<TabType>("my-availability");

  const [useMockData, setUseMockData] = useState(true);
  const [appendMockToReal, setAppendMockToReal] = useState(true);

  const defaultStart = useMemo(() => nextMonday(), []);
  const defaultEnd = useMemo(() => addDays(defaultStart, 4), [defaultStart]);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [dayStartMinute, setDayStartMinute] = useState(
    DEFAULT_DAY_START_MINUTE,
  );
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
    useMockData && isCandidateInputValid
      ? parsedCandidateInput
      : candidateCount;
  const effectiveInterviewerCount =
    useMockData && isInterviewerInputValid
      ? parsedInterviewerInput
      : interviewerCount;

  useEffect(() => {
    if (!useMockData || !isCandidateInputValid) return;
    if (candidateCount !== parsedCandidateInput) {
      setCandidateCount(parsedCandidateInput);
    }
  }, [
    useMockData,
    isCandidateInputValid,
    parsedCandidateInput,
    candidateCount,
  ]);

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
    () => interviewCandidates ?? [],
    [interviewCandidates],
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
  const conflictStorageKey = useMemo(
    () => `admissions.conflicts.${admissionSlug}`,
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
  const [myConflicts, setMyConflicts] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(
        `admissions.conflicts.${admissionSlug}`,
      );
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(conflictStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setMyConflicts(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMyConflicts([]);
    }
  }, [conflictStorageKey]);

  useEffect(() => {
    const mine = availabilityParticipants?.find(
      (participant) => participant.is_me,
    );
    if (!mine) return;
    setMySelectedSlots(new Set(mine.slots));
    setMyConflicts(mine.conflicts ?? []);
  }, [availabilityParticipants]);

  const interviewers = useMemo<Interviewer[]>(() => {
    const scheduleConfigBase = {
      numDays: dates.length,
      dayStartHour: Math.floor(dayStartMinute / 60),
      dayEndHour: Math.floor(dayEndMinute / 60),
      chunkSize,
      sessionDurationMinutes: sessionDuration,
    };
    const scheduleConfig = scheduleConfigBase as Parameters<
      typeof createMockInterviewers
    >[1];

    const realInterviewers: Interviewer[] = (
      availabilityParticipants ?? []
    ).map((participant) => ({
      id: participant.username,
      name: participant.full_name,
      gender: "M",
      availability: slotsToSolverAvailability(
        new Set(participant.slots),
        dates,
        sessionDuration,
      ),
      biased: participant.conflicts ?? [],
    }));

    const mocks = createMockInterviewers(
      effectiveInterviewerCount,
      scheduleConfig,
    );

    if (!useMockData) {
      return realInterviewers;
    }

    if (!appendMockToReal) {
      return mocks;
    }

    return [...realInterviewers, ...mocks];
  }, [
    effectiveInterviewerCount,
    dates,
    dayStartMinute,
    dayEndMinute,
    chunkSize,
    availabilityParticipants,
    sessionDuration,
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
      window.localStorage.setItem(
        conflictStorageKey,
        JSON.stringify(myConflicts),
      );
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
        conflicts: myConflicts,
      });
    } catch {
      showToast("Kunne ikke lagre tilgjengeligheten.", "error");
      throw new Error("Failed to persist availability");
    }
  };

  const handleSaveConflicts = async (conflicts: string[]) => {
    try {
      window.localStorage.setItem(
        availabilityStorageKey,
        JSON.stringify(Array.from(mySelectedSlots)),
      );
      window.localStorage.setItem(
        conflictStorageKey,
        JSON.stringify(conflicts),
      );
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(mySelectedSlots),
        conflicts,
      });
      setMyConflicts(conflicts);
      showToast("Interessekonflikter lagret.");
    } catch {
      showToast("Kunne ikke lagre interessekonflikter.", "error");
      throw new Error("Failed to persist conflicts");
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

  const canToggleCandidateNames =
    committeeRole === "leader" || committeeRole === "recruiting";

  const handleToggleCandidateNames = async (showCandidateNames: boolean) => {
    if (!savedSchedule || !canToggleCandidateNames) return false;

    try {
      await saveSchedule.mutateAsync({
        schedule: savedSchedule.schedule,
        start_date: savedSchedule.start_date,
        end_date: savedSchedule.end_date,
        session_duration: savedSchedule.session_duration,
        enabled_slots: savedSchedule.enabled_slots,
        day_start_minute: savedSchedule.day_start_minute,
        day_end_minute: savedSchedule.day_end_minute,
        chunk_size: savedSchedule.chunk_size,
        chunk_break_minutes: savedSchedule.chunk_break_minutes,
        is_distributed: savedSchedule.is_distributed,
        show_candidate_names: showCandidateNames,
      });
      showToast(
        showCandidateNames
          ? "Kandidatnavn er nå synlige i intervjuplanen."
          : "Kandidatnavn er nå skjult i intervjuplanen.",
      );
      return true;
    } catch {
      showToast("Kunne ikke oppdatere visning av kandidatnavn.", "error");
      return false;
    }
  };

  const handleReplacePanelMember = async (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacementName: string,
  ) => {
    if (!savedSchedule || !isAdmin) return false;

    const targetEntry = savedSchedule.schedule[scheduleIndex];
    if (!targetEntry) return false;

    const duplicateInPanel = targetEntry.panel.some(
      (member, memberIndex) =>
        memberIndex !== panelMemberIndex && member.name === replacementName,
    );
    if (duplicateInPanel) {
      showToast(
        "Denne personen er allerede i panelet for intervjuet.",
        "error",
      );
      return false;
    }

    const updatedSchedule = savedSchedule.schedule.map((entry, index) => {
      if (index !== scheduleIndex) return entry;

      return {
        ...entry,
        panel: entry.panel.map((member, memberIndex) =>
          memberIndex === panelMemberIndex
            ? {
                ...member,
                name: replacementName,
              }
            : member,
        ),
      };
    });

    try {
      await saveSchedule.mutateAsync({
        schedule: updatedSchedule,
        start_date: savedSchedule.start_date,
        end_date: savedSchedule.end_date,
        session_duration: savedSchedule.session_duration,
        enabled_slots: savedSchedule.enabled_slots,
        day_start_minute: savedSchedule.day_start_minute,
        day_end_minute: savedSchedule.day_end_minute,
        chunk_size: savedSchedule.chunk_size,
        chunk_break_minutes: savedSchedule.chunk_break_minutes,
        is_distributed: savedSchedule.is_distributed,
        show_candidate_names: savedSchedule.show_candidate_names,
      });
      showToast("Intervjupanel oppdatert.");
      return true;
    } catch {
      showToast("Kunne ikke oppdatere intervjupanelet.", "error");
      return false;
    }
  };

  const interviewerNameOptions = useMemo(() => {
    const names = new Set(interviewers.map((interviewer) => interviewer.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "nb"));
  }, [interviewers]);

  const tabDefinitions = useMemo<TabDefinition[]>(() => {
    const tabs: TabDefinition[] = [
      {
        key: "plan",
        title: "Intervjuplan",
        icon: CalendarCheck,
      },
      {
        key: "config",
        title: "Rammer",
        icon: LayoutPanelTop,
        adminOnly: true,
      },
      {
        key: "my-availability",
        title: "Min tilgjengelighet",
        icon: CalendarRange,
      },
      {
        key: "heatmap",
        title: "Fordeling",
        icon: BarChart3,
        adminOnly: true,
      },
      {
        key: "solver",
        title: "Intervjuforslag",
        icon: Sparkles,
        adminOnly: true,
      },
    ];

    return tabs.filter((tab) => !tab.adminOnly || isAdmin);
  }, [isAdmin]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-surface-page">
      <StatusToast toast={toast} />
      <WizardTour
        isOpen={wizard.isOpen}
        onClose={wizard.close}
        isAdmin={isAdmin}
      />

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
                  : "border-border bg-surface-base text-text-muted",
              )}
            >
              {roleLabel}
            </span>
            <button
              type="button"
              onClick={wizard.open}
              title="Vis veiledning"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface-base px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-brand-strongBorder hover:bg-brand-soft hover:text-brand"
            >
              <HelpCircle size={13} />
              Veiledning
            </button>
          </div>
        </header>

        {isAdmin && (
          <details className="group mb-3 overflow-hidden rounded-panel border border-border bg-surface-base">
            <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-4 px-5 py-3 hover:bg-surface-soft">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary">
                  Testdata
                </span>
                <span className="text-detail text-text-muted">
                  — simuler kandidater og intervjuere
                </span>
              </div>
              <ChevronDown
                size={14}
                className="flex-none text-text-muted transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <div className="flex flex-wrap items-end gap-2.5 border-t border-border-soft px-5 py-4">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-soft bg-surface-base px-3 py-2 text-ui font-semibold text-text-primary transition-colors hover:border-brand-strongBorder">
                <input
                  type="checkbox"
                  checked={useMockData}
                  onChange={(event) => setUseMockData(event.target.checked)}
                />
                Bruk mockdata
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border border-border-soft bg-surface-base px-3 py-2 text-ui font-semibold text-text-primary transition-colors hover:border-brand-strongBorder",
                  !useMockData &&
                    "cursor-not-allowed opacity-50 hover:border-border-soft",
                )}
              >
                <input
                  type="checkbox"
                  checked={appendMockToReal}
                  disabled={!useMockData}
                  onChange={(event) =>
                    setAppendMockToReal(event.target.checked)
                  }
                />
                Legg til reelle data
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
                  className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
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
                  className="w-24 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                  onChange={(event) => setInterviewerInput(event.target.value)}
                />
              </div>

            </div>
          </details>
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

              <SchedulePanel>
                <SchedulePanelHeader
                  eyebrow="Oversikt · Kandidater"
                  title="Registrerte kandidater"
                  description="Listen oppdateres automatisk fra søknadene og mockdataene."
                  chips={<Chip tone="muted">{candidates.length}</Chip>}
                />
                <SchedulePanelBody>
                  <PersonListView data={candidates} />
                </SchedulePanelBody>
              </SchedulePanel>
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
            />
          )}

          {activeSection === "plan" && (
            <DistributedPlanView
              savedSchedule={savedSchedule}
              dates={dates}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              canToggleCandidateNames={canToggleCandidateNames}
              onToggleCandidateNames={handleToggleCandidateNames}
              onReplacePanelMember={handleReplacePanelMember}
              interviewerNameOptions={interviewerNameOptions}
              myConflicts={myConflicts}
              realCandidates={candidates}
              onSaveConflicts={handleSaveConflicts}
              interviewers={interviewers}
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
  canToggleCandidateNames: boolean;
  onToggleCandidateNames: (showCandidateNames: boolean) => Promise<boolean>;
  onReplacePanelMember: (
    scheduleIndex: number,
    panelMemberIndex: number,
    replacementName: string,
  ) => Promise<boolean>;
  interviewerNameOptions: string[];
  myConflicts: string[];
  realCandidates: Candidate[];
  onSaveConflicts: (ids: string[]) => Promise<void>;
  interviewers: Interviewer[];
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
  currentUserName,
  canToggleCandidateNames,
  onToggleCandidateNames,
  onReplacePanelMember,
  interviewerNameOptions,
  myConflicts,
  realCandidates,
  onSaveConflicts,
  interviewers,
}) => {
  const [myInterviewsOnly, setMyInterviewsOnly] = useState(false);
  const [isUpdatingNames, setIsUpdatingNames] = useState(false);
  const [isExportChooserOpen, setIsExportChooserOpen] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [isSavingConflict, setIsSavingConflict] = useState(false);
  const [editingPanelTarget, setEditingPanelTarget] = useState<{
    scheduleIndex: number;
    panelMemberIndex: number;
  } | null>(null);
  const [replacementName, setReplacementName] = useState("");
  const [isReplacingPanelMember, setIsReplacingPanelMember] = useState(false);

  const conflictSet = useMemo(() => new Set(myConflicts), [myConflicts]);
  const candidateIdByName = useMemo(
    () => new Map(realCandidates.map((c) => [c.name, c.id])),
    [realCandidates],
  );
  const biasedByInterviewer = useMemo(
    () => new Map(interviewers.map((iv) => [iv.name, new Set(iv.biased)])),
    [interviewers],
  );

  const toggleCandidateConflict = async (candidateName: string) => {
    const candidateId = candidateIdByName.get(candidateName);
    if (!candidateId || isSavingConflict) return;
    setIsSavingConflict(true);
    const newConflicts = conflictSet.has(candidateId)
      ? myConflicts.filter((id) => id !== candidateId)
      : [...myConflicts, candidateId];
    try {
      await onSaveConflicts(newConflicts);
    } catch {
      // Toast is shown by onSaveConflicts
    } finally {
      setIsSavingConflict(false);
    }
  };

  if (!savedSchedule) {
    return (
      <SchedulePanel>
        <div className="px-6 py-14 text-center">
          <span className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand-border/60">
            <CalendarCheck size={18} />
          </span>
          <h3 className="mb-1 mt-2 text-sm font-bold text-text-primary">
            Ingen plan distribuert ennå
          </h3>
          <p className="m-0 mx-auto max-w-[28rem] text-ui leading-relaxed text-text-muted">
            {isAdmin
              ? 'Gå til "Intervjuforslag" for å generere og distribuere en intervjuplan.'
              : "Admins har ikke distribuert en intervjuplan ennå. Kom tilbake senere."}
          </p>
        </div>
      </SchedulePanel>
    );
  }

  const namesVisible = savedSchedule.show_candidate_names;
  const sortedEntries = savedSchedule.schedule
    .map((item, index) => ({ item, scheduleIndex: index }))
    .sort((a, b) => a.item.time - b.item.time);
  const myInterviews = sortedEntries.filter(({ item }) =>
    item.panel.some((p) => p.name === currentUserName),
  );
  const displaySorted = myInterviewsOnly ? myInterviews : sortedEntries;
  const replacementOptions = Array.from(
    new Set([
      ...interviewerNameOptions,
      ...savedSchedule.schedule.flatMap((item) =>
        item.panel.map((member) => member.name),
      ),
    ]),
  ).sort((a, b) => a.localeCompare(b, "nb"));

  const editingPanelEntry =
    editingPanelTarget !== null
      ? savedSchedule.schedule[editingPanelTarget.scheduleIndex]
      : null;
  const selectedPanelMemberName =
    editingPanelEntry && editingPanelTarget !== null
      ? editingPanelEntry.panel[editingPanelTarget.panelMemberIndex]?.name
      : null;
  const replacementWouldDuplicate =
    editingPanelEntry && editingPanelTarget !== null
      ? editingPanelEntry.panel.some(
          (member, memberIndex) =>
            memberIndex !== editingPanelTarget.panelMemberIndex &&
            member.name === replacementName,
        )
      : false;

  const formatTimeLabel = (timeValue: number) => {
    const { dayIndex, minute } = decodeScheduleTime(
      timeValue,
      savedSchedule.session_duration,
    );
    const date = dates[dayIndex];
    const hour = Math.floor(minute / 60);
    const minutePart = minute % 60;
    const timeLabel = `${hour.toString().padStart(2, "0")}:${minutePart
      .toString()
      .padStart(2, "0")}`;
    return date
      ? `${formatDateHeader(date).weekday} ${formatDateHeader(date).dayMonth} ${timeLabel}`
      : `Dag ${dayIndex + 1} ${timeLabel}`;
  };

  const handleExportIcs = (target: "apple" | "google") => {
    const schedule = myInterviewsOnly
      ? myInterviews.map(({ item }) => item)
      : savedSchedule.schedule;
    const icsContent = generateIcs(
      schedule,
      dates,
      savedSchedule.session_duration,
      "Intervjuplan",
    );
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      target === "google"
        ? myInterviewsOnly
          ? "mine-intervjuer-google.ics"
          : "intervjuplan-google.ics"
        : myInterviewsOnly
          ? "mine-intervjuer-apple.ics"
          : "intervjuplan-apple.ics";
    a.click();
    URL.revokeObjectURL(url);

    if (target === "google") {
      window.open(
        "https://calendar.google.com/calendar/u/0/r/settings/importexport",
        "_blank",
        "noopener,noreferrer",
      );
    }
  };

  const handleExportCsv = () => {
    const rows: string[][] = [["Tidspunkt", "Kandidat", "Panel"]];
    displaySorted.forEach(({ item }) => {
      rows.push([
        formatTimeLabel(item.time),
        namesVisible ? item.candidate : "—",
        item.panel.map((p) => p.name).join("; "),
      ]);
    });
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuplan.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleNamesForPlan = async () => {
    if (!canToggleCandidateNames || isUpdatingNames) return;

    setIsUpdatingNames(true);
    try {
      await onToggleCandidateNames(!savedSchedule.show_candidate_names);
    } finally {
      setIsUpdatingNames(false);
    }
  };

  const beginReplacePanelMember = (
    scheduleIndex: number,
    panelMemberIndex: number,
    currentName: string,
  ) => {
    setEditingPanelTarget({ scheduleIndex, panelMemberIndex });
    setReplacementName(currentName);
  };

  const confirmPanelReplacement = async () => {
    if (!editingPanelTarget || !replacementName) return;

    setIsReplacingPanelMember(true);
    try {
      const didUpdate = await onReplacePanelMember(
        editingPanelTarget.scheduleIndex,
        editingPanelTarget.panelMemberIndex,
        replacementName,
      );
      if (didUpdate) {
        setEditingPanelTarget(null);
        setReplacementName("");
      }
    } finally {
      setIsReplacingPanelMember(false);
    }
  };

  const thClass =
    "bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle border-b border-border-soft";

  return (
    <SchedulePanel>
      {/* Header */}
      <SchedulePanelHeader
        icon={CalendarCheck}
        eyebrow="Resultat · Plan"
        title="Intervjuplan"
        chips={
          savedSchedule.is_distributed ? (
            <Chip tone="success">Distribuert</Chip>
          ) : (
            <Chip tone="muted">Utkast</Chip>
          )
        }
        actions={
          <button
            type="button"
            onClick={() => setIsExportChooserOpen(true)}
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            Eksporter
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-6 py-3">
        <button
          type="button"
          onClick={() => setMyInterviewsOnly((v) => !v)}
          className={cn(
            actionButtonBase,
            myInterviewsOnly ? actionButtonActive : actionButtonNeutral,
            "px-3 py-1.5",
          )}
        >
          Mine intervjuer
          {myInterviews.length > 0 && (
            <span className="ml-1 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
              {myInterviews.length}
            </span>
          )}
        </button>

        {canToggleCandidateNames && (
          <button
            type="button"
            onClick={handleToggleNamesForPlan}
            disabled={isUpdatingNames}
            className={cn(
              actionButtonBase,
              namesVisible ? actionButtonActive : actionButtonNeutral,
              "px-3 py-1.5",
            )}
          >
            {isUpdatingNames
              ? "Oppdaterer..."
              : namesVisible
                ? "Skjul navn"
                : "Vis navn"}
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={handleExportCsv}
            title="CSV til Google Regneark"
            className={cn(
              actionButtonBase,
              actionButtonNeutral,
              "px-3 py-1.5",
            )}
          >
            CSV
          </button>
        )}

        <span className="ml-auto text-detail text-text-muted">
          {displaySorted.length} intervjuer
          {myConflicts.length > 0 && (
            <span className="ml-2 rounded-full border border-brand-border bg-brand-muted px-2 py-0.5 text-label font-bold text-brand">
              {myConflicts.length} KI
            </span>
          )}
        </span>
      </div>

      {/* Plan content */}
      <SchedulePanelBody className={tableExpanded ? "p-0" : undefined}>
        {isExportChooserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-panel border border-border bg-surface-base p-5 shadow-lg">
              <h4 className="m-0 text-base font-bold text-text-primary">
                Velg kalender
              </h4>
              <p className="mb-0 mt-2 text-ui text-text-muted">
                Eksporten blir en .ics-fil. Apple Calendar kan åpne den
                direkte, mens Google Calendar importerer via innstillinger.
              </p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  className={cn(actionButtonBase, actionButtonPrimary)}
                  onClick={() => {
                    handleExportIcs("apple");
                    setIsExportChooserOpen(false);
                  }}
                >
                  Apple Calendar (.ics)
                </button>
                <button
                  type="button"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                  onClick={() => {
                    handleExportIcs("google");
                    setIsExportChooserOpen(false);
                  }}
                >
                  Google Calendar (.ics + importside)
                </button>
                <button
                  type="button"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                  onClick={() => setIsExportChooserOpen(false)}
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}

        {!tableExpanded ? (
          <div className="py-10 text-center">
            <p className="mb-1 text-title font-bold text-text-primary">
              {displaySorted.length} intervjuer planlagt
            </p>
            <p className="mb-5 text-ui text-text-muted">
              {myInterviews.length > 0
                ? `${myInterviews.length} av dem er med deg`
                : "Ingen av dem er med deg ennå"}
            </p>
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonPrimary)}
              onClick={() => setTableExpanded(true)}
            >
              Vis intervjuplan
            </button>
          </div>
        ) : (
          <>
            {myInterviewsOnly && myInterviews.length === 0 && (
              <div className="border-b border-border-soft px-6 py-4 text-ui text-text-muted">
                Ingen intervjuer funnet for{" "}
                <strong>{currentUserName}</strong>. Filteret matcher på navn.
              </div>
            )}

            {namesVisible && (
              <div className="border-b border-border-soft bg-brand-soft px-6 py-2.5 text-detail text-text-muted">
                Klikk på et kandidatnavn for å markere interessekonflikt (KI).
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={thClass}>Tidspunkt</th>
                    <th className={thClass}>Kandidat</th>
                    <th className={thClass}>Panel</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySorted.map(({ item, scheduleIndex }) => {
                    const candidateId = candidateIdByName.get(item.candidate);
                    const isConflict =
                      candidateId !== undefined &&
                      conflictSet.has(candidateId);
                    const isMyRow = item.panel.some(
                      (p) => p.name === currentUserName,
                    );
                    const panelCoiNames = isAdmin && candidateId
                      ? item.panel
                          .filter((p) => biasedByInterviewer.get(p.name)?.has(candidateId))
                          .map((p) => p.name)
                      : [];
                    return (
                      <tr
                        key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                        className={cn(
                          "group border-b border-border-faint last:border-0",
                          isMyRow && !myInterviewsOnly && "bg-brand-soft",
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-text-muted group-hover:bg-surface-soft">
                          {formatTimeLabel(item.time)}
                        </td>
                        <td className="px-4 py-3 group-hover:bg-surface-soft">
                          {namesVisible ? (
                            <button
                              type="button"
                              onClick={() =>
                                toggleCandidateConflict(item.candidate)
                              }
                              disabled={!candidateId || isSavingConflict}
                              title={
                                isConflict
                                  ? "Fjern interessekonflikt"
                                  : "Merk som interessekonflikt"
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-[border-color,background,transform] duration-150 hover:-translate-y-px",
                                isConflict
                                  ? "border-brand-activeBorder bg-brand-tint text-brand"
                                  : "border-border bg-surface-base text-text-primary hover:border-brand-strongBorder hover:bg-brand-soft",
                                !candidateId &&
                                  "cursor-default opacity-70 hover:translate-y-0",
                              )}
                            >
                              {isConflict && (
                                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                              )}
                              {item.candidate}
                            </button>
                          ) : (
                            <span className="text-sm text-text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 group-hover:bg-surface-soft">
                          <div className="flex flex-wrap gap-1.5">
                            {item.panel.map((p, i) => {
                              const hasCoi = isAdmin && candidateId
                                ? biasedByInterviewer.get(p.name)?.has(candidateId) ?? false
                                : false;
                              return (
                                <button
                                  key={`${p.name}-${i}`}
                                  type="button"
                                  disabled={!isAdmin}
                                  onClick={() =>
                                    isAdmin &&
                                    beginReplacePanelMember(
                                      scheduleIndex,
                                      i,
                                      p.name,
                                    )
                                  }
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                                    isAdmin &&
                                      "cursor-pointer transition-[border-color,background,transform] hover:-translate-y-px",
                                    hasCoi
                                      ? "border-dashed border-orange-400 bg-orange-50 text-orange-700"
                                      : p.name === currentUserName
                                        ? "border-brand-strongBorder bg-brand-tint font-bold text-brand"
                                        : p.is_overtime
                                          ? "border-amber-300 bg-amber-50 font-semibold text-amber-700"
                                          : "border-border-soft bg-surface-subtle text-text-soft",
                                  )}
                                  title={
                                    hasCoi
                                      ? `${p.name} har meldt interessekonflikt${isAdmin ? " · Klikk for å bytte" : ""}`
                                      : isAdmin
                                        ? "Klikk for å bytte intervjuer"
                                        : undefined
                                  }
                                >
                                  {hasCoi && <span className="text-[9px]">⚠</span>}
                                  {p.name}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SchedulePanelBody>

      {tableExpanded && (
        <SchedulePanelFooter>
          <span className="text-detail text-text-muted">
            {namesVisible
              ? "Klikk et kandidatnavn for å markere/fjerne interessekonflikt."
              : "Kandidatnavn er skjult."}
          </span>
          <button
            type="button"
            onClick={() => setTableExpanded(false)}
            className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-1.5")}
          >
            Skjul tabell
          </button>
        </SchedulePanelFooter>
      )}

      {editingPanelTarget !== null && editingPanelEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-panel border border-border bg-surface-base p-5 shadow-lg">
            <h4 className="m-0 text-base font-bold text-text-primary">
              Bytt intervjuer
            </h4>
            <p className="mb-0 mt-2 text-ui text-text-muted">
              Velg hvem som skal erstatte{" "}
              <strong>{selectedPanelMemberName ?? "personen"}</strong> i dette
              intervjuet.
            </p>
            <div className="mt-4 space-y-3">
              <select
                className="w-full rounded-xl border border-border-muted bg-surface-base px-3 py-2.5 text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                value={replacementName}
                onChange={(event) => setReplacementName(event.target.value)}
              >
                {replacementOptions.map((name) => (
                  <option
                    key={name}
                    value={name}
                    disabled={
                      name !== selectedPanelMemberName &&
                      editingPanelEntry.panel.some(
                        (member) => member.name === name,
                      )
                    }
                  >
                    {name}
                  </option>
                ))}
              </select>
              {replacementWouldDuplicate && (
                <div className="rounded-xl border border-brand-border bg-brand-muted px-3 py-2 text-ui font-semibold text-brand">
                  Denne personen er allerede i panelet.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonNeutral)}
                onClick={() => setEditingPanelTarget(null)}
                disabled={isReplacingPanelMember}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonPrimary)}
                onClick={confirmPanelReplacement}
                disabled={
                  isReplacingPanelMember ||
                  !replacementName ||
                  replacementWouldDuplicate
                }
              >
                {isReplacingPanelMember ? "Bytter..." : "Bytt intervjuer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SchedulePanel>
  );
};

interface ConflictPickerProps {
  candidates: Candidate[];
  selectedCandidateIds: string[];
  onSelectionChange: (candidateIds: string[]) => void;
  onSave: (candidateIds: string[]) => Promise<void>;
}

const ConflictPicker: React.FC<ConflictPickerProps> = ({
  candidates,
  selectedCandidateIds,
  onSelectionChange,
  onSave,
}) => {
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds],
  );

  const filteredCandidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("nb");
    if (!normalized) return candidates;
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase("nb").includes(normalized),
    );
  }, [candidates, query]);
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedSet.has(candidate.id)),
    [candidates, selectedSet],
  );
  const suggestionCandidates = useMemo(
    () => filteredCandidates.slice(0, 6),
    [filteredCandidates],
  );
  const visibleCandidates = useMemo(() => {
    if (query.trim()) return filteredCandidates;
    if (showAllCandidates) return candidates;
    return selectedCandidates;
  }, [
    candidates,
    filteredCandidates,
    query,
    selectedCandidates,
    showAllCandidates,
  ]);

  const toggleCandidate = (candidateId: string) => {
    if (selectedSet.has(candidateId)) {
      onSelectionChange(
        selectedCandidateIds.filter((selectedId) => selectedId !== candidateId),
      );
      return;
    }
    onSelectionChange([...selectedCandidateIds, candidateId]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedCandidateIds);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuggestionPick = (candidateId: string) => {
    toggleCandidate(candidateId);
    setQuery("");
  };

  return (
    <SchedulePanel className="h-full">
      <SchedulePanelHeader
        title="Interessekonflikter"
        chips={<Chip tone="brand">{selectedCandidateIds.length} markert</Chip>}
      />
      <SchedulePanelBody className="space-y-4">
        <div className="rounded-xl border border-border-soft bg-surface-muted p-3">
          <label
            htmlFor="conflict-search"
            className="mb-1 block text-label font-bold uppercase tracking-label text-text-subtle"
          >
            Finn kandidat
          </label>
          <input
            id="conflict-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Søk på navn"
            className="w-full rounded-xl border border-border-muted bg-surface-base px-3 py-2.5 text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
          />
          {query.trim() && suggestionCandidates.length > 0 && (
            <div className="mt-2 grid gap-1.5">
              {suggestionCandidates.map((candidate) => {
                const active = selectedSet.has(candidate.id);
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSuggestionPick(candidate.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-[border-color,background] duration-150",
                      active
                        ? "border-brand-activeBorder bg-brand-panel text-brand"
                        : "border-border-soft bg-surface-base text-text-primary hover:border-brand-strongBorder hover:bg-brand-soft",
                    )}
                  >
                    <span className="truncate">{candidate.name}</span>
                    <span className="text-label font-bold uppercase tracking-caps text-text-subtle">
                      {active ? "Markert" : "Velg"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedCandidates.length > 0 && (
          <div className="space-y-2">
            <div className="text-label font-bold uppercase tracking-label text-text-subtle">
              Markerte kandidater
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCandidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => toggleCandidate(candidate.id)}
                  className="inline-flex items-center rounded-full border border-brand-strongBorder bg-brand-tint px-3 py-1.5 text-sm font-semibold text-brand transition-[background,border-color] hover:border-brand-activeBorder hover:bg-brand-panel"
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="rounded-xl border border-border-soft bg-surface-muted px-4 py-8 text-center">
            <h4 className="m-0 text-sm font-bold text-text-primary">
              Ingen kandidater registrert ennå
            </h4>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-ui text-text-muted">
                {query.trim()
                  ? `${filteredCandidates.length} treff`
                  : showAllCandidates
                    ? `${candidates.length} kandidater`
                    : "Søk eller vis alle kandidater"}
              </div>
              {!query.trim() && (
                <button
                  type="button"
                  onClick={() => setShowAllCandidates((current) => !current)}
                  className={cn(
                    actionButtonBase,
                    actionButtonNeutral,
                    "px-3 py-1.5",
                  )}
                >
                  {showAllCandidates ? "Skjul liste" : "Vis alle"}
                </button>
              )}
            </div>

            {(query.trim() ||
              showAllCandidates ||
              selectedCandidates.length > 0) && (
              <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border-soft bg-surface-muted p-2">
                <div className="grid gap-2">
                  {visibleCandidates.map((candidate) => {
                    const active = selectedSet.has(candidate.id);
                    return (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => toggleCandidate(candidate.id)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-[border-color,background,transform] duration-150 hover:-translate-y-px",
                          active
                            ? "border-brand-activeBorder bg-brand-panel shadow-toggle"
                            : "border-border-soft bg-surface-base hover:border-brand-strongBorder hover:bg-brand-soft",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-text-primary">
                            {candidate.name}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-1 text-label font-bold uppercase tracking-caps",
                            active
                              ? "border-brand-strongBorder bg-brand-tint text-brand"
                              : "border-border bg-surface-muted text-text-subtle",
                          )}
                        >
                          {active ? "Inhabil" : "OK"}
                        </span>
                      </button>
                    );
                  })}

                  {visibleCandidates.length === 0 && (
                    <div className="px-3 py-8 text-center text-ui text-text-muted">
                      Ingen kandidater matcher søket.
                    </div>
                  )}
                </div>
              </div>
            )}

            {!query.trim() &&
              !showAllCandidates &&
              selectedCandidates.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-soft bg-surface-muted px-4 py-6 text-sm text-text-muted">
                  Start med å søke etter et navn. Du kan også åpne hele listen
                  hvis du vil bla.
                </div>
              )}
          </div>
        )}
      </SchedulePanelBody>
      <SchedulePanelFooter>
        <button
          type="button"
          onClick={() => onSelectionChange([])}
          className={cn(actionButtonBase, actionButtonNeutral)}
          disabled={selectedCandidateIds.length === 0 || isSaving}
        >
          Fjern alle
        </button>
        <button
          type="button"
          onClick={handleSave}
          className={cn(actionButtonBase, actionButtonPrimary)}
          disabled={isSaving}
        >
          {isSaving ? "Lagrer..." : "Lagre konflikter"}
        </button>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

export default SchedulePage;
