import { isAxiosError } from "axios";

import type {
  AvailabilityFallback,
  InitialPlanningStrategy,
  PanelStability,
  RepairStrategy,
  ScheduleItem,
  SolverOptions,
} from "../types";
import type { SavedSchedule } from "src/types";

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
  request_fingerprint?: string;
  policy_snapshot?: {
    policy_version: number | null;
    panel_stability: PanelStability;
    availability_fallback: AvailabilityFallback;
  };
  deviation_review?: {
    deviation_count: number;
    deviation_fingerprint: string;
    requires_approval: boolean;
  };
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
        "begrensninger. Forrige plan er beholdt. Lås opp det berørte " +
        "intervjuet i «Rediger intervjuer» før du lager et nytt reparasjonsforslag."
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
    case "Ingen tilgjengelige paneler har en erfaren intervjuer.":
      return "Klassifiser en deltakende intervjuer som erfaren, eller slå av erfaringskravet.";
    case "Ingen ledige tidsluker igjen.":
    case "Ingen aktive tidsluker er åpnet.":
      return "Åpne flere tidsluker i kalenderen.";
    default:
      return null;
  }
};

export interface SolveJob {
  job_id: string;
  request_fingerprint: string;
  status: "PENDING" | "RUNNING" | "DONE" | "ERROR" | "CANCELLED";
  result: SolveResponse | null;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  applied_at: string | null;
  discarded_at: string | null;
  proposal_expires_at: string | null;
  baseline_updated_at: string | null;
  auto_apply_if_empty: boolean;
  preview_only: boolean;
}

export interface PendingSolveProposal {
  job: SolveJob;
  result: SolveResponse;
  baseRevision: string;
}

export interface AppliedSolveProposal {
  schedule: SavedSchedule;
  result: SolveResponse;
}

const DEFAULT_MAX_SOLVER_SECONDS = 30;
const LEGACY_DEFAULT_MAX_SOLVER_SECONDS = new Set([120, 5 * 60]);

export const DEFAULT_SOLVER_OPTIONS: SolverOptions = {
  policy_version: 2,
  panel_stability: "preferred",
  availability_fallback: "stop",
  enforce_same_gender: false,
  require_experienced_panel: true,
  allow_overtime: false,
  prioritize_continuity: true,
  same_panel_per_block: false,
  avoid_consecutive_interviewer_blocks: true,
  initial_strategy: "balanced",
  repair_strategy: "minimum_change",
  repair_mode: false,
  overtime_weight: 40,
  load_balance_weight: 4,
  continuity_weight: 1,
  max_solver_seconds: DEFAULT_MAX_SOLVER_SECONDS,
};

const ADVANCED_SOLVER_OPTION_KEYS = [
  "enforce_same_gender",
  "require_experienced_panel",
  "avoid_consecutive_interviewer_blocks",
] as const;

type AdvancedSolverOptionKey = (typeof ADVANCED_SOLVER_OPTION_KEYS)[number];

export const ADVANCED_SOLVER_DEFAULTS: Pick<
  SolverOptions,
  AdvancedSolverOptionKey | "panel_stability" | "same_panel_per_block"
> = {
  enforce_same_gender: DEFAULT_SOLVER_OPTIONS.enforce_same_gender,
  require_experienced_panel: DEFAULT_SOLVER_OPTIONS.require_experienced_panel,
  panel_stability: DEFAULT_SOLVER_OPTIONS.panel_stability,
  same_panel_per_block: DEFAULT_SOLVER_OPTIONS.same_panel_per_block,
  avoid_consecutive_interviewer_blocks:
    DEFAULT_SOLVER_OPTIONS.avoid_consecutive_interviewer_blocks,
};

interface AdvancedSettingsSummary {
  requirementCount: number;
  preferenceCount: number;
  customizationCount: number;
  availabilityLabel: string;
  text: string;
}

export const deriveAdvancedSettingsSummary = (
  options: SolverOptions,
): AdvancedSettingsSummary => {
  const requirementCount =
    Number(options.enforce_same_gender) +
    Number(options.require_experienced_panel) +
    Number(options.panel_stability === "required");
  const preferenceCount = Number(options.avoid_consecutive_interviewer_blocks);
  const customizationCount =
    ADVANCED_SOLVER_OPTION_KEYS.filter(
      (key) => options[key] !== ADVANCED_SOLVER_DEFAULTS[key],
    ).length +
    Number(options.panel_stability !== DEFAULT_SOLVER_OPTIONS.panel_stability);
  const availabilityLabel =
    options.availability_fallback === "stop"
      ? "stopper ved kapasitetsmangel"
      : options.availability_fallback === "propose"
        ? "foreslår tydelig markerte avvik for godkjenning"
        : "kan bruke tydelig markerte avvik automatisk";
  const panelLabel =
    options.panel_stability === "required"
      ? "krever samme panel i hver blokk"
      : options.panel_stability === "preferred"
        ? "foretrekker samme panel i hver blokk"
        : "lar panelet variere mellom intervjuene";
  const extraPreferences = [
    options.avoid_consecutive_interviewer_blocks && "hvile mellom blokker",
  ].filter(Boolean);
  const preferenceLabel =
    extraPreferences.length > 0
      ? ` og prioriterer ${extraPreferences.join(" og ")}`
      : "";

  return {
    requirementCount,
    preferenceCount,
    customizationCount,
    availabilityLabel,
    text: `Planen ${panelLabel}${preferenceLabel}, og ${availabilityLabel}.`,
  };
};

export const normalizeSolverOptions = (
  options:
    | (Omit<Partial<SolverOptions>, "policy_version"> & {
        policy_version?: number;
      })
    | null
    | undefined,
): SolverOptions => {
  const raw = options ?? {};
  const hasV2Policy = raw.policy_version === 2;
  const legacyPanelStability: PanelStability = raw.same_panel_per_block
    ? raw.repair_mode
      ? "preferred"
      : "required"
    : "flexible";
  const panelStability = hasV2Policy
    ? (raw.panel_stability ?? DEFAULT_SOLVER_OPTIONS.panel_stability)
    : legacyPanelStability;
  const availabilityFallback = hasV2Policy
    ? (raw.availability_fallback ??
      DEFAULT_SOLVER_OPTIONS.availability_fallback)
    : raw.allow_overtime === false
      ? "stop"
      : "automatic";
  const normalized: SolverOptions = {
    ...DEFAULT_SOLVER_OPTIONS,
    ...raw,
    policy_version: 2,
    panel_stability: panelStability,
    availability_fallback: availabilityFallback,
    // Legacy saved admissions did not have this field and must remain compatible.
    require_experienced_panel: raw.require_experienced_panel ?? false,
    same_panel_per_block: panelStability === "required",
    allow_overtime: availabilityFallback === "automatic",
  };
  if (normalized.initial_strategy === "minimize_overtime") {
    normalized.initial_strategy = "balanced";
  }
  // The old value was an invisible application default, not a user choice.
  // Upgrade saved admissions so they receive the extended runtime as well.
  if (LEGACY_DEFAULT_MAX_SOLVER_SECONDS.has(normalized.max_solver_seconds)) {
    normalized.max_solver_seconds = DEFAULT_MAX_SOLVER_SECONDS;
  }
  return normalized;
};

export const INITIAL_STRATEGY_PRESETS: ReadonlyArray<{
  key: InitialPlanningStrategy;
  label: string;
  description: string;
  example: string;
  loadBalanceWeight: number;
  continuityWeight: number;
  prioritizeContinuity: boolean;
}> = [
  {
    key: "balanced",
    label: "Balansert",
    description: "En rolig kombinasjon av korte dager og jevn arbeidsmengde.",
    example:
      "Eksempel: når flere planer har like få avvik, velges en moderat jevn fordeling.",
    loadBalanceWeight: 4,
    continuityWeight: 1,
    prioritizeContinuity: true,
  },
  {
    key: "compact_days",
    label: "Kompakte intervjudager",
    description:
      "Samler intervjuene i færre sammenhengende perioder med færre hull.",
    example:
      "Eksempel: intervjuene legges tettere når tilgjengeligheten tillater det.",
    loadBalanceWeight: 2,
    continuityWeight: 48,
    prioritizeContinuity: true,
  },
  {
    key: "balance_workload",
    label: "Jevn arbeidsmengde",
    description:
      "Minimerer avvik først og prioriterer jevn fordeling sterkest.",
    example:
      "Eksempel: blant planer med like få avvik foretrekkes den jevneste belastningen.",
    loadBalanceWeight: 10,
    continuityWeight: 0,
    prioritizeContinuity: false,
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
