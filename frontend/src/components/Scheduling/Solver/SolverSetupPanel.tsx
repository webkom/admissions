import React, {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

import cn from "../../../utils/cn";
import {
  Chip,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  Stepper,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  sectionLabelClass,
} from "../ui";
import type { InitialPlanningStrategy, SolverOptions } from "../types";
import {
  INITIAL_STRATEGY_PRESETS,
  REPAIR_STRATEGY_PRESETS,
  progressMessageFor,
  type SolveJob,
  type SolveResponse,
} from "./solverHelpers";
import type { SolverReadiness } from "./solverSelectors";

interface SolverSetupPanelProps {
  interviewerCount: number;
  solverOptions: SolverOptions;
  onSolverOptionsChange: Dispatch<SetStateAction<SolverOptions>>;
  panelSize: number;
  onPanelSizeChange: (value: number) => void;
  openBlockCount: number;
  interviewSlotCount: number;
  readiness: SolverReadiness;
  availabilityReady: boolean;
  loading: boolean;
  error: string;
  result: SolveResponse | null;
  elapsedMs: number;
  jobStatus: SolveJob["status"] | null;
  estimatedSeconds: number;
  lockedCount: number;
  hasProposal: boolean;
  editRequestKey: number;
  onSolve: () => void;
  onCancel: () => void;
  onRetryWithAvailabilityDeviation: () => void;
  onOpenAvailability: () => void;
}

const advancedOptionKeys = [
  "enforce_same_gender",
  "same_panel_per_block",
  "avoid_consecutive_interviewer_blocks",
  "prioritize_continuity",
  "allow_overtime",
] as const;

type AdvancedOptionKey = (typeof advancedOptionKeys)[number];

const presetFor = (options: SolverOptions) =>
  INITIAL_STRATEGY_PRESETS.find(
    (preset) =>
      preset.key === options.initial_strategy &&
      preset.overtimeWeight === options.overtime_weight &&
      preset.loadBalanceWeight === options.load_balance_weight,
  );

const hasAdvancedCustomization = (options: SolverOptions) =>
  options.enforce_same_gender ||
  !options.same_panel_per_block ||
  !options.avoid_consecutive_interviewer_blocks ||
  !options.prioritize_continuity ||
  !options.allow_overtime;

const AdvancedOptionRow = ({
  title,
  description,
  checked,
  onToggle,
  exception = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  exception?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className="flex w-full items-center justify-between gap-4 border-b border-border-soft py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
  >
    <span className="min-w-0">
      <span className="block text-ui font-semibold text-text-primary">
        {title}
      </span>
      <span
        className={cn(
          "mt-0.5 block text-detail leading-snug",
          exception ? "text-amber-800" : "text-text-muted",
        )}
      >
        {description}
      </span>
    </span>
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex h-6 w-10 flex-none rounded-full border transition-colors",
        checked
          ? "border-brand bg-brand"
          : "border-border-muted bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);

const SolverSetupPanel = ({
  interviewerCount,
  solverOptions,
  onSolverOptionsChange,
  panelSize,
  onPanelSizeChange,
  openBlockCount,
  interviewSlotCount,
  readiness,
  availabilityReady,
  loading,
  error,
  result,
  elapsedMs,
  jobStatus,
  estimatedSeconds,
  lockedCount,
  hasProposal,
  editRequestKey,
  onSolve,
  onCancel,
  onRetryWithAvailabilityDeviation,
  onOpenAvailability,
}: SolverSetupPanelProps) => {
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const shouldFocusSettingsRef = useRef(false);

  useEffect(() => {
    if (editRequestKey <= 0) return;
    shouldFocusSettingsRef.current = true;
    setCustomizationOpen(true);
  }, [editRequestKey]);

  useEffect(() => {
    if (!customizationOpen || !shouldFocusSettingsRef.current) return;
    shouldFocusSettingsRef.current = false;
    settingsRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    settingsRef.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus({
        preventScroll: true,
      });
  }, [customizationOpen]);

  const panelFormationImpossible = interviewerCount < panelSize;
  const generationBlocked =
    panelFormationImpossible || !availabilityReady || !readiness.ready;
  const matchedPreset = presetFor(solverOptions);
  const isCustom = !matchedPreset || hasAdvancedCustomization(solverOptions);
  const activePreset = isCustom ? undefined : matchedPreset;
  const waitingForWorker = jobStatus === "PENDING";
  const workerWaitIsLong = waitingForWorker && elapsedMs >= 8000;
  const estimatedMs = estimatedSeconds * 1000;
  const progressTargetMs = estimatedMs * 1.35;
  const progressPercent = waitingForWorker
    ? 12
    : Math.min(
        97,
        elapsedMs <= progressTargetMs
          ? (elapsedMs / Math.max(progressTargetMs, 1)) * 92
          : 92 + Math.min(5, ((elapsedMs - progressTargetMs) / 1000) * 0.08),
      );
  const progressMessage = waitingForWorker
    ? workerWaitIsLong
      ? import.meta.env.DEV
        ? "Planleggingstjenesten har ikke hentet jobben — start utviklingsmiljøet med «make dev»."
        : "Planleggingstjenesten har ikke hentet jobben — kontroller bakgrunnstjenesten."
      : "Venter på ledig planleggingstjeneste…"
    : progressMessageFor(elapsedMs, estimatedMs);

  const toggleSolverOption = (key: AdvancedOptionKey) => {
    onSolverOptionsChange((current) => ({ ...current, [key]: !current[key] }));
  };

  const choosePreset = (key: InitialPlanningStrategy) => {
    const preset = INITIAL_STRATEGY_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    onSolverOptionsChange((current) => ({
      ...current,
      initial_strategy: preset.key,
      overtime_weight: preset.overtimeWeight,
      load_balance_weight: preset.loadBalanceWeight,
    }));
  };

  const blockedDescription = !availabilityReady
    ? "Alle intervjuere må lagre tilgjengelighet før et intervjuforslag kan genereres."
    : "Fullfør grunnlaget før et intervjuforslag kan genereres.";

  const selectedPresetDescription =
    matchedPreset?.description ?? "Individuelle innstillinger er tilpasset.";
  const showRecovery =
    !solverOptions.allow_overtime &&
    (result?.status === "INFEASIBLE" ||
      result?.status === "PARTIAL" ||
      result?.status === "TIMEOUT");

  return (
    <SchedulePanel id={hasProposal ? "solver-review" : undefined}>
      <SchedulePanelHeader
        icon={Sparkles}
        title="Generer intervjuforslag"
        description={
          hasProposal
            ? "Velg panelstørrelse og oppdater forslaget. Låste intervjuer beholdes."
            : "Velg panelstørrelse og generer et forslag basert på tilgjengeligheten."
        }
        chips={
          hasProposal && lockedCount > 0 ? (
            <Chip tone="brand">
              {lockedCount} låst{lockedCount === 1 ? "" : "e"}
            </Chip>
          ) : undefined
        }
      />
      <SchedulePanelBody className="space-y-5">
        <section aria-label="Grunnlag">
          <p className="m-0 text-ui text-text-muted tabular-nums">
            {interviewerCount} intervjuere · {readiness.submittedInterviewers}{" "}
            av {interviewerCount} har svart · {openBlockCount} åpne blokker ·{" "}
            {interviewSlotCount} intervjutider
          </p>
        </section>

        <section
          className="border-y border-border-soft py-4"
          aria-labelledby="panel-size-heading"
        >
          <h3
            id="panel-size-heading"
            className="m-0 text-ui font-semibold text-text-primary"
          >
            Panelstørrelse
          </h3>
          <p className="m-0 mt-1 text-detail text-text-muted">
            Hvor mange intervjuere skal delta i hvert intervju?
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Stepper
              value={panelSize}
              min={1}
              max={10}
              onStep={onPanelSizeChange}
              aria-label="Panelstørrelse"
            />
            <span className="text-detail font-semibold text-text-muted">
              intervjuere per kandidat
            </span>
          </div>
          {panelFormationImpossible ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center gap-3 text-ui text-danger"
            >
              <span>
                Du har {interviewerCount} registrerte intervjuere, men
                panelstørrelsen er {panelSize}. Velg maksimalt{" "}
                {interviewerCount} eller legg til flere intervjuere.
              </span>
              <button
                type="button"
                onClick={onOpenAvailability}
                className="font-semibold underline underline-offset-2"
              >
                Åpne tilgjengelighet
              </button>
            </div>
          ) : !availabilityReady ? (
            <div
              role="status"
              className="mt-3 flex flex-wrap items-center gap-3 text-ui text-text-muted"
            >
              <span>{blockedDescription}</span>
              <button
                type="button"
                onClick={onOpenAvailability}
                className="font-semibold text-brand hover:underline"
              >
                Åpne tilgjengelighet
              </button>
            </div>
          ) : (
            <p className="m-0 mt-3 text-ui font-semibold text-success">
              Klar til å generere
            </p>
          )}
        </section>

        <section className="border-b border-border-soft pb-4">
          <p className={sectionLabelClass}>Anbefalt oppsett</p>
          <p className="m-0 text-ui font-semibold text-text-primary">
            {isCustom
              ? "Tilpasset"
              : "Balanserer tilgjengelighet, arbeidsmengde og kompakte dager."}
          </p>
          <ul className="mt-3 space-y-1.5 pl-5 text-detail text-text-muted">
            <li>
              Tildelinger holdes innenfor tilgjengelighet så langt det er mulig.
            </li>
            <li>Stabile paneler prioriteres.</li>
            <li>Kompakte intervjudager prioriteres.</li>
          </ul>
          {!panelFormationImpossible && (
            <button
              type="button"
              onClick={() => setExampleOpen((open) => !open)}
              aria-expanded={exampleOpen}
              className="mt-3 text-detail font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
            >
              Se eksempel
            </button>
          )}
          {!panelFormationImpossible && exampleOpen && (
            <div className="mt-3 border-l-2 border-border-quiet pl-3 text-detail text-text-muted">
              <p className="m-0 font-semibold text-text-primary">
                Illustrativt eksempel
              </p>
              <p className="m-0 mt-1">
                Et stabilt panel kan gjennomføre flere intervjuer i samme blokk,
                fremfor at hver intervjuer får spredte enkelttimer.
              </p>
              <p className="m-0 mt-2">
                Det faktiske forslaget avhenger av tilgjengelighet, konflikter,
                låste intervjuer og de øvrige innstillingene.
              </p>
            </div>
          )}
        </section>

        {!panelFormationImpossible && (
          <div ref={settingsRef}>
            <button
              type="button"
              onClick={() => setCustomizationOpen((open) => !open)}
              aria-expanded={customizationOpen}
              aria-controls="solver-customization"
              className="flex w-full items-center justify-between gap-3 text-left text-ui font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
            >
              Tilpass hvordan forslaget genereres
              <ChevronDown
                size={iconSizes.small}
                aria-hidden="true"
                className={cn(
                  "transition-transform",
                  customizationOpen && "rotate-180",
                )}
              />
            </button>
            {customizationOpen && (
              <div
                id="solver-customization"
                className="mt-4 space-y-5 animate-fade-in"
              >
                <section>
                  <p className={sectionLabelClass}>
                    Hva skal forslaget prioritere?
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="Hva skal forslaget prioritere?"
                    className="divide-y divide-border-soft border-y border-border-soft"
                  >
                    {INITIAL_STRATEGY_PRESETS.map((preset) => {
                      const active = activePreset?.key === preset.key;
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => choosePreset(preset.key)}
                          className="flex w-full items-start gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                              active
                                ? "border-brand bg-brand"
                                : "border-border-muted bg-surface-base",
                            )}
                          >
                            {active && (
                              <Check
                                size={10}
                                strokeWidth={3}
                                className="text-white"
                              />
                            )}
                          </span>
                          <span>
                            <span className="block text-ui font-semibold text-text-primary">
                              {preset.key === "balanced"
                                ? "Anbefalt"
                                : preset.key === "minimize_overtime"
                                  ? "Følg tilgjengeligheten"
                                  : "Jevn arbeidsmengde"}
                            </span>
                            <span className="mt-0.5 block text-detail text-text-muted">
                              {preset.key === "balanced"
                                ? "Balanserer tilgjengelighet, arbeidsmengde og kompakte dager."
                                : preset.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {isCustom && (
                    <p className="m-0 mt-2 text-detail text-text-muted">
                      Tilpasset: {selectedPresetDescription}
                    </p>
                  )}
                </section>

                <section>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((open) => !open)}
                    aria-expanded={advancedOpen}
                    aria-controls="solver-advanced-settings"
                    className="flex w-full items-center justify-between gap-3 border-t border-border-soft pt-4 text-left text-ui font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
                  >
                    Avanserte innstillinger
                    <ChevronDown
                      size={iconSizes.small}
                      aria-hidden="true"
                      className={cn(
                        "transition-transform",
                        advancedOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {advancedOpen && (
                    <div
                      id="solver-advanced-settings"
                      className="mt-3 animate-fade-in"
                    >
                      <p className={sectionLabelClass}>Regler</p>
                      <AdvancedOptionRow
                        title="Samme kjønn i panel"
                        description="Krev minst én intervjuer med samme kjønn der det er registrert."
                        checked={solverOptions.enforce_same_gender}
                        onToggle={() =>
                          toggleSolverOption("enforce_same_gender")
                        }
                      />
                      <p className={cn(sectionLabelClass, "mt-4")}>
                        Preferanser
                      </p>
                      <AdvancedOptionRow
                        title="Stabile paneler per blokk"
                        description="Prioriter samme panel gjennom en intervjublokk."
                        checked={solverOptions.same_panel_per_block}
                        onToggle={() =>
                          toggleSolverOption("same_panel_per_block")
                        }
                      />
                      <AdvancedOptionRow
                        title="Unngå intervjublokker rett etter hverandre"
                        description="Prøver å la en intervjuer stå over den neste intervjublokken etter en blokk de har deltatt i. Kan fravikes dersom det er nødvendig for å lage en god plan."
                        checked={
                          solverOptions.avoid_consecutive_interviewer_blocks
                        }
                        onToggle={() =>
                          toggleSolverOption(
                            "avoid_consecutive_interviewer_blocks",
                          )
                        }
                      />
                      <AdvancedOptionRow
                        title="Kompakte intervjudager"
                        description="Prioriter færre hull mellom intervjuene."
                        checked={solverOptions.prioritize_continuity}
                        onToggle={() =>
                          toggleSolverOption("prioritize_continuity")
                        }
                      />
                      <p className={cn(sectionLabelClass, "mt-4")}>Unntak</p>
                      <AdvancedOptionRow
                        title="Tillat avvik fra oppgitt tilgjengelighet"
                        description="Brukes når en gyldig plan ellers ikke kan lages. Avvik markeres tydelig."
                        checked={solverOptions.allow_overtime}
                        onToggle={() => toggleSolverOption("allow_overtime")}
                        exception
                      />
                    </div>
                  )}
                </section>

                {hasProposal && (
                  <section>
                    <p className={sectionLabelClass}>Ved ny generering</p>
                    <div
                      role="radiogroup"
                      aria-label="Ved ny generering"
                      className="divide-y divide-border-soft border-y border-border-soft"
                    >
                      {REPAIR_STRATEGY_PRESETS.map((preset) => {
                        const active =
                          solverOptions.repair_strategy === preset.key;
                        const label =
                          preset.key === "minimum_change"
                            ? "Behold mest mulig"
                            : preset.key === "preserve_panels"
                              ? "Behold panelene"
                              : "Tillat flere endringer";
                        return (
                          <button
                            key={preset.key}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() =>
                              onSolverOptionsChange((current) => ({
                                ...current,
                                repair_strategy: preset.key,
                              }))
                            }
                            className="flex w-full items-start gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                                active
                                  ? "border-brand bg-brand"
                                  : "border-border-muted bg-surface-base",
                              )}
                            >
                              {active && (
                                <Check
                                  size={10}
                                  strokeWidth={3}
                                  className="text-white"
                                />
                              )}
                            </span>
                            <span>
                              <span className="block text-ui font-semibold text-text-primary">
                                {label}
                              </span>
                              {active && (
                                <span className="mt-0.5 block text-detail text-text-muted">
                                  {preset.description}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {(error ||
          result?.status === "INFEASIBLE" ||
          result?.status === "PARTIAL" ||
          result?.status === "TIMEOUT" ||
          result?.status === "ERROR" ||
          result?.status === "LOCKED_CONFLICT") && (
          <section
            aria-live="polite"
            className="border-t border-border-soft pt-4"
          >
            <p className="m-0 text-ui font-semibold text-text-primary">
              {error ||
                result?.error ||
                (result?.status === "INFEASIBLE"
                  ? "Ingen løsning finnes med de valgte begrensningene."
                  : result?.status === "TIMEOUT"
                    ? "Solveren rakk ikke å bli ferdig."
                    : result?.status === "LOCKED_CONFLICT"
                      ? "Låst endring krasjer med inhabiliteter."
                      : "Solveren feilet på grunn av ugyldige innstillinger.")}
            </p>
            {showRecovery && (
              <button
                type="button"
                onClick={onRetryWithAvailabilityDeviation}
                className="mt-2 text-ui font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
              >
                Prøv igjen med avvik fra tilgjengelighet
              </button>
            )}
          </section>
        )}
      </SchedulePanelBody>

      {loading && (
        <div className="border-t border-border-soft bg-surface-mutedSoft px-5 py-3 handheld:px-4">
          <div
            role="progressbar"
            aria-label={
              waitingForWorker
                ? "Venter på planleggingstjenesten"
                : "Genererer plan"
            }
            aria-valuenow={
              waitingForWorker
                ? undefined
                : Math.round(Math.min(97, progressPercent))
            }
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out solver-barberpole-progress"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-detail text-text-muted">
            <span
              className={cn(
                "italic",
                workerWaitIsLong && "font-semibold text-brand",
              )}
              aria-live="polite"
            >
              {progressMessage}
            </span>
            <span className="font-bold text-text-primary tabular-nums">
              {waitingForWorker
                ? `${(elapsedMs / 1000).toFixed(1)}s i kø`
                : `${(elapsedMs / 1000).toFixed(1)}s / ~${estimatedSeconds}s`}
            </span>
          </div>
        </div>
      )}

      <SchedulePanelFooter>
        <span className="text-detail text-text-muted">
          {panelFormationImpossible ? "Kan ikke generere ennå" : ""}
        </span>
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
              onClick={onCancel}
            >
              Avbryt
            </button>
          )}
          <button
            type="button"
            className={cn(
              actionButtonBase,
              hasProposal ? actionButtonNeutral : actionButtonPrimary,
            )}
            onClick={onSolve}
            disabled={loading || generationBlocked}
            title={
              generationBlocked
                ? blockedDescription
                : lockedCount > 0
                  ? "Genererer planen på nytt og beholder de manuelt låste radene."
                  : undefined
            }
          >
            <Sparkles
              size={iconSizes.small}
              className={loading ? "animate-pulse" : undefined}
            />
            {loading
              ? waitingForWorker
                ? "Venter på tjenesten…"
                : "Optimaliserer…"
              : hasProposal
                ? "Generer på nytt"
                : "Generer forslag"}
          </button>
        </div>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

export default SolverSetupPanel;
