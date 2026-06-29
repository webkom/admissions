import type { ScheduleItem, SolverOptions } from "../types";

export interface SolveResponse {
  status:
    | "SUCCESS"
    | "PARTIAL"
    | "INFEASIBLE"
    | "LOCKED_CONFLICT"
    | "TIMEOUT"
    | "ERROR";
  schedule: ScheduleItem[];
  // True when the solver proved optimality; false/absent means it returned the
  // best solution found before the time limit.
  optimal?: boolean;
  unplaceable?: Array<{
    candidate_id: string;
    candidate: string;
    reason?: string;
  }>;
  locked_conflicts?: Array<{ message: string; assignment?: unknown }>;
}

// SUCCESS and PARTIAL both yield a usable (possibly incomplete) schedule.
export const hasSchedule = (status?: SolveResponse["status"]) =>
  status === "SUCCESS" || status === "PARTIAL";

// Turn a solver "unplaceable" reason into a concrete next step for the admin.
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

// A queued solve. The backend runs it in a worker; the client enqueues, then
// polls until the job reaches DONE (with `result`) or ERROR (with `error`).
export interface SolveJob {
  job_id: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR" | "CANCELLED";
  result: SolveResponse | null;
  error: string;
}

// How often to poll the solve-job status endpoint while a solve runs.
export const SOLVE_POLL_INTERVAL_MS = 1500;

// Give up polling after this long so a stopped worker surfaces as an error.
export const SOLVE_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  enforce_same_gender: false,
  allow_overtime: true,
  prioritize_continuity: true,
  same_panel_per_block: true,
  overtime_weight: 100,
  load_balance_weight: 1,
  continuity_weight: 12,
  // In lockstep with the backend cap (constants.MAX_SOLVER_SECONDS).
  max_solver_seconds: 120,
};

export const PRIORITY_PRESETS = [
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
      "Alle får like mange intervjuer, men på bekostning av overtid når man egentlig ikke er tilgjengelig.",
    overtimeWeight: 12,
    loadBalanceWeight: 8,
  },
] as const;

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
  return Math.min(hardCap, Math.max(2, Math.round(estimate)) * 2);
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
