import React, { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
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
  actionButtonBase,
  actionButtonPrimary,
  actionButtonNeutral,
  actionButtonActive,
} from "../ui";
import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SolverOptions,
} from "../types";
import { apiClient } from "../../../utils/callApi";
import SolverCalendarView from "./SolverCalendarView";
import Icon from "../../Icon";
import {
  decodeScheduleTime,
  formatDateHeader,
  generateIcs,
} from "../scheduleUtils";
import { useSaveSchedule, useSavedSchedule } from "../../../query/hooks";
import cn from "src/utils/cn";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  admissionTitle: string;
  admissionSlug: string;
  startDate: string;
  endDate: string;
  enabledSlots: Set<string>;
  dayStartMinute: number;
  dayEndMinute: number;
  chunkSize: number;
  chunkBreakMinutes: number;
  onNotify?: (message: string, tone?: "success" | "error") => void;
}

interface SolveResponse {
  status: "SUCCESS" | "INFEASIBLE";
  schedule: ScheduleItem[];
}

const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  enforce_same_gender: true,
  allow_overtime: true,
  overtime_weight: 100,
  load_balance_weight: 1,
  max_solver_seconds: 10,
};

const PRIORITY_PRESETS = [
  {
    key: "protect-availability",
    label: "Minimer overtid",
    description:
      "Respekter tilgjengeligheten selv om noen får flere intervjuer.",
    overtimeWeight: 100,
    loadBalanceWeight: 1,
  },
  {
    key: "balanced",
    label: "Balansert",
    description: "Vei overtid og fordeling omtrent likt.",
    overtimeWeight: 40,
    loadBalanceWeight: 4,
  },
  {
    key: "protect-load",
    label: "Jevn fordeling",
    description:
      "Alle får like mange intervjuer, men på bekostning av overtid når man egentlig ikke er tilgjengelig",
    overtimeWeight: 12,
    loadBalanceWeight: 8,
  },
] as const;

const PANEL_SIZE_MIN = 1;
const PANEL_SIZE_MAX = 5;

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionTitle,
  admissionSlug,
  startDate,
  endDate,
  enabledSlots,
  dayStartMinute,
  dayEndMinute,
  chunkSize,
  chunkBreakMinutes,
  onNotify,
}: Props) {
  const [panelSize, setPanelSize] = useState(3);
  const [solverOptions, setSolverOptions] = useState<SolverOptions>(
    DEFAULT_SOLVER_OPTIONS,
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [error, setError] = useState("");
  const [viewType, setViewType] = useState<"list" | "calendar" | "person">(
    "list",
  );
  const [selectedInterviewer, setSelectedInterviewer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [planRevealed, setPlanRevealed] = useState(false);
  const [namesRevealed, setNamesRevealed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const start = performance.now();
    const tick = window.setInterval(() => {
      setElapsedMs(performance.now() - start);
    }, 100);
    return () => window.clearInterval(tick);
  }, [loading]);

  const { data: savedSchedule, refetch: refetchSaved } =
    useSavedSchedule(admissionSlug);
  const saveSchedule = useSaveSchedule(admissionSlug);

  const sortedSchedule = useMemo(
    () => [...(result?.schedule ?? [])].sort((a, b) => a.time - b.time),
    [result],
  );

  const interviewerDistribution = useMemo(() => {
    const counts = new Map(
      interviewers.map((interviewer) => [
        interviewer.name,
        { name: interviewer.name, count: 0, overtimeCount: 0 },
      ]),
    );

    sortedSchedule.forEach((item) => {
      item.panel.forEach((member) => {
        const existing = counts.get(member.name) ?? {
          name: member.name,
          count: 0,
          overtimeCount: 0,
        };

        existing.count += 1;
        if (member.is_overtime) {
          existing.overtimeCount += 1;
        }

        counts.set(member.name, existing);
      });
    });

    return Array.from(counts.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "nb");
    });
  }, [interviewers, sortedSchedule]);

  const selectedInterviewerSchedule = useMemo(() => {
    if (!selectedInterviewer) {
      return [];
    }

    return sortedSchedule.filter((item) =>
      item.panel.some((member) => member.name === selectedInterviewer),
    );
  }, [selectedInterviewer, sortedSchedule]);

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
      if (!map.has(item.candidate)) {
        map.set(item.candidate, `Kandidat ${map.size + 1}`);
      }
    });
    return map;
  }, [sortedSchedule]);

  const displayCandidate = (name: string) =>
    namesRevealed ? name : (candidateAlias.get(name) ?? name);

  const displaySchedule = useMemo(
    () =>
      sortedSchedule.map((item) => ({
        ...item,
        candidate: displayCandidate(item.candidate),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortedSchedule, namesRevealed, candidateAlias],
  );

  const overviewStats = useMemo(() => {
    if (!result || result.status !== "SUCCESS") return null;

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

  const formatSlotTime = (timeValue: number) => {
    const { dayIndex, minute } = decodeScheduleTime(timeValue, sessionDuration);
    const date = dates[dayIndex];
    const hour = Math.floor(minute / 60);
    const minutePart = minute % 60;
    const timeLabel = `${hour.toString().padStart(2, "0")}:${minutePart
      .toString()
      .padStart(2, "0")}`;
    if (!date) return `Dag ${dayIndex + 1} ${timeLabel}`;
    const { weekday, dayMonth } = formatDateHeader(date);
    return `${weekday} ${dayMonth} ${timeLabel}`;
  };

  const handleSolve = async () => {
    if (candidates.length === 0 || interviewers.length === 0) {
      setError("Legg til minst én kandidat og én intervjuer.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSelectedInterviewer("");
    setPlanRevealed(false);
    setNamesRevealed(false);

    try {
      const payload = {
        candidates,
        interviewers,
        panel_size: panelSize,
        options: solverOptions,
      };
      const response = await apiClient.post("/solve/", payload);
      setResult(response.data);
    } catch (err) {
      console.error(err);
      setError("Kunne ikke koble til serveren. Er backend oppe?");
    } finally {
      setLoading(false);
    }
  };

  const handleExportIcs = () => {
    const schedule = result?.schedule ?? savedSchedule?.schedule ?? [];
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
    a.download = `intervjuplan-${admissionTitle.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async (distribute: boolean) => {
    const schedule = result?.schedule;
    if (!schedule || schedule.length === 0) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await saveSchedule.mutateAsync({
        schedule,
        start_date: startDate,
        end_date: endDate,
        session_duration: sessionDuration,
        enabled_slots: Array.from(enabledSlots),
        day_start_minute: dayStartMinute,
        day_end_minute: dayEndMinute,
        chunk_size: chunkSize,
        chunk_break_minutes: chunkBreakMinutes,
        is_distributed: distribute,
        // Candidate name sharing is managed from Intervjuplan.
        show_candidate_names: savedSchedule?.show_candidate_names ?? false,
      });
      await refetchSaved();
      onNotify?.(
        distribute ? "Intervjuplan distribuert." : "Intervjuplan lagret.",
      );
    } catch {
      setSaveError("Kunne ikke lagre planen. Prøv igjen.");
      onNotify?.("Kunne ikke lagre intervjuplanen.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!savedSchedule) return;
    setIsSaving(true);
    setSaveError("");
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
        is_distributed: false,
        show_candidate_names: savedSchedule.show_candidate_names,
      });
      await refetchSaved();
      onNotify?.("Intervjuplan låst opp.");
    } catch {
      setSaveError("Kunne ikke låse opp planen.");
      onNotify?.("Kunne ikke låse opp intervjuplanen.", "error");
    } finally {
      setIsSaving(false);
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
    key: "enforce_same_gender" | "allow_overtime",
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

  return (
    <div className="flex flex-col gap-3">
      <SchedulePanel>
        <SchedulePanelHeader
          icon={Sparkles}
          eyebrow="Admin · Solver"
          title="Generer intervjuforslag"
          description="Still inn regler, prioriteringer og panelstørrelse. Solveren foreslår en plan som du kan distribuere."
        />
        <SchedulePanelBody className="divide-y divide-border-soft p-0">
          <section className="px-6 py-5">
            <span className={sectionLabelClass}>Regler</span>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
              <ToggleCard
                title="Samme kjønn i panel"
                description="Minst én matchende intervjuer i hvert panel."
                checked={solverOptions.enforce_same_gender}
                onToggle={() => toggleSolverOption("enforce_same_gender")}
              />
              <ToggleCard
                title="Tillat overtid"
                description="Bruk slotter utenfor tilgjengeligheten ved behov."
                checked={solverOptions.allow_overtime}
                onToggle={() => toggleSolverOption("allow_overtime")}
              />
            </div>
          </section>

          <section className="px-6 py-5">
            <div className="mb-2 flex items-end justify-between gap-3">
              <span className="block text-label font-bold uppercase tracking-label text-text-subtle">
                Prioritering
              </span>
              {selectedPriorityPreset === "custom" && (
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  Tilpasset
                </span>
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="Prioritering"
              className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2"
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
                      "group relative flex cursor-pointer flex-col gap-2 rounded-[10px] border px-4 py-3 text-left transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-brand-strongBorder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                      active
                        ? "border-brand-activeBorder bg-brand-panel shadow-toggle"
                        : "border-border-soft bg-surface-base",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full px-1.5 text-[0.68rem] font-bold tracking-badge tabular-nums",
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
          </section>

          <section className="px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <span className={sectionLabelClass}>Panelstørrelse</span>
                <p className="m-0 mt-1 text-detail leading-snug text-text-muted">
                  Antall intervjuere per kandidat.
                </p>
              </div>
              <Stepper
                value={panelSize}
                min={PANEL_SIZE_MIN}
                max={PANEL_SIZE_MAX}
                onStep={setPanelSize}
                aria-label="Panelstørrelse"
              />
            </div>
          </section>

          {(error || result?.status === "INFEASIBLE") && (
            <section className="px-6 py-5">
              {error && (
                <div className="rounded-lg border border-brand-border bg-brand-muted px-4 py-3 text-ui font-semibold text-brand">
                  {error}
                </div>
              )}
              {result?.status === "INFEASIBLE" && (
                <div className="rounded-lg border border-border-soft bg-surface-muted px-5 py-6 text-center">
                  <h4 className="m-0 mb-2 text-sm font-bold text-text-primary">
                    Ingen løsning funnet
                  </h4>
                  <p className="m-0 mx-auto max-w-[32rem] text-ui leading-relaxed text-text-subtle">
                    Begrensningene er for stramme. Prøv lavere panelstørrelse
                    eller åpne flere slots.
                  </p>
                </div>
              )}
            </section>
          )}
        </SchedulePanelBody>

        <SchedulePanelFooter>
          <div className="flex flex-wrap items-center gap-4 text-detail text-text-muted">
            <span>
              <span className="font-bold text-text-primary">
                {candidates.length}
              </span>{" "}
              kandidater
            </span>
            <span>
              <span className="font-bold text-text-primary">
                {interviewers.length}
              </span>{" "}
              intervjuere
            </span>
          </div>
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonPrimary)}
            onClick={handleSolve}
            disabled={loading}
          >
            <Sparkles size={14} />
            {loading ? "Optimaliserer..." : "Generer plan"}
          </button>
        </SchedulePanelFooter>
      </SchedulePanel>

      {loading &&
        (() => {
          const maxMs = solverOptions.max_solver_seconds * 1000;
          const progressPercent = Math.min(
            95,
            (elapsedMs / Math.max(maxMs, 1)) * 100,
          );
          return (
            <SchedulePanel className="animate-[fade-in_0.25s_ease-out]">
              <SchedulePanelBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-muted text-brand ring-1 ring-brand-border/60"
                      aria-hidden="true"
                    >
                      <Sparkles size={16} className="animate-pulse" />
                    </span>
                    <div>
                      <h3 className="m-0 text-sm font-bold text-text-primary">
                        Optimaliserer intervjuplan
                      </h3>
                      <p className="m-0 mt-0.5 text-detail text-text-muted">
                        Solveren vurderer kombinasjoner av paneler og tidspunkt.
                      </p>
                    </div>
                  </div>
                  <span className="text-ui font-bold tabular-nums text-text-primary">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div
                  className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={Math.round(progressPercent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-200 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progressPercent >= 95 && (
                  <p className="m-0 mt-3 text-detail text-text-muted">
                    Ferdigstiller løsningen …
                  </p>
                )}
              </SchedulePanelBody>
            </SchedulePanel>
          );
        })()}

      {result?.status === "SUCCESS" && overviewStats && (
        <SchedulePanel className="animate-[fade-in_0.25s_ease-out]">
          <SchedulePanelHeader
            eyebrow="Resultat · Oversikt"
            title="Oversikt over plan"
            description="Forhåndsvis effekten før du lagrer eller distribuerer."
            chips={<Chip tone="success">Ferdig</Chip>}
          />
          <SchedulePanelBody>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
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
          <SchedulePanelFooter>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPlanRevealed((current) => !current)}
                className={cn(
                  actionButtonBase,
                  planRevealed ? actionButtonNeutral : actionButtonPrimary,
                )}
              >
                {planRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                {planRevealed ? "Skjul intervjuplan" : "Vis intervjuplan"}
              </button>
              {planRevealed && (
                <button
                  type="button"
                  onClick={() => setNamesRevealed((current) => !current)}
                  className={cn(
                    actionButtonBase,
                    namesRevealed ? actionButtonActive : actionButtonNeutral,
                  )}
                >
                  {namesRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  {namesRevealed ? "Skjul kandidatnavn" : "Vis kandidatnavn"}
                </button>
              )}
            </div>
            {!planRevealed && (
              <span className="text-detail text-text-muted">
                Planen og kandidatnavn er skjult til du åpner dem.
              </span>
            )}
          </SchedulePanelFooter>
        </SchedulePanel>
      )}

      {result?.status === "SUCCESS" && planRevealed && (
        <SchedulePanel className="animate-[fade-in_0.25s_ease-out]">
          <SchedulePanelHeader
            eyebrow="Resultat · Plan"
            title="Generert intervjuplan"
            description="Gjennomgå før du lagrer eller distribuerer til intervjuerne."
            chips={
              <>
                <Chip tone="brand">{result.schedule.length} intervjuer</Chip>
                {!namesRevealed && (
                  <Chip tone="muted" icon={<EyeOff size={11} />}>
                    Navn skjult
                  </Chip>
                )}
              </>
            }
            actions={
              <SegmentedControl
                value={viewType}
                onChange={setViewType}
                items={[
                  {
                    key: "list",
                    icon: <Icon name="list" size="1.2rem" prefix="ios" />,
                    title: "Liste-visning",
                  },
                  {
                    key: "calendar",
                    icon: <Icon name="calendar" size="1.2rem" prefix="ios" />,
                    title: "Kalender-visning",
                  },
                  { key: "person", label: "Person", title: "Personvisning" },
                ]}
              />
            }
          />
          <SchedulePanelBody>
            {viewType === "person" ? (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <div className="flex flex-col gap-1">
                    <label
                      className="text-label font-bold uppercase tracking-label text-text-subtle"
                      htmlFor="interviewer-filter"
                    >
                      Velg intervjuer
                    </label>
                    <select
                      id="interviewer-filter"
                      className="min-w-56 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                      value={selectedInterviewer}
                      onChange={(event) =>
                        setSelectedInterviewer(event.target.value)
                      }
                    >
                      <option value="">Velg en person</option>
                      {interviewerDistribution.map((interviewer) => (
                        <option key={interviewer.name} value={interviewer.name}>
                          {interviewer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="mb-[0.6rem] flex flex-wrap items-baseline justify-between gap-3">
                    <span className="mb-1 block text-label font-bold uppercase tracking-label text-text-subtle">
                      Fordeling
                    </span>
                    <p className="m-0 text-ui text-text-subtle">
                      Klikk på en person for å åpne intervjuene deres.
                    </p>
                  </div>

                  <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-[0.6rem]">
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-surface-base px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder hover:bg-brand-soft"
                    >
                      <span className="text-ui font-bold text-text-primary">
                        Alle intervjuere
                      </span>
                      <span className="block text-xl font-extrabold text-text-primary">
                        {totalAssignments}
                      </span>
                      <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                        Totale tildelinger
                      </span>
                    </button>

                    {interviewerDistribution.map((interviewer) => (
                      <button
                        key={interviewer.name}
                        type="button"
                        className={cn(
                          "rounded-lg border px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder",
                          selectedInterviewer === interviewer.name
                            ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
                            : "border-border bg-surface-base hover:bg-brand-soft",
                        )}
                        onClick={() => setSelectedInterviewer(interviewer.name)}
                      >
                        <span className="text-ui font-bold text-text-primary">
                          {interviewer.name}
                        </span>
                        <span className="block text-xl font-extrabold text-text-primary">
                          {interviewer.count}
                        </span>
                        <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                          {interviewer.overtimeCount > 0
                            ? `${interviewer.overtimeCount} overtid`
                            : "Ingen overtid"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedInterviewer ? (
                  <div className="rounded-lg border border-border bg-surface-base p-4 text-center text-sm font-semibold text-text-muted">
                    Velg en intervjuer for å se intervjuene.
                  </div>
                ) : selectedInterviewerSchedule.length === 0 ? (
                  <div className="rounded-lg border border-border bg-surface-base p-4 text-center text-sm font-semibold text-text-muted">
                    {selectedInterviewer} har ingen tildelte intervjuer.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border-soft">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                            Tidspunkt
                          </th>
                          <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                            Kandidat
                          </th>
                          <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                            Intervjupanel
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInterviewerSchedule.map((item, idx) => (
                          <tr
                            key={idx}
                            className="group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft"
                          >
                            <td className="w-[100px] whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                              {formatSlotTime(item.time)}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                              {displayCandidate(item.candidate)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <div className="flex flex-wrap gap-[0.35rem]">
                                {item.panel.map((p, i) => (
                                  <span
                                    key={i}
                                    className={cn(
                                      "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold",
                                      p.is_overtime
                                        ? "border-brand-panelBorder bg-brand-badge text-brand"
                                        : "border-border-soft bg-surface-subtle text-text-body",
                                    )}
                                    title={
                                      p.is_overtime
                                        ? "Utenfor registrert tilgjengelighet"
                                        : undefined
                                    }
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
                )}
              </div>
            ) : viewType === "list" ? (
              <div className="overflow-hidden rounded-lg border border-border-soft">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                        Tidspunkt
                      </th>
                      <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                        Kandidat
                      </th>
                      <th className="border-b border-border-soft bg-surface-subtle px-4 py-3 text-left text-label font-bold uppercase tracking-label text-text-subtle">
                        Intervjupanel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSchedule.map((item, idx) => (
                      <tr
                        key={idx}
                        className="group [&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-b-border-faint hover:[&>td]:bg-surface-soft"
                      >
                        <td className="w-[100px] whitespace-nowrap px-4 py-3 text-sm font-semibold text-text-muted">
                          {formatSlotTime(item.time)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                          {displayCandidate(item.candidate)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap gap-[0.35rem]">
                            {item.panel.map((p, i) => (
                              <span
                                key={i}
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold",
                                  p.is_overtime
                                    ? "border-brand-panelBorder bg-brand-badge text-brand"
                                    : "border-border-soft bg-surface-subtle text-text-body",
                                )}
                                title={
                                  p.is_overtime
                                    ? "Utenfor registrert tilgjengelighet"
                                    : undefined
                                }
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
            ) : (
              <SolverCalendarView
                schedule={displaySchedule}
                dates={dates}
                sessionDuration={sessionDuration}
              />
            )}
          </SchedulePanelBody>
          <SchedulePanelFooter>
            <button
              type="button"
              className={cn(actionButtonBase, actionButtonNeutral)}
              onClick={handleExportIcs}
            >
              <Icon name="download" size="0.9rem" prefix="ios" />
              Eksporter (.ics)
            </button>
            <div className="flex flex-wrap items-center gap-2">
              {saveError && (
                <span className="text-detail font-semibold text-brand">
                  {saveError}
                </span>
              )}
              {savedSchedule?.is_distributed ? (
                <>
                  <Chip tone="success">Distribuert</Chip>
                  <button
                    type="button"
                    className={cn(actionButtonBase, actionButtonNeutral)}
                    onClick={handleUnlock}
                    disabled={isSaving}
                  >
                    Lås opp for redigering
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(actionButtonBase, actionButtonNeutral)}
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                  >
                    {isSaving ? "Lagrer..." : "Lagre plan"}
                  </button>
                  <button
                    type="button"
                    className={cn(actionButtonBase, actionButtonPrimary)}
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                  >
                    Lås og distribuer
                  </button>
                </>
              )}
            </div>
          </SchedulePanelFooter>
        </SchedulePanel>
      )}
    </div>
  );
}
