import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarRange,
  Check,
  ChevronDown,
  LayoutPanelTop,
  LockKeyhole,
  Sparkles,
  CalendarCheck,
} from "lucide-react";
import {
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
import {
  Candidate,
  EnabledWindow,
  Interviewer,
  SavedSchedule,
  ScheduleItem,
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
} from "./mockData";
import djangoData from "src/utils/djangoData";
import {
  addDays,
  buildBlockTimeSlots,
  decodeScheduleTime,
  enabledWindowsToSlots,
  encodeScheduleTime,
  dateRangeDates,
  formatDateHeader,
  generateIcs,
  makeSlotKey,
  nextMonday,
  parseSlotKey,
  remapSlotsBetweenDurations,
  slotsToEnabledWindows,
} from "src/components/Scheduling/scheduleUtils";
import cn from "src/utils/cn";
import WizardTour, {
  useWizardTour,
} from "src/components/Scheduling/WizardTour";
import { HelpCircle } from "lucide-react";
import { apiClient } from "src/utils/callApi";

const DEFAULT_DAY_START_MINUTE = 8 * 60;
const DEFAULT_DAY_END_MINUTE = 18 * 60;
const DEFAULT_SESSION_DURATION = 60;

const formatSavedTime = () =>
  new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

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
  chunkSize = 4,
  chunkBreakMinutes = 0,
) => {
  const slots = new Set<string>();
  const daySlots = buildBlockTimeSlots({
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
  });

  dateRangeDates(start, end).forEach((date) => {
    daySlots.forEach((minute) => slots.add(makeSlotKey(date, minute)));
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

type TabType = "my-availability" | "heatmap" | "config" | "solver" | "plan";

interface WorkflowStepDefinition {
  key: TabType;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  status: string;
  tone: "success" | "active" | "muted" | "locked";
  locked?: boolean;
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

  const { data: savedSchedule } = useSavedSchedule(admissionSlug);
  const { data: interviewCandidates } = useInterviewCandidates(admissionSlug);
  const { data: availabilityParticipants } =
    useInterviewAvailability(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);
  const saveInterviewAvailability = useSaveInterviewAvailability(admissionSlug);
  const [activeSection, setActiveSection] = useState<TabType>(
    isAdmin ? "config" : "my-availability",
  );

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
  const [configSavedAt, setConfigSavedAt] = useState("");
  const [planSavedAt, setPlanSavedAt] = useState("");

  const dates = useMemo(
    () => dateRangeDates(startDate, endDate),
    [startDate, endDate],
  );

  const defaultEnabledSlots = useMemo(
    () => buildEnabledSlots(defaultStart, defaultEnd),
    [defaultEnd, defaultStart],
  );
  const [enabledWindows, setEnabledWindows] = useState<EnabledWindow[]>(() =>
    slotsToEnabledWindows(defaultEnabledSlots, DEFAULT_SESSION_DURATION),
  );
  const [enabledSlots, setEnabledSlots] = useState<Set<string>>(
    () => new Set(defaultEnabledSlots),
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
    const nextEnabledWindows =
      savedSchedule.enabled_windows?.length > 0
        ? savedSchedule.enabled_windows
        : slotsToEnabledWindows(
            savedSchedule.enabled_slots,
            savedSchedule.session_duration,
          );
    setEnabledWindows(nextEnabledWindows);
    setEnabledSlots(
      new Set(
        enabledWindowsToSlots(
          nextEnabledWindows,
          savedSchedule.session_duration,
        ),
      ),
    );
  }, [savedSchedule]);

  const handleSaveAvailability = async (slots: Set<string>) => {
    try {
      window.localStorage.setItem(
        availabilityStorageKey,
        JSON.stringify(Array.from(slots)),
      );
      await saveInterviewAvailability.mutateAsync({
        slots: Array.from(slots),
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
    const hadScheduleDraft = Boolean(savedSchedule?.schedule.length);
    const oldSessionDuration = sessionDuration;
    const blockShapeChanged =
      chunkBreakMinutes !== config.chunkBreakMinutes ||
      ((chunkBreakMinutes > 0 || config.chunkBreakMinutes > 0) &&
        chunkSize !== config.chunkSize);
    const gridChanged =
      startDate !== config.startDate ||
      endDate !== config.endDate ||
      dayStartMinute !== config.dayStartMinute ||
      dayEndMinute !== config.dayEndMinute ||
      sessionDuration !== config.sessionDuration ||
      blockShapeChanged ||
      JSON.stringify(enabledWindows) !== JSON.stringify(config.enabledWindows);

    try {
      const saved = await saveSchedule.mutateAsync({
        ...(gridChanged ? {} : { schedule: savedSchedule?.schedule ?? [] }),
        start_date: config.startDate,
        end_date: config.endDate,
        session_duration: config.sessionDuration,
        enabled_windows: config.enabledWindows,
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
      setEnabledWindows(config.enabledWindows);
      setEnabledSlots(
        new Set(
          enabledWindowsToSlots(config.enabledWindows, config.sessionDuration),
        ),
      );

      if (gridChanged) {
        setMySelectedSlots((currentSlots) =>
          remapSlotsBetweenDurations(
            currentSlots,
            oldSessionDuration,
            config.enabledWindows,
            config.sessionDuration,
          ),
        );
      }

      setConfigSavedAt(formatSavedTime());
      setPlanSavedAt("");
      showToast(
        hadScheduleDraft && saved.schedule.length === 0
          ? "Konfigurasjon lagret. Intervjuutkastet ble nullstilt."
          : "Konfigurasjon lagret.",
      );
    } catch {
      showToast("Kunne ikke lagre konfigurasjonen.", "error");
      // Keep UI responsive even if backend save fails.
      return;
    }
  };

  const canToggleCandidateNames =
    isAdmin || committeeRole === "leader" || committeeRole === "recruiting";

  const handleToggleCandidateNames = async (showCandidateNames: boolean) => {
    if (!savedSchedule || !canToggleCandidateNames) return false;

    try {
      await saveSchedule.mutateAsync({
        schedule: savedSchedule.schedule,
        start_date: savedSchedule.start_date,
        end_date: savedSchedule.end_date,
        session_duration: savedSchedule.session_duration,
        enabled_windows: savedSchedule.enabled_windows ?? [],
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
    if (!savedSchedule || !isAdmin || savedSchedule.is_distributed)
      return false;

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
      const replacement = interviewers.find(
        (interviewer) => interviewer.name === replacementName,
      );

      return {
        ...entry,
        locked: true,
        panel: entry.panel.map((member, memberIndex) =>
          memberIndex === panelMemberIndex
            ? {
                ...member,
                id: replacement?.id ?? member.id,
                name: replacementName,
                is_overtime: replacement
                  ? !replacement.availability.includes(entry.time)
                  : member.is_overtime,
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
        enabled_windows: savedSchedule.enabled_windows ?? [],
        enabled_slots: savedSchedule.enabled_slots,
        day_start_minute: savedSchedule.day_start_minute,
        day_end_minute: savedSchedule.day_end_minute,
        chunk_size: savedSchedule.chunk_size,
        chunk_break_minutes: savedSchedule.chunk_break_minutes,
        is_distributed: savedSchedule.is_distributed,
        show_candidate_names: savedSchedule.show_candidate_names,
      });
      setPlanSavedAt(formatSavedTime());
      showToast("Intervjupanel oppdatert.");
      return true;
    } catch {
      showToast("Kunne ikke oppdatere intervjupanelet.", "error");
      return false;
    }
  };

  const handleChangeInterviewTime = async (
    scheduleIndex: number,
    nextTime: number,
  ) => {
    if (!savedSchedule || !isAdmin || savedSchedule.is_distributed)
      return false;

    const targetEntry = savedSchedule.schedule[scheduleIndex];
    if (!targetEntry) return false;

    const timeTaken = savedSchedule.schedule.some(
      (entry, index) => index !== scheduleIndex && entry.time === nextTime,
    );
    if (timeTaken) {
      showToast("Tidspunktet er allerede brukt.", "error");
      return false;
    }

    const updatedSchedule = savedSchedule.schedule.map((entry, index) => {
      if (index !== scheduleIndex) return entry;
      return {
        ...entry,
        time: nextTime,
        locked: true,
        panel: entry.panel.map((member) => {
          const interviewer = interviewers.find(
            (candidate) => candidate.name === member.name,
          );
          return {
            ...member,
            id: member.id ?? interviewer?.id,
            is_overtime: interviewer
              ? !interviewer.availability.includes(nextTime)
              : member.is_overtime,
          };
        }),
      };
    });

    try {
      await saveSchedule.mutateAsync({
        schedule: updatedSchedule,
        start_date: savedSchedule.start_date,
        end_date: savedSchedule.end_date,
        session_duration: savedSchedule.session_duration,
        enabled_windows: savedSchedule.enabled_windows ?? [],
        enabled_slots: savedSchedule.enabled_slots,
        day_start_minute: savedSchedule.day_start_minute,
        day_end_minute: savedSchedule.day_end_minute,
        chunk_size: savedSchedule.chunk_size,
        chunk_break_minutes: savedSchedule.chunk_break_minutes,
        is_distributed: false,
        show_candidate_names: savedSchedule.show_candidate_names,
      });
      setPlanSavedAt(formatSavedTime());
      showToast("Intervjutid oppdatert.");
      return true;
    } catch {
      showToast("Kunne ikke oppdatere intervjutid.", "error");
      return false;
    }
  };

  const buildLockedAssignments = (schedule: ScheduleItem[]) =>
    schedule
      .filter((item) => item.locked)
      .map((item) => ({
        candidate_id:
          item.candidate_id ??
          candidates.find((candidate) => candidate.name === item.candidate)?.id,
        candidate: item.candidate,
        time: item.time,
        panel: item.panel.map((member) => ({
          id:
            member.id ??
            interviewers.find((interviewer) => interviewer.name === member.name)
              ?.id,
          name: member.name,
        })),
      }));

  const handleRerunWithConflicts = async () => {
    if (!savedSchedule || savedSchedule.is_distributed || !isAdmin)
      return false;

    try {
      const response = await apiClient.post("/solve/", {
        candidates,
        interviewers,
        panel_size: savedSchedule.schedule[0]?.panel.length ?? 3,
        options: {
          enforce_same_gender: true,
          allow_overtime: true,
          prioritize_continuity: true,
          overtime_weight: 100,
          load_balance_weight: 1,
          continuity_weight: 12,
          max_solver_seconds: 10,
        },
        locked_assignments: buildLockedAssignments(savedSchedule.schedule),
      });

      if (response.data.status === "LOCKED_CONFLICT") {
        showToast(
          "En låst endring krasjer med KI. Endre eller lås opp raden først.",
          "error",
        );
        return false;
      }

      if (response.data.status !== "SUCCESS") {
        showToast("Ingen ny plan funnet med dagens KI.", "error");
        return false;
      }

      await saveSchedule.mutateAsync({
        schedule: response.data.schedule,
        start_date: savedSchedule.start_date,
        end_date: savedSchedule.end_date,
        session_duration: savedSchedule.session_duration,
        enabled_windows: savedSchedule.enabled_windows ?? [],
        enabled_slots: savedSchedule.enabled_slots,
        day_start_minute: savedSchedule.day_start_minute,
        day_end_minute: savedSchedule.day_end_minute,
        chunk_size: savedSchedule.chunk_size,
        chunk_break_minutes: savedSchedule.chunk_break_minutes,
        is_distributed: false,
        show_candidate_names: false,
      });
      setPlanSavedAt(formatSavedTime());
      showToast("Planen ble kjørt på nytt med KI.");
      return true;
    } catch {
      showToast("Kunne ikke kjøre planen på nytt.", "error");
      return false;
    }
  };

  const interviewerNameOptions = useMemo(() => {
    const names = new Set(interviewers.map((interviewer) => interviewer.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "nb"));
  }, [interviewers]);

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
  const missingAvailabilityNames = useMemo(
    () =>
      (availabilityParticipants ?? [])
        .filter((participant) => !participant.has_submitted)
        .map((participant) => participant.full_name),
    [availabilityParticipants],
  );

  const workflowSteps = useMemo<WorkflowStepDefinition[]>(() => {
    if (!isAdmin) {
      return [
        {
          key: "my-availability",
          title: "Tilgjengelighet",
          description: hasConfiguredAvailabilityWindows
            ? "Marker når du kan intervjue."
            : "Vent til opptaksansvarlig åpner intervjutider.",
          icon: CalendarRange,
          status: hasConfiguredAvailabilityWindows
            ? myAvailabilitySaved
              ? "Ferdig"
              : "Pågår..."
            : "Ikke åpnet",
          tone: hasConfiguredAvailabilityWindows
            ? myAvailabilitySaved
              ? "success"
              : "active"
            : "locked",
          locked: !hasConfiguredAvailabilityWindows,
        },
        {
          key: "plan",
          title: "Intervjuplan",
          description: "Se dine intervjuer når planen er klar.",
          icon: CalendarCheck,
          status: hasDistributedPlan ? "Klar" : "Låst",
          tone: hasDistributedPlan ? "success" : "locked",
          locked: !hasDistributedPlan,
        },
      ];
    }

    return [
      {
        key: "config",
        title: "Rammer",
        description: "Velg periode, lengde og åpne tidslommer.",
        icon: LayoutPanelTop,
        status: hasSavedConfig ? "Ferdig" : "Pågår...",
        tone: hasSavedConfig ? "success" : "active",
      },
      {
        key: "my-availability",
        title: "Tilgjengelighet",
        description: "La komiteen registrere tider og habilitet.",
        icon: CalendarRange,
        status:
          availabilityParticipantCount > 0
            ? `${submittedAvailabilityCount}/${availabilityParticipantCount}`
            : myAvailabilitySaved
              ? "Ferdig"
              : "Pågår...",
        tone:
          availabilityParticipantCount > 0 &&
          submittedAvailabilityCount >= availabilityParticipantCount
            ? "success"
            : activeSection === "my-availability"
              ? "active"
              : "muted",
      },
      {
        key: "heatmap",
        title: "Fordeling",
        description: "Sjekk dekning før planen genereres.",
        icon: BarChart3,
        status: hasScheduleDraft ? "Ferdig" : "Admin",
        tone: hasScheduleDraft
          ? "success"
          : activeSection === "heatmap"
            ? "active"
            : "muted",
      },
      {
        key: "solver",
        title: "Intervjuforslag",
        description: "Generer og se over forslaget.",
        icon: Sparkles,
        status: hasScheduleDraft ? "Utkast" : "Admin",
        tone: hasScheduleDraft
          ? "success"
          : activeSection === "solver"
            ? "active"
            : "muted",
      },
      {
        key: "plan",
        title: "Intervjuplan",
        description: "Publiser, eksporter og følg opp.",
        icon: CalendarCheck,
        status: hasDistributedPlan
          ? "Distribuert"
          : hasScheduleDraft
            ? "Klar"
            : "Låst",
        tone: hasDistributedPlan
          ? "success"
          : hasScheduleDraft || activeSection === "plan"
            ? "active"
            : "locked",
        locked: !hasScheduleDraft,
      },
    ];
  }, [
    activeSection,
    availabilityParticipantCount,
    hasConfiguredAvailabilityWindows,
    hasDistributedPlan,
    hasSavedConfig,
    hasScheduleDraft,
    isAdmin,
    myAvailabilitySaved,
    submittedAvailabilityCount,
  ]);

  const handleCopyReminder = useCallback(async () => {
    const names =
      missingAvailabilityNames.length > 0
        ? missingAvailabilityNames.join(", ")
        : "komiteen";
    const message = `Hei! Kan dere registrere intervjutidene deres i opptaksflyten? Mangler foreløpig: ${names}.`;

    try {
      await navigator.clipboard.writeText(message);
      showToast("Purretekst kopiert.");
    } catch {
      showToast("Kunne ikke kopiere purretekst.", "error");
    }
  }, [missingAvailabilityNames, showToast]);

  const canAccessSection = useCallback(
    (section: TabType) =>
      isAdmin || section === "my-availability" || section === "plan",
    [isAdmin],
  );

  const handleSectionChange = useCallback(
    (next: TabType) => {
      if (canAccessSection(next)) {
        setActiveSection(next);
      }
    },
    [canAccessSection],
  );

  useEffect(() => {
    if (!canAccessSection(activeSection)) {
      setActiveSection("my-availability");
    }
  }, [activeSection, canAccessSection]);

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

          {activeSection === "heatmap" && isAdmin && (
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
              enabledWindows={enabledWindows}
              enabledSlots={enabledSlots}
              hasScheduleDraft={hasScheduleDraft}
              lastSavedAt={configSavedAt}
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
              onChangeInterviewTime={handleChangeInterviewTime}
              onRerunWithConflicts={handleRerunWithConflicts}
              interviewerNameOptions={interviewerNameOptions}
              myConflicts={myConflicts}
              realCandidates={candidates}
              onSaveConflicts={handleSaveConflicts}
              interviewers={interviewers}
              enabledSlots={enabledSlots}
              planSavedAt={planSavedAt}
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
              enabledWindows={enabledWindows}
              enabledSlots={enabledSlots}
              dayStartMinute={dayStartMinute}
              dayEndMinute={dayEndMinute}
              chunkSize={chunkSize}
              chunkBreakMinutes={chunkBreakMinutes}
              onNotify={showToast}
            />
          )}

          <WorkflowNudge
            activeKey={activeSection}
            isAdmin={isAdmin}
            hasSavedConfig={hasSavedConfig}
            hasConfiguredAvailabilityWindows={hasConfiguredAvailabilityWindows}
            hasScheduleDraft={hasScheduleDraft}
            hasDistributedPlan={hasDistributedPlan}
            submittedAvailabilityCount={submittedAvailabilityCount}
            availabilityParticipantCount={availabilityParticipantCount}
            missingAvailabilityCount={missingAvailabilityNames.length}
            onNavigate={handleSectionChange}
            onCopyReminder={handleCopyReminder}
          />
        </main>
      </div>
    </div>
  );
};

interface WorkflowStepperProps {
  steps: WorkflowStepDefinition[];
  activeKey: TabType;
  onChange: (key: TabType) => void;
}

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeKey,
  onChange,
}) => {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === activeKey),
  );

  return (
    <section className="overflow-hidden rounded-panel border border-border bg-surface-base shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-surface-subtle px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-label font-bold uppercase tracking-badge-wide text-text-subtle">
            Opptaksflyt
          </span>
          <span className="h-1 w-1 rounded-full bg-text-faded" />
          <span className="text-detail font-bold text-text-muted">
            Steg {activeIndex + 1} av {steps.length}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-detail font-semibold text-text-primary">
            {steps[activeIndex]?.title}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-label font-bold uppercase tracking-caps",
              steps[activeIndex]?.tone === "success" &&
                "border-green-200 bg-green-50 text-green-700",
              steps[activeIndex]?.tone === "active" &&
                "border-brand-border bg-brand-muted text-brand",
              steps[activeIndex]?.tone === "muted" &&
                "border-border-soft bg-surface-base text-text-muted",
              steps[activeIndex]?.tone === "locked" &&
                "border-border-soft bg-surface-muted text-text-disabled",
            )}
          >
            {steps[activeIndex]?.status}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-3">
        <div className="flex min-w-max items-center">
          {steps.map((step, index) => {
            const Icon = step.locked ? LockKeyhole : step.icon;
            const isActive = step.key === activeKey;
            const isComplete = step.tone === "success";
            const isLocked = Boolean(step.locked);

            return (
              <React.Fragment key={step.key}>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onChange(step.key)}
                  title={`${index + 1}. ${step.title} · ${step.status}`}
                  className={cn(
                    "group flex min-w-[120px] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-[background,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                    isActive && "bg-brand-soft",
                    !isActive && !isLocked && "hover:bg-surface-subtle",
                    isLocked && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 flex-none items-center justify-center rounded-full ring-1 transition-colors",
                      isComplete && "bg-green-500 text-white ring-green-500/20",
                      isActive &&
                        !isComplete &&
                        "bg-brand text-white ring-brand-border",
                      !isActive &&
                        !isComplete &&
                        !isLocked &&
                        "bg-surface-neutral text-text-muted ring-border-soft group-hover:text-brand",
                      isLocked &&
                        "bg-surface-disabled text-text-disabled ring-border-soft",
                    )}
                  >
                    {isComplete ? <Check size={15} /> : <Icon size={14} />}
                  </span>

                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-sm font-bold leading-tight",
                        isActive || isComplete
                          ? "text-text-primary"
                          : "text-text-muted",
                        isLocked && "text-text-disabled",
                      )}
                    >
                      {step.title}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-label font-semibold leading-tight",
                        isComplete && "text-green-700",
                        isActive && !isComplete && "text-brand",
                        !isActive && !isComplete && "text-text-subtle",
                      )}
                    >
                      {index + 1} · {step.status}
                    </span>
                  </span>

                  <span className="sr-only">{step.description}</span>
                </button>

                {index < steps.length - 1 && (
                  <span
                    className={cn(
                      "mx-1 h-px w-8 flex-none",
                      isComplete ? "bg-green-300" : "bg-border-soft",
                    )}
                    aria-hidden="true"
                  >
                    <span className="sr-only">Neste steg</span>
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const MemberAvailabilityPending = () => (
  <SchedulePanel>
    <SchedulePanelHeader
      icon={LockKeyhole}
      title="Intervjutider er ikke åpnet ennå"
      description="Opptaksansvarlig må først sette opp hvilke dager og tider intervjuene kan holdes. Kom tilbake når det er klart."
      chips={<Chip tone="muted">Ikke åpnet</Chip>}
    />
    <SchedulePanelBody>
      <div className="rounded-lg border border-border-soft bg-surface-subtle px-4 py-3 text-ui leading-relaxed text-text-muted">
        Du trenger ikke registrere noe før intervjutidene er åpnet.
      </div>
    </SchedulePanelBody>
  </SchedulePanel>
);

interface WorkflowNudgeProps {
  activeKey: TabType;
  isAdmin: boolean;
  hasSavedConfig: boolean;
  hasConfiguredAvailabilityWindows: boolean;
  hasScheduleDraft: boolean;
  hasDistributedPlan: boolean;
  submittedAvailabilityCount: number;
  availabilityParticipantCount: number;
  missingAvailabilityCount: number;
  onNavigate: (key: TabType) => void;
  onCopyReminder: () => void;
}

const WorkflowNudge: React.FC<WorkflowNudgeProps> = ({
  activeKey,
  isAdmin,
  hasSavedConfig,
  hasConfiguredAvailabilityWindows,
  hasScheduleDraft,
  hasDistributedPlan,
  submittedAvailabilityCount,
  availabilityParticipantCount,
  missingAvailabilityCount,
  onNavigate,
  onCopyReminder,
}) => {
  if (isAdmin && activeKey === "my-availability") {
    return (
      <>
        <SchedulePanel>
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 handheld:px-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand-border/60">
                <Bell size={16} />
              </span>
              <div>
                <h3 className="m-0 text-title font-bold text-text-primary">
                  Purr komiteen
                </h3>
                <p className="m-0 mt-0.5 text-ui text-text-muted">
                  <strong className="text-brand">
                    {submittedAvailabilityCount} av{" "}
                    {availabilityParticipantCount || "?"}
                  </strong>{" "}
                  har registrert tilgjengelighet.
                </p>
              </div>
            </div>
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonNeutral)}
              onClick={onCopyReminder}
              disabled={missingAvailabilityCount === 0}
            >
              Kopier purr-tekst
            </button>
          </div>
        </SchedulePanel>
        <NextStepBanner
          title="Neste: Sjekk at dekningen er god nok"
          description="Se etter hull i fordelingen før du genererer forslag."
          buttonLabel="Fordeling"
          onClick={() => onNavigate("heatmap")}
        />
      </>
    );
  }

  if (isAdmin && activeKey === "config") {
    return (
      <NextStepBanner
        title={
          hasSavedConfig
            ? "Neste: Få inn tilgjengelighet"
            : "Neste: Lagre rammene"
        }
        description="Rammene bestemmer hvilke tider komiteen kan velge mellom."
        buttonLabel={hasSavedConfig ? "Tilgjengelighet" : undefined}
        onClick={
          hasSavedConfig ? () => onNavigate("my-availability") : undefined
        }
      />
    );
  }

  if (isAdmin && activeKey === "heatmap") {
    return (
      <NextStepBanner
        title="Neste: Generer intervjuforslag"
        description="Når dekningen ser god ut, kan solveren lage et konkret forslag."
        buttonLabel="Intervjuforslag"
        onClick={() => onNavigate("solver")}
      />
    );
  }

  if (isAdmin && activeKey === "solver") {
    return (
      <NextStepBanner
        title={
          hasScheduleDraft
            ? "Neste: Gå gjennom intervjuplanen"
            : "Neste: Lag et forslag"
        }
        description={
          hasScheduleDraft
            ? "Se over planen, bytt panelmedlemmer ved behov og distribuer når alt stemmer."
            : "Kjør solveren når kandidater og tilgjengelighet er klare."
        }
        buttonLabel={hasScheduleDraft ? "Intervjuplan" : undefined}
        onClick={hasScheduleDraft ? () => onNavigate("plan") : undefined}
      />
    );
  }

  if (isAdmin && activeKey === "plan") {
    return (
      <NextStepBanner
        title={
          hasDistributedPlan
            ? "Planen er distribuert"
            : "Siste steg: distribuer planen"
        }
        description="Når planen er distribuert kan komiteen se sine intervjuer og eksportere til kalender."
      />
    );
  }

  if (!isAdmin && activeKey === "my-availability") {
    if (!hasConfiguredAvailabilityWindows) {
      return null;
    }

    return (
      <NextStepBanner
        title="Neste: Følg med på intervjuplanen"
        description="Når opptaksansvarlig har distribuert planen, blir intervjuene dine synlige her."
        buttonLabel={hasDistributedPlan ? "Intervjuplan" : undefined}
        onClick={hasDistributedPlan ? () => onNavigate("plan") : undefined}
      />
    );
  }

  return null;
};

interface NextStepBannerProps {
  title: string;
  description: string;
  buttonLabel?: string;
  onClick?: () => void;
}

const NextStepBanner: React.FC<NextStepBannerProps> = ({
  title,
  description,
  buttonLabel,
  onClick,
}) => (
  <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-brand-panelBorder bg-brand-muted px-6 py-4 handheld:px-4">
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-brand">
        <ArrowRight size={17} />
      </span>
      <div>
        <h3 className="m-0 text-title font-bold text-brand">{title}</h3>
        <p className="m-0 mt-0.5 text-ui text-text-muted">{description}</p>
      </div>
    </div>
    {buttonLabel && onClick && (
      <button
        type="button"
        className={cn(actionButtonBase, actionButtonPrimary)}
        onClick={onClick}
      >
        {buttonLabel}
        <ArrowRight size={14} />
      </button>
    )}
  </div>
);

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
  onChangeInterviewTime: (
    scheduleIndex: number,
    nextTime: number,
  ) => Promise<boolean>;
  onRerunWithConflicts: () => Promise<boolean>;
  interviewerNameOptions: string[];
  myConflicts: string[];
  realCandidates: Candidate[];
  onSaveConflicts: (ids: string[]) => Promise<void>;
  interviewers: Interviewer[];
  enabledSlots: Set<string>;
  planSavedAt: string;
}

const DistributedPlanView: React.FC<DistributedPlanViewProps> = ({
  savedSchedule,
  dates,
  isAdmin,
  currentUserName,
  canToggleCandidateNames,
  onToggleCandidateNames,
  onReplacePanelMember,
  onChangeInterviewTime,
  onRerunWithConflicts,
  interviewerNameOptions,
  myConflicts,
  realCandidates,
  onSaveConflicts,
  interviewers,
  enabledSlots,
  planSavedAt,
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
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [isChangingTime, setIsChangingTime] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);

  const conflictSet = useMemo(() => new Set(myConflicts), [myConflicts]);
  const candidateIdByName = useMemo(
    () => new Map(realCandidates.map((c) => [c.name, c.id])),
    [realCandidates],
  );
  const biasedByInterviewer = useMemo(
    () => new Map(interviewers.map((iv) => [iv.name, new Set(iv.biased)])),
    [interviewers],
  );
  const isEditableDraft = Boolean(
    isAdmin && savedSchedule && !savedSchedule.is_distributed,
  );
  const enabledTimeOptions = useMemo(() => {
    if (!savedSchedule) return [];
    const times = new Set<number>();
    enabledSlots.forEach((key) => {
      const { date, minute } = parseSlotKey(key);
      if (!Number.isFinite(minute)) return;
      const dayIndex = dates.indexOf(date);
      if (dayIndex === -1) return;
      times.add(
        encodeScheduleTime(dayIndex, minute, savedSchedule.session_duration),
      );
    });
    return Array.from(times).sort((a, b) => a - b);
  }, [dates, enabledSlots, savedSchedule]);
  const occupiedTimes = useMemo(
    () => new Set(savedSchedule?.schedule.map((item) => item.time) ?? []),
    [savedSchedule],
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
  const conflictImpacts = sortedEntries
    .map(({ item, scheduleIndex }) => {
      const candidateId = candidateIdByName.get(item.candidate);
      if (!candidateId) return null;
      const affectedPanel = item.panel
        .map((member, panelMemberIndex) => ({
          name: member.name,
          panelMemberIndex,
        }))
        .filter((member) =>
          biasedByInterviewer.get(member.name)?.has(candidateId),
        );
      const myConflictInOwnPanel =
        conflictSet.has(candidateId) &&
        item.panel.some((member) => member.name === currentUserName);
      if (affectedPanel.length === 0 && !myConflictInOwnPanel) return null;
      return {
        item,
        scheduleIndex,
        affectedPanel,
        myConflictInOwnPanel,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
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

  const timeOptionsForEdit = useMemo(() => {
    const currentTime =
      editingTimeIndex !== null
        ? savedSchedule.schedule[editingTimeIndex]?.time
        : null;
    return enabledTimeOptions.filter(
      (time) => time === currentTime || !occupiedTimes.has(time),
    );
  }, [editingTimeIndex, enabledTimeOptions, occupiedTimes, savedSchedule]);

  const beginTimeEdit = (scheduleIndex: number) => {
    const item = savedSchedule.schedule[scheduleIndex];
    if (!item) return;
    setEditingTimeIndex(scheduleIndex);
    setEditingTimeValue(String(item.time));
  };

  const confirmTimeEdit = async () => {
    if (editingTimeIndex === null || !editingTimeValue) return;

    setIsChangingTime(true);
    try {
      const didUpdate = await onChangeInterviewTime(
        editingTimeIndex,
        Number(editingTimeValue),
      );
      if (didUpdate) {
        setEditingTimeIndex(null);
        setEditingTimeValue("");
      }
    } finally {
      setIsChangingTime(false);
    }
  };

  const handleRerun = async () => {
    setIsRerunning(true);
    try {
      await onRerunWithConflicts();
    } finally {
      setIsRerunning(false);
    }
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
          <>
            {savedSchedule.is_distributed ? (
              <Chip tone="success">Distribuert</Chip>
            ) : (
              <Chip tone="muted">Utkast</Chip>
            )}
            {savedSchedule.schedule.some((item) => item.locked) && (
              <Chip tone="brand">
                {savedSchedule.schedule.filter((item) => item.locked).length}{" "}
                låst
              </Chip>
            )}
            {planSavedAt && (
              <Chip tone="success">Lagret kl. {planSavedAt}</Chip>
            )}
          </>
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
            className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-1.5")}
          >
            CSV
          </button>
        )}

        {isEditableDraft && myConflicts.length > 0 && (
          <button
            type="button"
            onClick={handleRerun}
            disabled={isRerunning}
            className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-1.5")}
          >
            {isRerunning ? "Kjører..." : "Kjør på nytt med KI"}
          </button>
        )}

        <span className="ml-auto text-detail text-text-muted">
          {displaySorted.length} intervjuer
          {namesVisible && myConflicts.length > 0 && (
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
                Eksporten blir en .ics-fil. Apple Calendar kan åpne den direkte,
                mens Google Calendar importerer via innstillinger.
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
                Ingen intervjuer funnet for <strong>{currentUserName}</strong>.
                Filteret matcher på navn.
              </div>
            )}

            {namesVisible && (
              <div className="border-b border-border-soft bg-brand-soft px-6 py-2.5 text-detail text-text-muted">
                Klikk på et kandidatnavn for å markere interessekonflikt (KI).
                KI flytter ikke planen automatisk; berørte intervjuer blir
                markert slik at admin kan bytte panelmedlem kontrollert.
              </div>
            )}

            {namesVisible && conflictImpacts.length > 0 && (
              <div className="border-b border-border-soft bg-surface-subtle px-6 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                    KI i distribuert plan
                  </span>
                  <Chip tone="brand">{conflictImpacts.length}</Chip>
                </div>
                <div className="grid gap-2">
                  {conflictImpacts.slice(0, 3).map((impact) => {
                    const firstAffected = impact.affectedPanel[0];
                    return (
                      <div
                        key={`${impact.item.time}-${impact.scheduleIndex}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-text-primary">
                          {formatTimeLabel(impact.item.time)} ·{" "}
                          {namesVisible ? impact.item.candidate : "Kandidat"}
                        </span>
                        <span className="text-text-muted">
                          {impact.affectedPanel.length > 0
                            ? `${impact.affectedPanel.map((p) => p.name).join(", ")} må vurderes`
                            : "Du er i panelet og har markert KI"}
                        </span>
                        {isAdmin && firstAffected && (
                          <button
                            type="button"
                            className={cn(
                              actionButtonBase,
                              actionButtonNeutral,
                              "px-3 py-1.5",
                            )}
                            onClick={() =>
                              setEditingPanelTarget({
                                scheduleIndex: impact.scheduleIndex,
                                panelMemberIndex:
                                  firstAffected.panelMemberIndex,
                              })
                            }
                          >
                            Bytt
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                      candidateId !== undefined && conflictSet.has(candidateId);
                    const isMyRow = item.panel.some(
                      (p) => p.name === currentUserName,
                    );
                    return (
                      <tr
                        key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                        className={cn(
                          "group border-b border-border-faint last:border-0",
                          isMyRow && !myInterviewsOnly && "bg-brand-soft",
                        )}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-text-muted group-hover:bg-surface-soft">
                          <div className="flex flex-col gap-1">
                            <span>{formatTimeLabel(item.time)}</span>
                            {isEditableDraft && (
                              <button
                                type="button"
                                className="self-start text-label font-bold uppercase tracking-label text-brand hover:text-brand-hover"
                                onClick={() => beginTimeEdit(scheduleIndex)}
                              >
                                Endre tid
                              </button>
                            )}
                          </div>
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
                          {item.locked && (
                            <span className="ml-2 rounded-full border border-border-soft bg-surface-subtle px-2 py-0.5 text-label font-bold uppercase tracking-label text-text-subtle">
                              Låst
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 group-hover:bg-surface-soft">
                          <div className="flex flex-wrap gap-1.5">
                            {item.panel.map((p, i) => {
                              const hasCoi =
                                isAdmin && candidateId
                                  ? (biasedByInterviewer
                                      .get(p.name)
                                      ?.has(candidateId) ?? false)
                                  : false;
                              return (
                                <button
                                  key={`${p.name}-${i}`}
                                  type="button"
                                  disabled={!isEditableDraft}
                                  onClick={() =>
                                    isEditableDraft &&
                                    beginReplacePanelMember(
                                      scheduleIndex,
                                      i,
                                      p.name,
                                    )
                                  }
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                                    isEditableDraft &&
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
                                  {hasCoi && (
                                    <span className="text-[9px]">⚠</span>
                                  )}
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

      {editingTimeIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-panel border border-border bg-surface-base p-5 shadow-lg">
            <h4 className="m-0 text-base font-bold text-text-primary">
              Endre tid
            </h4>
            <p className="mb-0 mt-2 text-ui text-text-muted">
              Velg en ledig tidsluke. Raden låses slik at senere
              optimaliseringer bevarer endringen.
            </p>
            <select
              className="mt-4 w-full rounded-xl border border-border-muted bg-surface-base px-3 py-2.5 text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
              value={editingTimeValue}
              onChange={(event) => setEditingTimeValue(event.target.value)}
            >
              {timeOptionsForEdit.map((time) => (
                <option key={time} value={time}>
                  {formatTimeLabel(time)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonNeutral)}
                onClick={() => setEditingTimeIndex(null)}
                disabled={isChangingTime}
              >
                Avbryt
              </button>
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonPrimary)}
                onClick={confirmTimeEdit}
                disabled={isChangingTime || !editingTimeValue}
              >
                {isChangingTime ? "Lagrer..." : "Lagre tid"}
              </button>
            </div>
          </div>
        </div>
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

export default SchedulePage;
