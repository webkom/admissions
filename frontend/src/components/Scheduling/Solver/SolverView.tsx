import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SolverOptions,
} from "../types";
import { apiClient } from "../../../utils/callApi";
import SolverCalendarView from "./SolverCalendarView";
import Icon from "../../Icon";
import { formatDateHeader, generateIcs } from "../scheduleUtils";
import { useSavedSchedule } from "../../../query/hooks";
import cn from "src/utils/cn";

interface Props {
  candidates: Candidate[];
  interviewers: Interviewer[];
  dates: string[];
  sessionDuration: number;
  admissionTitle: string;
  admissionSlug: string;
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
    description: "Spar intervjuere utenfor registrert tilgjengelighet.",
    overtimeWeight: 100,
    loadBalanceWeight: 1,
  },
  {
    key: "balanced",
    label: "Balansert",
    description: "Unngå overtid, men jobb samtidig for en jevnere fordeling.",
    overtimeWeight: 40,
    loadBalanceWeight: 4,
  },
  {
    key: "protect-load",
    label: "Jevn fordeling",
    description: "Fordel belastningen jevnere, selv om det kan gi noe overtid.",
    overtimeWeight: 12,
    loadBalanceWeight: 8,
  },
] as const;

export default function SolverView({
  candidates,
  interviewers,
  dates,
  sessionDuration,
  admissionTitle,
  admissionSlug,
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

  const { data: savedSchedule, refetch: refetchSaved } =
    useSavedSchedule(admissionSlug);

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

  const selectedPriorityPreset = useMemo(
    () =>
      PRIORITY_PRESETS.find(
        (preset) =>
          preset.overtimeWeight === solverOptions.overtime_weight &&
          preset.loadBalanceWeight === solverOptions.load_balance_weight,
      )?.key ?? "custom",
    [solverOptions.load_balance_weight, solverOptions.overtime_weight],
  );

  const selectedPriorityMeta = useMemo(
    () =>
      PRIORITY_PRESETS.find((preset) => preset.key === selectedPriorityPreset) ??
      null,
    [selectedPriorityPreset],
  );

  const formatSlotTime = (timeValue: number) => {
    const dayIndex = Math.floor(timeValue / 24);
    const hour = timeValue % 24;
    const date = dates[dayIndex];
    if (!date) return `Dag ${dayIndex + 1} ${hour}:00`;
    const { weekday, dayMonth } = formatDateHeader(date);
    return `${weekday} ${dayMonth} ${hour}:00`;
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

    const icsContent = generateIcs(schedule, dates, sessionDuration, admissionTitle);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
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
      await apiClient.post(`/admin/admission/${admissionSlug}/schedule/`, {
        schedule,
        start_date: dates[0] ?? "",
        session_duration: sessionDuration,
        is_distributed: distribute,
      });
      await refetchSaved();
    } catch {
      setSaveError("Kunne ikke lagre planen. Prøv igjen.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!savedSchedule) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await apiClient.post(`/admin/admission/${admissionSlug}/schedule/`, {
        schedule: savedSchedule.schedule,
        start_date: savedSchedule.start_date,
        session_duration: savedSchedule.session_duration,
        is_distributed: false,
      });
      await refetchSaved();
    } catch {
      setSaveError("Kunne ikke låse opp planen.");
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

  const handleToggleCardKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    key: "enforce_same_gender" | "allow_overtime",
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSolverOption(key);
    }
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
      <div className="rounded-panel border border-border bg-surface-base p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[200px] flex-1">
            <h2 className="m-0 mb-1 text-sm font-bold text-text-primary">
              Generer en plan
            </h2>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label
                className="text-label font-bold uppercase tracking-label text-text-subtle"
                htmlFor="panel-size"
              >
                Panelstørrelse
              </label>
              <input
                id="panel-size"
                type="number"
                min="1"
                max="5"
                className="w-16 rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-center text-sm font-bold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                value={panelSize}
                onChange={(e) => {
                  const nextValue = parseInt(e.target.value, 10);
                  if (!isNaN(nextValue)) {
                    setPanelSize(nextValue);
                  }
                }}
              />
            </div>
            <button
              type="button"
              className="cursor-pointer whitespace-nowrap rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40"
              onClick={handleSolve}
              disabled={loading}
            >
              {loading ? "Optimaliserer..." : "Generer plan"}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-4 border-b border-border-soft pb-4">
          <div className="inline-flex items-baseline gap-[0.4rem]">
            <span className="text-label font-bold uppercase tracking-label text-text-subtle">
              Kandidater
            </span>
            <span className="text-sm font-bold text-text-primary">
              {candidates.length}
            </span>
          </div>
          <div className="inline-flex items-baseline gap-[0.4rem]">
            <span className="text-label font-bold uppercase tracking-label text-text-subtle">
              Intervjuere
            </span>
            <span className="text-sm font-bold text-text-primary">
              {interviewers.length}
            </span>
          </div>
          <div className="inline-flex items-baseline gap-[0.4rem]">
            <span className="text-label font-bold uppercase tracking-label text-text-subtle">
              Antall intervjuere
            </span>
            <span className="text-sm font-bold text-text-primary">
              {panelSize}
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-[0.9rem] rounded-lg border border-border bg-surface-muted p-4">
          <div className="flex flex-col gap-1">
            <span className="mb-1 block text-label font-bold uppercase tracking-label text-text-subtle">
              Før du genererer
            </span>
            <h3 className="m-0 text-sm font-bold text-text-primary">
              Velg krav og prioriteringer
            </h3>
            <p className="m-0 max-w-[42rem] text-ui leading-relaxed text-text-muted">
              Klikk på et kort for å slå en regel av eller på. Åpne detaljene
              bare når du vil lese forklaringen.
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[0.65rem]">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={solverOptions.enforce_same_gender}
              className={cn(
                "flex cursor-pointer flex-col gap-[0.65rem] rounded-[10px] border px-[0.95rem] py-[0.85rem] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-brand-strongBorder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                solverOptions.enforce_same_gender
                  ? "border-brand-activeBorder bg-surface-base bg-brand-panel shadow-toggle"
                  : "border-border-soft bg-surface-base",
              )}
              onClick={() => toggleSolverOption("enforce_same_gender")}
              onKeyDown={(event) =>
                handleToggleCardKeyDown(event, "enforce_same_gender")
              }
            >
              <div className="flex items-center justify-between gap-[0.3rem]">
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  Panelregel
                </span>
                <span
                  className={cn(
                    "flex min-w-12 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-badge",
                    solverOptions.enforce_same_gender
                      ? "bg-brand-fill text-brand"
                      : "bg-surface-subtle text-text-muted",
                  )}
                >
                  {solverOptions.enforce_same_gender ? "På" : "Av"}
                </span>
              </div>
              <h4 className="m-0 text-sm font-bold text-text-primary">
                Samme kjønn i panelet
              </h4>
              <p className="m-0 text-detail leading-[1.45] text-text-muted">
                Krev minst én intervjuer av samme kjønn som kandidaten.
              </p>
              <details
                className="grid gap-[0.55rem] pt-[0.1rem] [&[open]_.summary-icon]:rotate-180"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-[0.35rem] text-text-muted [&::-webkit-details-marker]:hidden">
                  <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                    Les detaljene
                  </span>
                  <ChevronDown className="summary-icon h-[0.9rem] w-[0.9rem] transition-transform duration-150" />
                </summary>
                <p className="m-0 text-ui leading-relaxed text-text-soft">
                  Når denne regelen er på, må hvert intervju ha minst én person
                  i panelet som matcher kandidatens kjønn. Hvis det ikke finnes,
                  blir akkurat det oppsettet vurdert som ugyldig.
                </p>
              </details>
            </div>

            <div
              role="button"
              tabIndex={0}
              aria-pressed={solverOptions.allow_overtime}
              className={cn(
                "flex cursor-pointer flex-col gap-[0.65rem] rounded-[10px] border px-[0.95rem] py-[0.85rem] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-brand-strongBorder focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                solverOptions.allow_overtime
                  ? "border-brand-activeBorder bg-surface-base bg-brand-panel shadow-toggle"
                  : "border-border-soft bg-surface-base",
              )}
              onClick={() => toggleSolverOption("allow_overtime")}
              onKeyDown={(event) =>
                handleToggleCardKeyDown(event, "allow_overtime")
              }
            >
              <div className="flex items-center justify-between gap-[0.3rem]">
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  Tilgjengelighet
                </span>
                <span
                  className={cn(
                    "flex min-w-12 items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-badge",
                    solverOptions.allow_overtime
                      ? "bg-brand-fill text-brand"
                      : "bg-surface-subtle text-text-muted",
                  )}
                >
                  {solverOptions.allow_overtime ? "På" : "Av"}
                </span>
              </div>
              <h4 className="m-0 text-sm font-bold text-text-primary">
                Tillat overtid
              </h4>
              <p className="m-0 text-detail leading-[1.45] text-text-muted">
                La solveren bruke intervjuere utenfor registrert tilgjengelighet
                når det trengs.
              </p>
              <details
                className="grid gap-[0.55rem] pt-[0.1rem] [&[open]_.summary-icon]:rotate-180"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-[0.35rem] text-text-muted [&::-webkit-details-marker]:hidden">
                  <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                    Les detaljene
                  </span>
                  <ChevronDown className="summary-icon h-[0.9rem] w-[0.9rem] transition-transform duration-150" />
                </summary>
                <p className="m-0 text-ui leading-relaxed text-text-soft">
                  Når denne er av, får solveren bare bruke slotter folk faktisk
                  har merket som tilgjengelige. Når den er på, kan den bruke
                  andre slotter også, men markere dem som overtid i resultatet.
                </p>
              </details>
            </div>
          </div>

          <div className="flex flex-col gap-[0.65rem] pt-[0.15rem]">
            <div className="flex items-center justify-between gap-[0.3rem]">
              <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                Prioritering
              </span>
              <span className="flex min-w-12 items-center justify-center rounded-full bg-black/5 px-2.5 py-1 text-xs font-bold uppercase tracking-badge text-text-soft">
                {selectedPriorityPreset === "custom"
                  ? "Tilpasset"
                  : "Forhåndsvalg"}
              </span>
            </div>
            <h4 className="m-0 text-sm font-bold text-text-primary">
              Hva skal solveren ofre først?
            </h4>
            <p className="m-0 text-detail leading-[1.45] text-text-muted">
              Velg hva som er viktigst når tilgjengelighet, kapasitet og jevn
              fordeling trekker i ulike retninger.
            </p>
            <div className="flex flex-wrap gap-[0.45rem]">
              {PRIORITY_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer items-center justify-center rounded-full border px-3 py-[0.45rem] text-[0.78rem] font-bold transition-[border-color,background] duration-150 hover:border-brand-strongBorder",
                    selectedPriorityPreset === preset.key
                      ? "border-brand-activeBorder bg-brand-badge text-brand"
                      : "border-border-soft bg-surface-base text-text-body",
                  )}
                  onClick={() =>
                    applyPriorityPreset(
                      preset.overtimeWeight,
                      preset.loadBalanceWeight,
                    )
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="m-0 text-helper leading-[1.5] text-text-soft">
              {selectedPriorityMeta ? (
                <>
                  <span className="mr-[0.35rem] font-bold text-text-primary">
                    {selectedPriorityMeta.label}
                  </span>
                  {selectedPriorityMeta.description}
                </>
              ) : (
                <>
                  <span className="mr-[0.35rem] font-bold text-text-primary">
                    Tilpasset
                  </span>
                  Du har manuelt valgt egne vekter for overtid og fordeling.
                </>
              )}
            </p>
            <details className="grid gap-[0.55rem] pt-[0.1rem] [&[open]_.summary-icon]:rotate-180">
              <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-[0.35rem] text-text-muted [&::-webkit-details-marker]:hidden">
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  Forklaring og finjustering
                </span>
                <ChevronDown className="summary-icon h-[0.9rem] w-[0.9rem] transition-transform duration-150" />
              </summary>
              <p className="m-0 text-ui leading-relaxed text-text-soft">
                Overtidsvekten sier hvor dyrt det er å bruke folk utenfor
                tilgjengeligheten sin. Fordelingsvekten sier hvor hardt
                solveren skal prøve å unngå at noen får klart flere intervjuer
                enn resten.
              </p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    className="text-label font-bold uppercase tracking-label text-text-subtle"
                    htmlFor="overtime-weight"
                  >
                    Overtidsvekt
                  </label>
                  <input
                    id="overtime-weight"
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-left text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                    value={solverOptions.overtime_weight}
                    onChange={(event) =>
                      updateSolverOption(
                        "overtime_weight",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                    disabled={!solverOptions.allow_overtime}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    className="text-label font-bold uppercase tracking-label text-text-subtle"
                    htmlFor="load-balance-weight"
                  >
                    Fordelingsvekt
                  </label>
                  <input
                    id="load-balance-weight"
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-border-muted bg-surface-base px-2.5 py-2 text-left text-sm font-semibold text-text-primary transition-[border-color,box-shadow] duration-150 focus:border-brand-input focus:outline-none focus:ring-3 focus:ring-brand-ringSoft"
                    value={solverOptions.load_balance_weight}
                    onChange={(event) =>
                      updateSolverOption(
                        "load_balance_weight",
                        Math.max(0, Number(event.target.value) || 0),
                      )
                    }
                  />
                </div>
              </div>
            </details>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-brand-border bg-brand-muted px-4 py-3 text-ui font-semibold text-brand">
            {error}
          </div>
        )}

        {result?.status === "INFEASIBLE" && (
          <div className="mb-3 rounded-lg border border-brand-border bg-surface-muted px-5 py-8 text-center">
            <h4 className="m-0 mb-2 text-base font-bold text-text-primary">
              Ingen løsning funnet
            </h4>
            <p className="m-0 mx-auto max-w-[32rem] text-ui leading-relaxed text-text-subtle">
              Nåværende begrensninger er for stramme. Start med lavere
              panelstørrelse eller åpne flere slots før dere prøver igjen.
            </p>
          </div>
        )}

        {result?.status === "SUCCESS" && (
          <div className="animate-[fade-in_0.25s_ease-out]">
            <div className="mb-[0.875rem] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-[0.65rem]">
                <div>
                  <span className="mb-1 block text-label font-bold uppercase tracking-label text-text-subtle">
                    Resultat
                  </span>
                  <h3 className="m-0 text-sm font-bold text-text-primary">
                    Generert intervjuplan
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-subtle px-2.5 py-1 text-xs font-semibold text-brand">
                  {result.schedule.length} intervjuer
                </span>
              </div>

              <div className="flex gap-[3px] rounded-lg border border-border-soft bg-surface-muted p-[3px]">
                <button
                  type="button"
                  className={cn(
                    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-all duration-100 hover:text-text-primary",
                    viewType === "list"
                      ? "border-border-soft bg-surface-base text-text-primary"
                      : "border-transparent bg-transparent text-text-faded",
                  )}
                  onClick={() => setViewType("list")}
                  title="Liste-visning"
                >
                  <Icon name="list" size="1.2rem" prefix="ios" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border transition-all duration-100 hover:text-text-primary",
                    viewType === "calendar"
                      ? "border-border-soft bg-surface-base text-text-primary"
                      : "border-transparent bg-transparent text-text-faded",
                  )}
                  onClick={() => setViewType("calendar")}
                  title="Kalender-visning"
                >
                  <Icon name="calendar" size="1.2rem" prefix="ios" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex h-8 cursor-pointer items-center justify-center rounded-md border px-3 text-xs font-bold transition-all duration-100 hover:text-text-primary",
                    viewType === "person"
                      ? "border-border-soft bg-surface-base text-text-primary"
                      : "border-transparent bg-transparent text-text-faded",
                  )}
                  onClick={() => setViewType("person")}
                  title="Personvisning"
                >
                  Person
                </button>
              </div>
            </div>

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
                      className="rounded-lg border border-border-soft bg-surface-muted px-4 py-3 text-left transition-[border-color,background] duration-100 hover:border-brand-panelBorder"
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
                            ? "border-brand-panelBorder bg-brand-subtle"
                            : "border-border-soft bg-surface-muted",
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
                  <div className="rounded-lg border border-border bg-surface-muted p-4 text-center text-sm font-semibold text-text-muted">
                    Velg en intervjuer for å se intervjuene.
                  </div>
                ) : selectedInterviewerSchedule.length === 0 ? (
                  <div className="rounded-lg border border-border bg-surface-muted p-4 text-center text-sm font-semibold text-text-muted">
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
                              {item.candidate}
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
                          {item.candidate}
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
              <SolverCalendarView schedule={sortedSchedule} dates={dates} />
            )}

            <div className="mt-[0.875rem] flex flex-wrap items-center gap-3 border-t border-border-soft pt-[0.875rem]">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-muted bg-surface-base px-4 py-2 text-ui font-semibold text-text-soft transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle"
                onClick={handleExportIcs}
              >
                <Icon name="download" size="0.9rem" prefix="ios" />
                Eksporter til kalender (.ics)
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {savedSchedule?.is_distributed ? (
                  <>
                    <span className="inline-flex items-center rounded-full border border-success-border bg-success-bg px-3 py-1 text-xs font-bold uppercase tracking-badge text-success">
                      Distribuert
                    </span>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-border-muted bg-surface-base px-4 py-2 text-ui font-semibold text-text-soft transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="cursor-pointer rounded-lg border border-border-muted bg-surface-base px-4 py-2 text-ui font-semibold text-text-soft transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleSave(false)}
                      disabled={isSaving}
                    >
                      {isSaving ? "Lagrer..." : "Lagre plan"}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-white transition-[background,border-color,box-shadow] duration-150 hover:border-brand-hover hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-ring active:bg-brand-pressed disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => handleSave(true)}
                      disabled={isSaving}
                    >
                      Lås og distribuer
                    </button>
                  </>
                )}
              </div>
              {saveError && (
                <span className="text-xs font-semibold text-brand">
                  {saveError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
