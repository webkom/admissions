import { isAxiosError } from "axios";

import type {
  InitialPlanningStrategy,
  RepairStrategy,
  ScheduleItem,
  SolverOptions,
} from "../types";

export interface SolveResponse {
  status:
    | "SUCCESS"
    | "PARTIAL"
    | "INFEASIBLE"
    | "LOCKED_CONFLICT"
    | "TIMEOUT"
    | "ERROR";
  schedule: ScheduleItem[];
  optimal?: boolean;
  unplaceable?: Array<{
    candidate_id: string;
    candidate: string;
    reason?: string;
  }>;
  locked_conflicts?: Array<{ message: string; assignment?: unknown }>;
  error?: string;
}

export const hasSchedule = (status?: SolveResponse["status"]) =>
  status === "SUCCESS" || status === "PARTIAL";

export const CONFLICT_MESSAGE =
  "Planen ble endret av noen andre — last inn siden på nytt.";

export const isConflictError = (err: unknown) =>
  isAxiosError(err) && err.response?.status === 409;

export const solveFailureMessage = (result: SolveResponse): string => {
  switch (result.status) {
    case "INFEASIBLE":
      return (
        "Ingen løsning finnes med disse begrensningene. Forrige plan er " +
        "beholdt — prøv lavere panelstørrelse eller åpne flere slots."
      );
    case "TIMEOUT":
      return (
        "Solveren rakk ikke å bli ferdig innen tidsgrensen. Forrige plan er " +
        "beholdt — prøv igjen."
      );
    case "LOCKED_CONFLICT":
      return (
        "Låste endringer er i konflikt med inhabiliteter eller harde " +
        "begrensninger. Forrige plan er beholdt."
      );
    default:
      return result.error || "Solveren feilet under kjøring.";
  }
};

export const unplaceableSuggestion = (reason?: string): string | null => {
  switch (reason) {
    case "For mange i komiteen har meldt inhabilitet.":
      return "Be færre melde inhabilitet, eller legg til flere intervjuere.";
    case "Ikke nok intervjukapasitet i de åpne tidslukene.":
      return "Åpne flere tidsluker eller reduser panelstørrelsen.";
    case "Ingen tilgjengelige intervjuere med samme kjønn.":
      return "Slå av «samme kjønn i panel», eller legg til en intervjuer med matchende kjønn.";
    case "Ingen ledige tidsluker igjen.":
    case "Ingen aktive tidsluker er åpnet.":
      return "Åpne flere tidsluker i kalenderen.";
    default:
      return null;
  }
};

export interface SolveJob {
  job_id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR" | "CANCELLED";
  result: SolveResponse | null;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export const DEFAULT_MAX_SOLVER_SECONDS = 5 * 60;
const LEGACY_DEFAULT_MAX_SOLVER_SECONDS = 120;

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  enforce_same_gender: false,
  allow_overtime: true,
  prioritize_continuity: true,
  same_panel_per_block: true,
  avoid_consecutive_interviewer_blocks: true,
  initial_strategy: "balanced",
  repair_strategy: "balanced",
  repair_mode: false,
  overtime_weight: 40,
  load_balance_weight: 4,
  continuity_weight: 12,
  max_solver_seconds: DEFAULT_MAX_SOLVER_SECONDS,
};

export const normalizeSolverOptions = (
  options: Partial<SolverOptions> | null | undefined,
): SolverOptions => {
  const normalized = { ...DEFAULT_SOLVER_OPTIONS, ...options };
  // The old value was an invisible application default, not a user choice.
  // Upgrade saved admissions so they receive the extended runtime as well.
  if (normalized.max_solver_seconds === LEGACY_DEFAULT_MAX_SOLVER_SECONDS) {
    normalized.max_solver_seconds = DEFAULT_MAX_SOLVER_SECONDS;
  }
  return normalized;
};

export const INITIAL_STRATEGY_PRESETS: ReadonlyArray<{
  key: InitialPlanningStrategy;
  label: string;
  description: string;
  example: string;
  overtimeWeight: number;
  loadBalanceWeight: number;
}> = [
  {
    key: "minimize_overtime",
    label: "Minimer avvik fra tilgjengelighet",
    description:
      "Respekter tilgjengeligheten selv om noen får flere intervjuer.",
    example: "Eksempel: færre tildelinger utenfor oppgitt tilgjengelighet.",
    overtimeWeight: 100,
    loadBalanceWeight: 1,
  },
  {
    key: "balanced",
    label: "Balansert",
    description: "Kombiner få avvik, jevn fordeling og kompakte intervjudager.",
    example:
      "Eksempel: litt ulik belastning godtas for å unngå avvik fra tilgjengeligheten.",
    overtimeWeight: 40,
    loadBalanceWeight: 4,
  },
  {
    key: "balance_workload",
    label: "Jevn fordeling",
    description: "Fordel intervjuene så likt som mulig mellom intervjuerne.",
    example: "Eksempel: belastningen går fra 8–2 intervjuer til omtrent 5–5.",
    overtimeWeight: 12,
    loadBalanceWeight: 8,
  },
];

export const REPAIR_STRATEGY_PRESETS: ReadonlyArray<{
  key: RepairStrategy;
  label: string;
  description: string;
  example: string;
}> = [
  {
    key: "minimum_change",
    label: "Minst mulig endring",
    description: "Bevar tider og uberørte tildelinger så langt det er mulig.",
    example: "Eksempel: bruk én vikar i ett intervju fremfor å endre blokken.",
  },
  {
    key: "preserve_panels",
    label: "Behold paneler",
    description: "Prioriter samme panel gjennom hele intervjublokken.",
    example: "Eksempel: bytt samme person i alle fire intervjuene i blokken.",
  },
  {
    key: "balanced",
    label: "Balansert",
    description: "Vei panelstabilitet mot hvor mange intervjuer som berøres.",
    example:
      "Eksempel: tillat et lite panelavvik når det sparer flere endringer.",
  },
];

export const PANEL_SIZE_MIN = 1;
export const PANEL_SIZE_MAX = 10;

const PROGRESS_MESSAGES = [
  "Bygger modell…",
  "Søker etter første gyldige plan…",
  "Vurderer panelkombinasjoner…",
  "Optimaliserer fordelingen…",
  "Forbedrer løsningen…",
  "Finsliper plassering…",
];

export const progressMessageFor = (
  elapsedMs: number,
  estimateMs: number,
): string => {
  if (elapsedMs > estimateMs) {
    return "Tar lengre tid enn ventet — solveren prøver fortsatt…";
  }
  const step = Math.max(1500, estimateMs / PROGRESS_MESSAGES.length);
  const index = Math.min(
    PROGRESS_MESSAGES.length - 1,
    Math.floor(elapsedMs / step),
  );
  return PROGRESS_MESSAGES[index];
};

export const estimateSolverSeconds = (
  candidates: number,
  interviewers: number,
  slots: number,
  panelSize: number,
  prioritizeContinuity: boolean,
  hardCap: number,
): number => {
  if (candidates === 0 || interviewers === 0 || slots === 0) return 2;
  const vars = candidates * interviewers * slots;
  const baseSeconds = Math.max(1, vars / 3500);
  const continuityMult = prioritizeContinuity ? 1.6 : 1;
  const panelMult = 1 + Math.max(0, panelSize - 3) * 0.25;
  const estimate = baseSeconds * continuityMult * panelMult;
  return Math.min(hardCap, Math.max(2, Math.round(estimate * 1.4) * 2));
};

export const formatApiError = (data: unknown): string => {
  if (!data) return "Kunne ikke kjøre solver.";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) {
    return data.map(formatApiError).join(" ");
  }
  if (typeof data !== "object") return String(data);

  return Object.entries(data)
    .map(([key, value]) => `${key}: ${formatApiError(value)}`)
    .join(" ");
};

export const scheduleSaveErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (!isAxiosError(error) || error.response?.status !== 400) {
    return fallback;
  }

  const detail = formatApiError(error.response.data).replace(
    /^schedule:\s*/i,
    "",
  );
  if (!detail) return fallback;

  if (detail.includes("intervjue seg selv")) {
    return "Planen kan ikke lagres: En kandidat kan ikke intervjue seg selv. Bytt personen i panelet.";
  }

  return `Planen kan ikke lagres: ${detail}`;
};
