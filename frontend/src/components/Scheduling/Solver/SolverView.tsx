import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  Download,
  List,
  Pencil,
  Sparkles,
  Unlock,
} from "lucide-react";
import {
  Stepper,
  StatTile,
  ToggleCard,
  SegmentedControl,
  sectionLabelClass,
  SchedulePanel,
  SchedulePanelHeader,
  SchedulePanelBody,
  SchedulePanelFooter,
  Chip,
  EditablePanelChip,
  SaveButton,
  actionButtonBase,
  actionButtonPrimary,
  actionButtonNeutral,
  actionButtonDanger,
} from "../ui";
import type {
  Candidate,
  EnabledWindow,
  Interviewer,
  ScheduleItem,
  SolverOptions,
} from "../types";
import type { NameVisibility } from "../../../types";
import GridCalendarView from "../Calendar/GridCalendarView";
import {
  buildLockedAssignments,
  buildSolveBlocks,
  encodeScheduleTime,
  formatSlotLabel,
  generateIcs,
  parseSlotKey,
  slotsToSolverAvailability,
} from "../scheduleUtils";
import ConfirmDialog from "../ConfirmDialog";
import { useSaveSchedule, useSavedSchedule } from "../../../query/hooks";
import cn from "src/utils/cn";
import { escapeCsvCell } from "src/utils/methods";
import {
  CONFLICT_MESSAGE,
  DEFAULT_SOLVER_OPTIONS,
  PANEL_SIZE_MAX,
  PANEL_SIZE_MIN,
  PRIORITY_PRESETS,
  estimateSolverSeconds,
  hasSchedule,
  isConflictError,
  progressMessageFor,
  unplaceableSuggestion,
} from "./solverHelpers";
import { useSolveJob } from "./useSolveJob";
import InterviewerLoadView from "./InterviewerLoadView";
import EditTimeDrawer from "./EditTimeDrawer";
import ExportChooserModal from "./ExportChooserModal";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  admissionTitle: string;
  admissionSlug: string;
  startDate: string;
  endDate: string;
  enabledWindows: EnabledWindow[];
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  syntheticInput?: boolean;
  onNotify?: (message: string, tone?: "success" | "error") => void;
}

interface ReadinessChipProps {
  label: string;
  value: React.ReactNode;
  ok: boolean;
}

const ReadinessChip = ({ label, value, ok }: ReadinessChipProps) => (
  <span className="inline-flex items-baseline gap-1.5 text-ui">
    <span
      className={cn(
        "font-bold tabular-nums",
        ok ? "text-text-primary" : "text-brand",
      )}
    >
      {value}
    </span>
    <span className={ok ? "text-text-muted" : "font-semibold text-brand"}>
      {label}
    </span>
  </span>
);

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionTitle,
  admissionSlug,
  startDate,
  endDate,
  enabledWindows,
  enabledSlots,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  syntheticInput = false,
  onNotify,
}: Props) {
  const [panelSize, setPanelSize] = useState(3);
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [solverOptions, setSolverOptions] = useState<SolverOptions>(
    DEFAULT_SOLVER_OPTIONS,
  );
  const {
    loading,
    result,
    setResult,
    error,
    setError,
    planRevealed,
    setPlanRevealed,
    elapsedMs,
    solve,
    cancel,
    reset,
  } = useSolveJob(admissionSlug);

  const [viewType, setViewType] = useState<"list" | "calendar" | "person">(
    "list",
  );
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savingMode, setSavingMode] = useState<"distribute" | "unlock" | null>(
    null,
  );
  const [saveError, setSaveError] = useState("");
  const [distributeTick, setDistributeTick] = useState(0);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [isExportChooserOpen, setIsExportChooserOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [publishVisibility, setPublishVisibility] =
    useState<NameVisibility>("hidden");

  const { data: savedSchedule, error: savedScheduleError } =
    useSavedSchedule(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);
  const syncedRevisionRef = useRef<string | null>(null);
  const candidateSignature = useMemo(
    () =>
      candidates
        .map(({ id }) => id)
        .sort()
        .join("|"),
    [candidates],
  );

  useEffect(() => {
    if ([401, 403].includes(savedScheduleError?.response?.status ?? 0)) {
      reset();
      return;
    }
    if (!savedSchedule) return;

    const candidateIds = new Set(candidates.map(({ id }) => id));
    const candidateNameCounts = candidates.reduce((counts, candidate) => {
      counts.set(candidate.name, (counts.get(candidate.name) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const uniqueCandidateNames = new Set(
      candidates
        .filter((candidate) => candidateNameCounts.get(candidate.name) === 1)
        .map(({ name }) => name),
    );
    const isCurrentCandidate = (item: ScheduleItem) =>
      item.candidate_id
        ? candidateIds.has(item.candidate_id)
        : uniqueCandidateNames.has(item.candidate);
    const savedIsCurrent =
      savedSchedule.schedule.length > 0 &&
      savedSchedule.schedule.every(isCurrentCandidate);
    const resultIsCurrent = (result?.schedule ?? []).every(isCurrentCandidate);
    const firstSync = syncedRevisionRef.current === null;
    const revisionChanged =
      !firstSync && syncedRevisionRef.current !== savedSchedule.updated_at;

    if (firstSync) {
      syncedRevisionRef.current = savedSchedule.updated_at;
      if (result && !resultIsCurrent) reset();
      if (!result && savedIsCurrent) {
        setResult({
          status: "SUCCESS",
          schedule: savedSchedule.schedule,
          optimal: true,
          unplaceable: [],
          locked_conflicts: [],
        });
        setPlanRevealed(true);
      }
      return;
    }

    if (revisionChanged) {
      syncedRevisionRef.current = savedSchedule.updated_at;
      reset();
      if (savedIsCurrent) {
        setResult({
          status: "SUCCESS",
          schedule: savedSchedule.schedule,
          optimal: true,
          unplaceable: [],
          locked_conflicts: [],
        });
        setPlanRevealed(true);
      }
      return;
    }

    if (result && !resultIsCurrent) reset();
  }, [
    candidateSignature,
    candidates,
    reset,
    result,
    savedSchedule,
    savedScheduleError,
    setPlanRevealed,
    setResult,
  ]);

  const seededFromSavedRef = useRef(false);
  useEffect(() => {
    if (!savedSchedule || seededFromSavedRef.current) return;
    seededFromSavedRef.current = true;
    if (typeof savedSchedule.panel_size === "number") {
      setPanelSize(savedSchedule.panel_size);
    }
    if (savedSchedule.solver_options) {
      setSolverOptions({
        ...DEFAULT_SOLVER_OPTIONS,
        ...savedSchedule.solver_options,
      });
    }
  }, [savedSchedule]);

  const sortedEntries = useMemo(
    () =>
      (result?.schedule ?? [])
        .map((item, scheduleIndex) => ({ item, scheduleIndex }))
        .sort((a, b) => a.item.time - b.item.time),
    [result],
  );
  const sortedSchedule = useMemo(
    () => sortedEntries.map(({ item }) => item),
    [sortedEntries],
  );

  const interviewerByName = useMemo(
    () =>
      new Map(
        interviewers.map((interviewer) => [interviewer.name, interviewer]),
      ),
    [interviewers],
  );
  const interviewerOptions = useMemo(
    () => [...interviewers].sort((a, b) => a.name.localeCompare(b.name, "nb")),
    [interviewers],
  );
  const canEditDraft = !savedSchedule?.is_distributed;
  const lockedCount = useMemo(
    () => (result?.schedule ?? []).filter((item) => item.locked).length,
    [result],
  );

  const interviewerDistribution = useMemo(() => {
    const counts = new Map<
      string,
      { id: string; name: string; count: number; overtimeCount: number }
    >(
      interviewers.map((interviewer) => [
        interviewer.id,
        {
          id: interviewer.id,
          name: interviewer.name,
          count: 0,
          overtimeCount: 0,
        },
      ]),
    );

    sortedSchedule.forEach((item) => {
      item.panel.forEach((member) => {
        const key = member.id ?? `legacy:${member.name}`;
        const existing = counts.get(key) ?? {
          id: key,
          name: member.name,
          count: 0,
          overtimeCount: 0,
        };

        existing.count += 1;
        if (member.is_overtime) {
          existing.overtimeCount += 1;
        }

        counts.set(key, existing);
      });
    });

    return Array.from(counts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "nb");
    });
  }, [interviewers, sortedSchedule]);

  const totalAssignments = useMemo(
    () =>
      interviewerDistribution.reduce(
        (sum, interviewer) => sum + interviewer.count,
        0,
      ),
    [interviewerDistribution],
  );

  const candidateAlias = useMemo(() => {
    const map = new Map<string, string>();
    sortedSchedule.forEach((item) => {
      const key = item.candidate_id ?? `legacy:${item.candidate}`;
      if (!map.has(key)) {
        map.set(key, `Kandidat ${map.size + 1}`);
      }
    });
    (result?.unplaceable ?? []).forEach((entry) => {
      const key = entry.candidate_id ?? `legacy:${entry.candidate}`;
      if (!map.has(key)) {
        map.set(key, `Kandidat ${map.size + 1}`);
      }
    });
    return map;
  }, [sortedSchedule, result]);

  const displayCandidate = (candidate: {
    candidate_id?: string;
    candidate: string;
  }) =>
    candidateAlias.get(
      candidate.candidate_id ?? `legacy:${candidate.candidate}`,
    ) ?? candidate.candidate;

  const displaySchedule = useMemo(
    () =>
      sortedSchedule.map((item) => ({
        ...item,
        candidate: displayCandidate(item),
      })),
    [sortedSchedule, candidateAlias],
  );

  const unplaceableCandidates =
    result?.status === "PARTIAL" ? (result.unplaceable ?? []) : [];

  const unplaceableSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const entry of unplaceableCandidates) {
      const tip = unplaceableSuggestion(entry.reason);
      if (tip && !seen.has(tip)) {
        seen.add(tip);
        suggestions.push(tip);
      }
    }
    return suggestions;
  }, [unplaceableCandidates]);

  const overviewStats = useMemo(() => {
    if (!result || !hasSchedule(result.status)) return null;

    const overtimeAssignments = sortedSchedule.reduce(
      (sum, item) =>
        sum + item.panel.filter((member) => member.is_overtime).length,
      0,
    );

    const assignedInterviewers = interviewerDistribution.filter(
      (entry) => entry.count > 0,
    );
    const loads = assignedInterviewers.map((entry) => entry.count);
    const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;
    const minLoad = loads.length > 0 ? Math.min(...loads) : 0;

    return {
      totalInterviews: result.schedule.length,
      overtimeAssignments,
      maxLoad,
      minLoad,
      usedInterviewers: assignedInterviewers.length,
      totalInterviewers: interviewers.length,
    };
  }, [result, sortedSchedule, interviewerDistribution, interviewers.length]);

  const selectedPriorityPreset = useMemo(
    () =>
      PRIORITY_PRESETS.find(
        (preset) =>
          preset.overtimeWeight === solverOptions.overtime_weight &&
          preset.loadBalanceWeight === solverOptions.load_balance_weight,
      )?.key ?? "custom",
    [solverOptions.load_balance_weight, solverOptions.overtime_weight],
  );

  const settingsSummary = useMemo(() => {
    const presetLabel =
      selectedPriorityPreset === "custom"
        ? "Tilpasset"
        : (PRIORITY_PRESETS.find((p) => p.key === selectedPriorityPreset)
            ?.label ?? "Tilpasset");

    const flags: string[] = [];
    if (solverOptions.enforce_same_gender) flags.push("Samme kjønn");
    if (!solverOptions.same_panel_per_block) flags.push("Delt panel");
    if (solverOptions.allow_overtime) flags.push("Tillat overtid");
    if (solverOptions.prioritize_continuity) flags.push("Sammenhengende");

    return [presetLabel, ...flags].join(", ");
  }, [selectedPriorityPreset, solverOptions]);

  const formatSlotTime = (timeValue: number) =>
    formatSlotLabel(timeValue, dates, sessionDuration);

  const enabledTimeOptions = useMemo(() => {
    const times = new Set<number>();
    enabledSlots.forEach((key) => {
      const { date, minute } = parseSlotKey(key);
      if (!Number.isFinite(minute)) return;
      const dayIndex = dates.indexOf(date);
      if (dayIndex === -1) return;
      times.add(encodeScheduleTime(dayIndex, minute, sessionDuration));
    });
    return Array.from(times).sort((a, b) => a - b);
  }, [dates, enabledSlots, sessionDuration]);

  const occupiedTimes = useMemo(
    () => new Set((result?.schedule ?? []).map((item) => item.time)),
    [result],
  );

  const timeOptionsForEdit = useMemo(() => {
    const currentTime =
      editingTimeIndex !== null
        ? result?.schedule[editingTimeIndex]?.time
        : null;
    return enabledTimeOptions.filter(
      (time) => time === currentTime || !occupiedTimes.has(time),
    );
  }, [editingTimeIndex, enabledTimeOptions, occupiedTimes, result]);

  const updateScheduleItem = (
    scheduleIndex: number,
    updater: (item: ScheduleItem) => ScheduleItem,
  ) => {
    setResult((current) => {
      if (!current || !hasSchedule(current.status)) return current;
      return {
        ...current,
        schedule: current.schedule.map((item, index) =>
          index === scheduleIndex ? updater(item) : item,
        ),
      };
    });
    setIsDraftDirty(true);
  };

  const lockedAssignments = useMemo(
    () =>
      buildLockedAssignments(result?.schedule ?? [], candidates, interviewers),
    [candidates, interviewers, result],
  );

  const beginTimeEdit = (scheduleIndex: number) => {
    const item = result?.schedule[scheduleIndex];
    if (!item) return;
    setEditingTimeIndex(scheduleIndex);
    setEditingTimeValue(String(item.time));
  };

  const confirmTimeEdit = () => {
    if (editingTimeIndex === null || !editingTimeValue) return;
    const nextTime = Number(editingTimeValue);
    updateScheduleItem(editingTimeIndex, (item) => ({
      ...item,
      time: nextTime,
      locked: true,
    }));
    setEditingTimeIndex(null);
    setEditingTimeValue("");
  };

  const swapPanelMember = (
    scheduleIndex: number,
    panelMemberIndex: number,
    newName: string,
    newId?: string,
  ) => {
    const replacement =
      (newId
        ? interviewers.find((interviewer) => interviewer.id === newId)
        : undefined) ?? interviewerByName.get(newName);
    updateScheduleItem(scheduleIndex, (item) => {
      const replacementId = replacement?.id ?? newId;
      const isDuplicate = item.panel.some((member, index) => {
        if (index === panelMemberIndex) return false;
        if (replacementId && member.id) return member.id === replacementId;
        return member.name === newName;
      });
      if (isDuplicate) return item;
      return {
        ...item,
        locked: true,
        panel: item.panel.map((member, index) =>
          index === panelMemberIndex
            ? {
                ...member,
                id: replacement?.id ?? member.id,
                name: newName,
                is_overtime: replacement
                  ? !replacement.availability.includes(item.time)
                  : member.is_overtime,
              }
            : member,
        ),
      };
    });
  };

  const handleSolve = async () => {
    if (!readiness.ready) {
      setError(
        "Tidsoppsettet må ha nok intervjuere og åpne luker for hele panelet.",
      );
      return;
    }

    setSelectedInterviewer("");
    setPlanRevealed(Boolean(lockedAssignments.length));
    setIsDraftDirty(false);

    const blocks = buildSolveBlocks({
      dates,
      dayStartMinute,
      dayEndMinute,
      sessionDuration,
      chunkSize,
      chunkBreakMinutes,
    });

    const lockedIds = lockedAssignments.map((assignment) => ({
      candidate_id: assignment.candidate_id,
      time: assignment.time,
      panel: assignment.panel.map((member) => ({ id: member.id })),
    }));
    await solve(
      syntheticInput
        ? {
            admission_slug: admissionSlug,
            candidates,
            interviewers,
            panel_size: panelSize,
            all_slots: slotsToSolverAvailability(
              enabledSlots,
              dates,
              sessionDuration,
            ),
            blocks,
            options: solverOptions,
            synthetic: true,
            ...(lockedAssignments.length > 0
              ? { locked_assignments: lockedAssignments }
              : {}),
          }
        : {
            admission_slug: admissionSlug,
            candidates: candidates.map(({ id }) => ({ id })),
            interviewers: interviewers.map(({ id }) => ({ id })),
            panel_size: panelSize,
            options: solverOptions,
            ...(lockedIds.length > 0 ? { locked_assignments: lockedIds } : {}),
          },
    );
  };

  const getScheduleForExport = () => {
    const source = result?.schedule ?? savedSchedule?.schedule ?? [];
    const includeNames =
      !result && savedSchedule?.name_visibility === "committee";
    return source.map((item, index) => ({
      ...item,
      candidate: includeNames ? item.candidate : `Kandidat ${index + 1}`,
      candidate_id: undefined,
    }));
  };

  const handleExportIcs = (target: "apple" | "google") => {
    const schedule = getScheduleForExport();
    if (schedule.length === 0) return;

    const icsContent = generateIcs(
      schedule,
      dates,
      sessionDuration,
      admissionTitle,
    );
    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = admissionTitle.replace(/\s+/g, "-").toLowerCase();
    a.download = `intervjuplan-${base}-${target}.ics`;
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
    const schedule = getScheduleForExport();
    if (schedule.length === 0) return;

    const rows: string[][] = [["Tidspunkt", "Kandidat", "Panel"]];
    schedule.forEach((item) => {
      rows.push([
        formatSlotTime(item.time),
        item.candidate,
        item.panel.map((p) => p.name).join("; "),
      ]);
    });
    const csv = rows
      .map((row) => row.map((cell) => `"${escapeCsvCell(cell)}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "intervjuforslag.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePublish = async (nameVisibility: NameVisibility) => {
    const schedule = result?.schedule;
    if (!schedule || schedule.length === 0) return;
    if (unplaceableCandidates.length > 0) {
      const message =
        "Planen kan ikke publiseres før alle kandidater har fått et intervju.";
      setSaveError(message);
      onNotify?.(message, "error");
      return;
    }
    setIsSaving(true);
    setSavingMode("distribute");
    setSaveError("");
    try {
      await saveSchedule.mutateAsync({
        schedule,
        start_date: startDate,
        end_date: endDate,
        session_duration: sessionDuration,
        enabled_windows: enabledWindows,
        enabled_slots: Array.from(enabledSlots),
        day_start_minute: dayStartMinute,
        day_end_minute: dayEndMinute,
        chunk_size: chunkSize,
        chunk_break_minutes: chunkBreakMinutes,
        panel_size: panelSize,
        solver_options: solverOptions,
        is_distributed: true,
        name_visibility: nameVisibility,
        // Pin the revision we loaded so concurrent publishes surface as a
        // 409 conflict instead of silently clobbering each other.
        ...(savedSchedule
          ? { expected_updated_at: savedSchedule.updated_at }
          : {}),
      });
      setDistributeTick((tick) => tick + 1);
      setIsPublishDialogOpen(false);
      setIsDraftDirty(false);
      onNotify?.("Intervjuplanen er publisert for komiteen.");
    } catch (err) {
      if (isConflictError(err)) {
        setSaveError(CONFLICT_MESSAGE);
        onNotify?.(CONFLICT_MESSAGE, "error");
        setIsPublishDialogOpen(false);
      } else {
        setSaveError("Kunne ikke lagre planen. Prøv igjen.");
        onNotify?.("Kunne ikke lagre intervjuplanen.", "error");
      }
    } finally {
      setIsSaving(false);
      setSavingMode(null);
    }
  };

  const handleUnlock = async () => {
    if (!savedSchedule) return;
    setIsSaving(true);
    setSavingMode("unlock");
    setSaveError("");
    try {
      await saveSchedule.mutateAsync({
        is_distributed: false,
        expected_updated_at: savedSchedule.updated_at,
      });
      onNotify?.("Intervjuplan låst opp.");
    } catch (err) {
      const message = isConflictError(err)
        ? CONFLICT_MESSAGE
        : "Kunne ikke låse opp planen.";
      setSaveError(message);
      onNotify?.(message, "error");
    } finally {
      setIsSaving(false);
      setSavingMode(null);
      setIsUnlockDialogOpen(false);
    }
  };

  const updateSolverOption = <K extends keyof SolverOptions>(
    key: K,
    value: SolverOptions[K],
  ) => {
    setSolverOptions((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const toggleSolverOption = (
    key:
      | "enforce_same_gender"
      | "same_panel_per_block"
      | "allow_overtime"
      | "prioritize_continuity",
  ) => {
    updateSolverOption(key, !solverOptions[key]);
  };

  const applyPriorityPreset = (
    overtimeWeight: number,
    loadBalanceWeight: number,
  ) => {
    setSolverOptions((current) => ({
      ...current,
      overtime_weight: overtimeWeight,
      load_balance_weight: loadBalanceWeight,
    }));
  };

  const readiness = useMemo(() => {
    let submittedInterviewers = 0;
    let totalCapacity = 0;
    let conflictCount = 0;
    const coverageByTime = new Map<number, number>();
    for (const interviewer of interviewers) {
      if (interviewer.availability.length > 0) submittedInterviewers += 1;
      totalCapacity += interviewer.availability.length;
      conflictCount += interviewer.biased.length;
      for (const time of new Set(interviewer.availability)) {
        coverageByTime.set(time, (coverageByTime.get(time) ?? 0) + 1);
      }
    }
    const enabledSlotCount = enabledSlots.size;
    const enabledTimes = slotsToSolverAvailability(
      enabledSlots,
      dates,
      sessionDuration,
    );
    const slotsWithFullPanel = enabledTimes.filter(
      (time) => (coverageByTime.get(time) ?? 0) >= panelSize,
    ).length;
    const usableSlotCount = solverOptions.allow_overtime
      ? enabledTimes.length
      : slotsWithFullPanel;
    const neededCapacity = candidates.length * panelSize;
    const availabilityReady = solverOptions.allow_overtime
      ? true
      : submittedInterviewers >= panelSize &&
        slotsWithFullPanel >= candidates.length &&
        totalCapacity >= neededCapacity;
    const ready =
      candidates.length > 0 &&
      interviewers.length >= panelSize &&
      usableSlotCount >= candidates.length &&
      availabilityReady;

    return {
      ready,
      submittedInterviewers,
      enabledSlotCount,
      totalCapacity,
      neededCapacity,
      conflictCount,
      slotsWithFullPanel,
      usableSlotCount,
    };
  }, [
    candidates.length,
    dates,
    enabledSlots,
    interviewers,
    panelSize,
    sessionDuration,
    solverOptions.allow_overtime,
  ]);

  const estimatedSeconds = useMemo(
    () =>
      estimateSolverSeconds(
        candidates.length,
        interviewers.length,
        readiness.enabledSlotCount,
        panelSize,
        solverOptions.prioritize_continuity,
        solverOptions.max_solver_seconds,
      ),
    [
      candidates.length,
      interviewers.length,
      readiness.enabledSlotCount,
      panelSize,
      solverOptions.prioritize_continuity,
      solverOptions.max_solver_seconds,
    ],
  );
  const estimatedMs = estimatedSeconds * 1000;

  return (
    <div className="flex flex-col gap-3">
      <SchedulePanel>
        <SchedulePanelHeader
          icon={Sparkles}
          title="Generer intervjuforslag"
          description="Still inn regler, prioriteringer og panelstørrelse. Solveren foreslår en plan som du gjennomgår før du publiserer den for komiteen."
        />
        <SchedulePanelBody className="divide-y divide-border-soft p-0">
          <section className="px-6 py-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ReadinessChip
                label="kandidater"
                value={candidates.length}
                ok={candidates.length > 0}
              />
              <ReadinessChip
                label="intervjuere med tider"
                value={`${readiness.submittedInterviewers}/${interviewers.length}`}
                ok={
                  solverOptions.allow_overtime
                    ? interviewers.length >= panelSize
                    : readiness.submittedInterviewers >= panelSize
                }
              />
              <ReadinessChip
                label="brukbare tidsluker"
                value={readiness.usableSlotCount}
                ok={readiness.usableSlotCount >= candidates.length}
              />
              <ReadinessChip
                label="Inhabiliteter registrert"
                value={readiness.conflictCount}
                ok
              />
              <span className="ml-auto">
                <Chip tone={readiness.ready ? "success" : "brand"}>
                  {readiness.ready ? "Klar" : "Sjekk grunnlaget"}
                </Chip>
              </span>
            </div>
          </section>

          <section className="px-6 py-4">
            <button
              type="button"
              onClick={() => setSetupExpanded((prev) => !prev)}
              aria-expanded={setupExpanded}
              className="group flex w-full cursor-pointer items-center justify-between gap-4 text-left"
            >
              <div className="min-w-0">
                <span className={sectionLabelClass}>Innstillinger</span>
                <p className="m-0 truncate text-ui font-semibold text-text-primary">
                  {settingsSummary}
                </p>
              </div>
              <span className="flex flex-none items-center gap-1.5 text-detail font-semibold text-text-muted transition-colors group-hover:text-text-primary">
                {setupExpanded ? "Skjul" : "Tilpass"}
                <ChevronDown
                  size={16}
                  className={cn(
                    "transition-transform duration-200",
                    setupExpanded && "rotate-180",
                  )}
                />
              </span>
            </button>

            {setupExpanded && (
              <div className="mt-5 flex flex-col gap-5 animate-fade-in">
                <div>
                  <span className={sectionLabelClass}>Regler</span>
                  <div className="grid grid-cols-auto-card-lg gap-2">
                    <div className="flex flex-col gap-1.5">
                      <ToggleCard
                        title="Samme kjønn i panel"
                        description="Minst én intervjuer med samme kjønn som kandidaten."
                        checked={solverOptions.enforce_same_gender}
                        onToggle={() =>
                          toggleSolverOption("enforce_same_gender")
                        }
                      />
                      <p className="m-0 px-1 text-detail text-text-subtle">
                        Gjelder kun der kjønn er registrert i Abakus.
                      </p>
                    </div>
                    <ToggleCard
                      title="Samme panel i blokk"
                      description="Behold samme intervjuere gjennom sammenhengende intervjuer."
                      checked={solverOptions.same_panel_per_block}
                      onToggle={() =>
                        toggleSolverOption("same_panel_per_block")
                      }
                    />
                    <ToggleCard
                      title="Tillat overtid"
                      description="Bruk slotter utenfor tilgjengeligheten ved behov."
                      checked={solverOptions.allow_overtime}
                      onToggle={() => toggleSolverOption("allow_overtime")}
                    />
                    <ToggleCard
                      title="Fyll sammenhengende"
                      description="Prioriter mandag før tirsdag og unngå hull mellom intervjuer."
                      checked={solverOptions.prioritize_continuity}
                      onToggle={() =>
                        toggleSolverOption("prioritize_continuity")
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <span className="block text-detail font-medium text-text-muted">
                      Prioritering
                    </span>
                    {selectedPriorityPreset === "custom" && (
                      <span className="text-detail font-medium text-text-muted">
                        Tilpasset
                      </span>
                    )}
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Prioritering"
                    className="grid grid-cols-auto-card-md gap-2"
                  >
                    {PRIORITY_PRESETS.map((preset, index) => {
                      const active = selectedPriorityPreset === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() =>
                            applyPriorityPreset(
                              preset.overtimeWeight,
                              preset.loadBalanceWeight,
                            )
                          }
                          className={cn(
                            "group relative flex cursor-pointer flex-col gap-2 rounded-lg border px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                            active
                              ? "border-brand-activeBorder bg-brand-panel shadow-toggle"
                              : "border-border-soft bg-surface-base",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "inline-flex h-6 min-w-7 items-center justify-center rounded-full px-1.5 text-label font-bold tracking-badge tabular-nums",
                                active
                                  ? "bg-brand-fill text-brand"
                                  : "bg-surface-subtle text-text-muted",
                              )}
                            >
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span
                              aria-hidden="true"
                              className={cn(
                                "h-2.5 w-2.5 rounded-full border transition-colors",
                                active
                                  ? "border-brand bg-brand"
                                  : "border-border-muted bg-surface-base",
                              )}
                            />
                          </div>
                          <h4 className="m-0 text-sm font-bold text-text-primary">
                            {preset.label}
                          </h4>
                          <p className="m-0 text-detail leading-snug text-text-muted">
                            {preset.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>

          {(error ||
            result?.status === "INFEASIBLE" ||
            result?.status === "TIMEOUT" ||
            result?.status === "ERROR" ||
            result?.status === "LOCKED_CONFLICT") && (
            <section className="px-6 py-5">
              {error && (
                <div className="rounded-lg border border-brand-border bg-brand-muted px-4 py-3 text-ui font-semibold text-brand">
                  {error}
                </div>
              )}
              {result?.status === "ERROR" && (
                <div className="rounded-lg border border-brand-border bg-brand-muted px-4 py-3 text-ui font-semibold text-brand">
                  {result.error ??
                    "Solveren feilet på grunn av ugyldige innstillinger — juster vektene og prøv igjen."}
                </div>
              )}
              {result?.status === "INFEASIBLE" && (
                <div className="rounded-lg border border-border-soft bg-surface-muted px-5 py-6 text-center">
                  <h4 className="m-0 mb-2 text-sm font-bold text-text-primary">
                    Ingen løsning finnes
                  </h4>
                  <p className="m-0 mx-auto max-w-lg text-ui leading-relaxed text-text-subtle">
                    Begrensningene er for stramme. Prøv lavere panelstørrelse
                    eller åpne flere slots.
                  </p>
                </div>
              )}
              {result?.status === "TIMEOUT" && (
                <div className="rounded-lg border border-border-soft bg-surface-muted px-5 py-6 text-center">
                  <h4 className="m-0 mb-2 text-sm font-bold text-text-primary">
                    Solveren rakk ikke å bli ferdig
                  </h4>
                  <p className="m-0 mx-auto max-w-xl text-ui leading-relaxed text-text-subtle">
                    Tidsgrensen ble nådd uten at en plan ble funnet — det betyr
                    ikke at problemet er umulig. Prøv å kjøre på nytt, eller
                    forenkle ved å redusere panelstørrelse eller åpne flere
                    slots.
                  </p>
                </div>
              )}
              {result?.status === "LOCKED_CONFLICT" && (
                <div className="rounded-lg border border-brand-border bg-brand-muted px-5 py-4">
                  <h4 className="m-0 mb-2 text-sm font-bold text-brand">
                    Låst endring krasjer med inhabiliteter
                  </h4>
                  <p className="m-0 text-ui leading-relaxed text-text-muted">
                    En manuell endring er låst, men bryter med nye
                    interessekonflikter eller harde begrensninger. Endre raden
                    manuelt, eller fjern låsen ved å generere planen på nytt
                    uten å bevare den.
                  </p>
                </div>
              )}
            </section>
          )}
        </SchedulePanelBody>

        {loading && (
          <div className="border-t border-border-soft bg-surface-muted/40 px-6 py-3">
            <div
              role="progressbar"
              aria-label="Genererer plan"
              aria-valuenow={Math.round(
                Math.min(95, (elapsedMs / Math.max(estimatedMs, 1)) * 100),
              )}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
                style={{
                  width: `${Math.min(
                    95,
                    (elapsedMs / Math.max(estimatedMs, 1)) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-detail text-text-muted">
              <span className="italic" aria-live="polite">
                {progressMessageFor(elapsedMs, estimatedMs)}
              </span>
              <span className="font-bold text-text-primary tabular-nums">
                {(elapsedMs / 1000).toFixed(1)}s / ~{estimatedSeconds}s
              </span>
            </div>
          </div>
        )}

        <SchedulePanelFooter>
          <label className="flex items-center gap-2 text-ui text-text-muted">
            <span className="font-semibold text-text-primary">Panel</span>
            <Stepper
              value={panelSize}
              min={PANEL_SIZE_MIN}
              max={PANEL_SIZE_MAX}
              onStep={setPanelSize}
              aria-label="Panelstørrelse"
            />
            <span className="text-detail text-text-subtle">
              intervjuere per kandidat
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!loading && lockedCount > 0 && (
              <Chip tone="brand">
                {lockedCount} låst{lockedCount === 1 ? "" : "e"} beholdes
              </Chip>
            )}
            {loading && (
              <button
                type="button"
                className={cn(actionButtonBase, actionButtonNeutral)}
                onClick={cancel}
              >
                Avbryt
              </button>
            )}
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonPrimary)}
              onClick={handleSolve}
              disabled={loading || !readiness.ready}
              title={
                lockedCount > 0
                  ? "Genererer planen på nytt og beholder de manuelt låste radene."
                  : undefined
              }
            >
              <Sparkles
                size={14}
                className={loading ? "animate-pulse" : undefined}
              />
              {loading
                ? "Optimaliserer…"
                : lockedCount > 0
                  ? "Generer på nytt"
                  : "Generer plan"}
            </button>
          </div>
        </SchedulePanelFooter>
      </SchedulePanel>

      {unplaceableCandidates.length > 0 && (
        <div className="rounded-panel border border-brand-border bg-brand-muted px-5 py-4 animate-fade-in">
          <h4 className="m-0 mb-1 text-sm font-bold text-brand">
            {unplaceableCandidates.length} kandidat
            {unplaceableCandidates.length === 1 ? "" : "er"} fikk ikke plass
          </h4>
          <p className="m-0 mb-3 max-w-prose text-ui leading-relaxed text-text-muted">
            Resten av planen er fylt, men disse fikk ingen gyldig tid med
            tilgjengelige intervjuere.
          </p>
          {unplaceableSuggestions.length > 0 && (
            <ul className="m-0 mb-3 flex max-w-prose list-disc flex-col gap-1 pl-5 text-ui leading-relaxed text-text-muted">
              {unplaceableSuggestions.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {unplaceableCandidates.map((entry) => (
              <li
                key={entry.candidate_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <Chip tone="brand">{displayCandidate(entry)}</Chip>
                {entry.reason && (
                  <span className="text-detail text-text-muted">
                    {entry.reason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasSchedule(result?.status) && overviewStats && (
        <SchedulePanel className="animate-fade-in">
          <SchedulePanelHeader
            title="Oversikt over plan"
            description="Gjennomgå effekten før du publiserer planen."
            chips={
              <>
                {result?.status === "PARTIAL" ? (
                  <Chip tone="brand">Delvis</Chip>
                ) : (
                  <Chip tone="success">Ferdig</Chip>
                )}
                <Chip tone={result?.optimal ? "success" : "muted"}>
                  {result?.optimal ? "Optimal" : "Beste innen tidsgrense"}
                </Chip>
              </>
            }
          />
          <SchedulePanelBody>
            <div className="grid grid-cols-auto-card-sm gap-2">
              <StatTile
                label="Intervjuer"
                value={overviewStats.totalInterviews}
                hint={`${overviewStats.usedInterviewers} av ${overviewStats.totalInterviewers} brukt`}
              />
              <StatTile
                label="Overtidstildelinger"
                value={overviewStats.overtimeAssignments}
                hint={
                  overviewStats.overtimeAssignments === 0
                    ? "Ingen utenfor tilgjengelighet"
                    : "Utenfor tilgjengelighet"
                }
                tone={
                  overviewStats.overtimeAssignments > 0 ? "warn" : "neutral"
                }
              />
              <StatTile
                label="Mest belastet"
                value={overviewStats.maxLoad}
                hint="intervjuer hos én person"
              />
              <StatTile
                label="Minst belastet"
                value={overviewStats.minLoad}
                hint="intervjuer hos én person"
              />
            </div>
          </SchedulePanelBody>

          {editingTimeIndex !== null && (
            <EditTimeDrawer
              value={editingTimeValue}
              onChange={setEditingTimeValue}
              options={timeOptionsForEdit.map((time) => ({
                value: String(time),
                label: formatSlotTime(time),
              }))}
              onConfirm={confirmTimeEdit}
              onClose={() => setEditingTimeIndex(null)}
            />
          )}
        </SchedulePanel>
      )}

      {hasSchedule(result?.status) && planRevealed && (
        <SchedulePanel className="animate-fade-in">
          <SchedulePanelHeader
            title="Generert intervjuplan"
            description={
              savedSchedule && !savedSchedule.is_distributed
                ? "Synlig kun for admins her. Kladden lagres bare i denne fanen, så publiser når du er klar."
                : "Gjennomgå planen før du publiserer den for komiteen."
            }
            chips={
              savedSchedule && !savedSchedule.is_distributed ? (
                <Chip tone="brand">Kladd</Chip>
              ) : null
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setIsExportChooserOpen(true)}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-soft bg-surface-base text-text-muted transition-colors hover:border-border-quiet hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring"
                  title="Eksporter"
                  aria-label="Eksporter"
                >
                  <Download size={15} aria-hidden="true" />
                </button>
                <SegmentedControl
                  aria-label="Visning av generert intervjuplan"
                  value={viewType}
                  onChange={setViewType}
                  items={[
                    {
                      key: "list",
                      icon: <List size={16} aria-hidden="true" />,
                      title: "Liste-visning",
                    },
                    {
                      key: "calendar",
                      icon: <Calendar size={16} aria-hidden="true" />,
                      title: "Kalender-visning",
                    },
                    { key: "person", label: "Person", title: "Personvisning" },
                  ]}
                />
              </>
            }
          />
          <SchedulePanelBody>
            {viewType === "person" ? (
              <InterviewerLoadView
                entries={sortedEntries}
                distribution={interviewerDistribution}
                totalAssignments={totalAssignments}
                selectedInterviewer={selectedInterviewer}
                onSelectInterviewer={setSelectedInterviewer}
                canEditDraft={canEditDraft}
                interviewerOptions={interviewerOptions}
                onSwapPanelMember={swapPanelMember}
                displayCandidate={displayCandidate}
                formatSlotTime={formatSlotTime}
              />
            ) : viewType === "list" ? (
              <div className="overflow-x-auto rounded-lg border border-border-soft">
                <table className="w-full min-w-schedule-table border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                        Tidspunkt
                      </th>
                      <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                        Kandidat
                      </th>
                      <th className="bg-surface-subtle px-4 py-3 text-left text-ui font-semibold text-text-muted">
                        Intervjupanel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map(({ item, scheduleIndex }) => {
                      const isRowEditing = editingTimeIndex === scheduleIndex;
                      return (
                        <tr
                          key={`${item.candidate}-${item.time}-${scheduleIndex}`}
                          title={
                            item.locked
                              ? "Manuell endring, beholdes når planen genereres på nytt"
                              : undefined
                          }
                          className={cn(
                            "group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint",
                            isRowEditing
                              ? "[&>td]:bg-brand-soft"
                              : "hover:[&>td]:bg-surface-soft",
                          )}
                        >
                          <td
                            className={cn(
                              "w-schedule-name whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted",
                              item.locked && "border-l-2 border-l-brand",
                            )}
                          >
                            {canEditDraft ? (
                              <button
                                type="button"
                                onClick={() => beginTimeEdit(scheduleIndex)}
                                className="group/time -mx-2 -my-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-brand-soft hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
                                title="Endre tid"
                              >
                                <span>{formatSlotTime(item.time)}</span>
                                <Pencil
                                  size={11}
                                  aria-hidden="true"
                                  className="opacity-0 transition-opacity duration-150 group-hover/time:opacity-100 group-focus-visible/time:opacity-100"
                                />
                              </button>
                            ) : (
                              <span>{formatSlotTime(item.time)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                            {displayCandidate(item)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex flex-wrap gap-1.5">
                              {item.panel.map((p, i) => (
                                <EditablePanelChip
                                  key={i}
                                  label={p.name}
                                  tone={p.is_overtime ? "overtime" : "neutral"}
                                  options={
                                    canEditDraft
                                      ? interviewerOptions.map((iv) => ({
                                          id: iv.id,
                                          name: iv.name,
                                          disabled:
                                            iv.name !== p.name &&
                                            item.panel.some(
                                              (m) => m.name === iv.name,
                                            ),
                                        }))
                                      : undefined
                                  }
                                  onSelect={
                                    canEditDraft
                                      ? (newName, newId) =>
                                          swapPanelMember(
                                            scheduleIndex,
                                            i,
                                            newName,
                                            newId,
                                          )
                                      : undefined
                                  }
                                  title={
                                    canEditDraft
                                      ? `Bytt intervjuer${
                                          p.is_overtime
                                            ? " — utenfor registrert tilgjengelighet"
                                            : ""
                                        }`
                                      : p.is_overtime
                                        ? "Utenfor registrert tilgjengelighet"
                                        : undefined
                                  }
                                />
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <GridCalendarView
                schedule={displaySchedule}
                dates={dates}
                sessionDuration={sessionDuration}
                dayStartMinute={dayStartMinute}
                dayEndMinute={dayEndMinute}
                chunkSize={chunkSize}
                chunkBreakMinutes={chunkBreakMinutes}
              />
            )}
          </SchedulePanelBody>
          <SchedulePanelFooter>
            <div className="flex flex-wrap items-center gap-3 text-detail">
              {saveError && (
                <span className="font-semibold text-brand">{saveError}</span>
              )}
              {isDraftDirty && (
                <span className="font-semibold italic text-text-faded">
                  Ulagrede endringer
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {savedSchedule?.is_distributed ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <Chip tone="success">Publisert</Chip>
                    <button
                      type="button"
                      className={cn(actionButtonBase, actionButtonDanger)}
                      onClick={() => setIsUnlockDialogOpen(true)}
                      disabled={isSaving}
                      title="Åpner planen for redigering og skjuler den for komiteen til den publiseres på nytt."
                    >
                      <Unlock size={14} />
                      Lås opp for å redigere
                    </button>
                  </div>
                  <p className="m-0 max-w-md text-right text-detail text-text-subtle">
                    Planen er låst og synlig for komiteen.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <SaveButton
                      isSaving={savingMode === "distribute"}
                      saveTick={distributeTick}
                      savedLabel="Publisert"
                      onClick={() => {
                        setPublishVisibility(
                          savedSchedule?.name_visibility ?? "hidden",
                        );
                        setIsPublishDialogOpen(true);
                      }}
                      disabled={isSaving && savingMode !== "distribute"}
                      title="Låser planen og gjør den synlig for komiteen. Du kan låse opp senere for å redigere."
                    >
                      Publiser
                    </SaveButton>
                  </div>
                </>
              )}
            </div>
          </SchedulePanelFooter>
        </SchedulePanel>
      )}

      {isExportChooserOpen && (
        <ExportChooserModal
          onExportIcs={handleExportIcs}
          onExportCsv={handleExportCsv}
          onClose={() => setIsExportChooserOpen(false)}
        />
      )}

      {isPublishDialogOpen && (
        <ConfirmDialog
          title="Publiser intervjuplan"
          confirmLabel={isSaving ? "Publiserer…" : "Publiser"}
          onConfirm={() => handlePublish(publishVisibility)}
          onClose={() => setIsPublishDialogOpen(false)}
          busy={isSaving}
        >
          <p className="m-0">
            Planen låses og blir synlig for komiteen. Velg hvem som skal se
            kandidatnavnene.
          </p>
          <div className="mt-3">
            <span className={sectionLabelClass}>Kandidatnavn</span>
            <SegmentedControl<NameVisibility>
              aria-label="Synlighet for kandidatnavn"
              value={publishVisibility}
              onChange={setPublishVisibility}
              items={[
                { key: "hidden", label: "Skjult" },
                { key: "admin_only", label: "Opptaksansvarlige" },
                { key: "committee", label: "Hele komiteen" },
              ]}
            />
          </div>
        </ConfirmDialog>
      )}

      {isUnlockDialogOpen && (
        <ConfirmDialog
          title="Lås opp intervjuplan"
          tone="danger"
          icon={<Unlock size={18} />}
          confirmLabel={isSaving ? "Låser opp…" : "Lås opp"}
          onConfirm={handleUnlock}
          onClose={() => setIsUnlockDialogOpen(false)}
          busy={isSaving}
        >
          <p className="m-0">
            Planen åpnes for redigering og skjules for komiteen til du
            publiserer på nytt.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
