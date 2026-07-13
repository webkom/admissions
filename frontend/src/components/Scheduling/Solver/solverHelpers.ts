import { isAxiosError } from "axios";

import { apiClient } from "../../../utils/callApi";
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
}

export const SOLVE_POLL_INTERVAL_MS = 1500;

export const SOLVE_POLL_TIMEOUT_MS = 5 * 60 * 1000;

export type SolveJobPollOutcome =
  | { kind: "finished"; job: SolveJob }
  | { kind: "timeout" }
  | { kind: "stale" };

export const pollSolveJob = async (
  created: SolveJob,
  isStale: () => boolean = () => false,
): Promise<SolveJobPollOutcome> => {
  let job = created;
  const pollStart = Date.now();
  while (job.status === "PENDING" || job.status === "RUNNING") {
    await new Promise((resolve) => setTimeout(resolve, SOLVE_POLL_INTERVAL_MS));
    if (isStale()) return { kind: "stale" };
    if (Date.now() - pollStart > SOLVE_POLL_TIMEOUT_MS) {
      return { kind: "timeout" };
    }
    const { data } = await apiClient.get<SolveJob>(`/solve/${created.job_id}/`);
    job = data;
  }
  return { kind: "finished", job };
};

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  enforce_same_gender: false,
  allow_overtime: true,
  prioritize_continuity: true,
  same_panel_per_block: true,
  overtime_weight: 100,
  load_balance_weight: 1,
  continuity_weight: 12,
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
