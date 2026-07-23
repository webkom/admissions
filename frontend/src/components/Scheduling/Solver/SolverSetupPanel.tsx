import React, {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import ScheduleDrawer from "../ScheduleDrawer";
import {
  CustomSelect,
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
import type {
  InitialPlanningStrategy,
  PanelStability,
  SolverOptions,
} from "../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import {
  ADVANCED_SOLVER_DEFAULTS,
  INITIAL_STRATEGY_PRESETS,
  deriveAdvancedSettingsSummary,
  progressMessageFor,
  type SolveJob,
} from "./solverHelpers";
import type { SolverReadiness } from "./solverSelectors";

interface SolverSetupPanelProps {
  interviewerCount: number;
  experiencedInterviewerCount: number;
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
  elapsedMs: number;
  jobStatus: SolveJob["status"] | null;
  estimatedSeconds: number;
  lockedCount: number;
  hasProposal: boolean;
  changeableInterviewCount: number;
  currentDraftReady: boolean;
  openRequestKey: number;
  onSolve: () => void;
  onCancel: () => void;
  onOpenAvailability: () => void;
  onOpenFramework: () => void;
  onOpenConflictReview: () => void;
}

const presetFor = (options: SolverOptions) =>
  INITIAL_STRATEGY_PRESETS.find(
    (preset) =>
      preset.key === options.initial_strategy &&
      preset.loadBalanceWeight === options.load_balance_weight &&
      preset.continuityWeight === options.continuity_weight &&
      preset.prioritizeContinuity === options.prioritize_continuity,
  );

const AdvancedOptionRow = ({
  title,
  description,
  checked,
  onToggle,
  autofocus = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  autofocus?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    data-autofocus={autofocus || undefined}
    className="flex w-full items-center justify-between gap-4 border-b border-border-soft py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
  >
    <span className="min-w-0">
      <span className="block text-ui font-semibold text-text-primary">
        {title}
      </span>
      <span className="mt-0.5 block text-detail leading-snug text-text-muted">
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
  experiencedInterviewerCount,
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
  elapsedMs,
  jobStatus,
  estimatedSeconds,
  lockedCount,
  hasProposal,
  changeableInterviewCount,
  currentDraftReady,
  openRequestKey,
  onSolve,
  onCancel,
  onOpenAvailability,
  onOpenFramework,
  onOpenConflictReview,
}: SolverSetupPanelProps) => {
  const [advancedDrawerOpen, setAdvancedDrawerOpen] = useState(false);
  const [regenerationOpen, setRegenerationOpen] = useState(false);
  const [strategyComparisonOpen, setStrategyComparisonOpen] = useState(false);
  const lastOpenRequestRef = useRef(openRequestKey);
  const configurationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openRequestKey === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = openRequestKey;
    setRegenerationOpen(true);
    window.requestAnimationFrame(() =>
      configurationRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      }),
    );
  }, [openRequestKey]);

  const panelFormationImpossible = interviewerCount < panelSize;
  const allInterviewersRequired =
    interviewerCount > 0 && interviewerCount === panelSize;
  const generationBlocked =
    !currentDraftReady ||
    panelFormationImpossible ||
    (solverOptions.require_experienced_panel &&
      experiencedInterviewerCount === 0) ||
    !availabilityReady ||
    !readiness.ready;
  const conflictBlockedCandidate = readiness.conflictBlockedCandidates[0];
  const capabilityBlockedCandidate = readiness.capabilityBlockedCandidates[0];
  const matchedPreset = presetFor(solverOptions);
  const selectedPreset =
    INITIAL_STRATEGY_PRESETS.find(
      (preset) => preset.key === solverOptions.initial_strategy,
    ) ?? INITIAL_STRATEGY_PRESETS[0];
  const advancedSummary = deriveAdvancedSettingsSummary(solverOptions);
  const waitingForWorker = jobStatus === "PENDING";
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
    ? elapsedMs >= 8000
      ? import.meta.env.DEV
        ? "Planleggingstjenesten har ikke hentet jobben — start utviklingsmiljøet med «make dev»."
        : "Planleggingstjenesten har ikke hentet jobben — kontroller bakgrunnstjenesten."
      : "Venter på ledig planleggingstjeneste…"
    : progressMessageFor(elapsedMs, estimatedMs);

  const choosePreset = (key: InitialPlanningStrategy) => {
    const preset = INITIAL_STRATEGY_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    onSolverOptionsChange((current) => ({
      ...current,
      initial_strategy: preset.key,
      load_balance_weight: preset.loadBalanceWeight,
      continuity_weight: preset.continuityWeight,
      prioritize_continuity: preset.prioritizeContinuity,
    }));
  };

  const choosePanelStability = (value: PanelStability) => {
    onSolverOptionsChange((current) => ({
      ...current,
      policy_version: 2,
      panel_stability: value,
      same_panel_per_block: value === "required",
    }));
  };

  const resetAdvancedOptions = () => {
    onSolverOptionsChange((current) => ({
      ...current,
      enforce_same_gender: ADVANCED_SOLVER_DEFAULTS.enforce_same_gender,
      require_experienced_panel:
        ADVANCED_SOLVER_DEFAULTS.require_experienced_panel,
      panel_stability: ADVANCED_SOLVER_DEFAULTS.panel_stability,
      same_panel_per_block: ADVANCED_SOLVER_DEFAULTS.same_panel_per_block,
      avoid_consecutive_interviewer_blocks:
        ADVANCED_SOLVER_DEFAULTS.avoid_consecutive_interviewer_blocks,
    }));
  };

  const blockedDescription = !currentDraftReady
    ? "Vent til endringene i utkastet er lagret før du lager et nytt forslag."
    : panelFormationImpossible
      ? `Velg maksimalt ${interviewerCount} per intervju.`
      : solverOptions.require_experienced_panel &&
          experiencedInterviewerCount === 0
        ? "Klassifiser minst én deltakende intervjuer som erfaren, eller slå av erfaringskravet."
        : !availabilityReady
          ? "Vent til alle intervjuere har svart eller meldt at de ikke deltar."
          : conflictBlockedCandidate
            ? `${conflictBlockedCandidate.candidate.name} har ${
                conflictBlockedCandidate.eligibleInterviewerCount === 0
                  ? "ingen habile intervjuere"
                  : conflictBlockedCandidate.eligibleInterviewerCount === 1
                    ? "bare én habil intervjuer"
                    : `bare ${conflictBlockedCandidate.eligibleInterviewerCount} habile intervjuere`
              }, mens panelet krever ${panelSize}. Kontroller registrert inhabilitet før du genererer på nytt.`
            : capabilityBlockedCandidate
              ? `${capabilityBlockedCandidate.candidate.name} kan ikke få et panel som oppfyller ${
                  capabilityBlockedCandidate.reasons.length === 2
                    ? "kravene til erfaring og kjønn"
                    : capabilityBlockedCandidate.reasons[0] === "experience"
                      ? "kravet om en erfaren intervjuer"
                      : "kravet om samme kjønn"
                }. Juster reglene eller intervjuergruppen før du genererer på nytt.`
              : readiness.neededCapacity === 0
                ? "Ingen aktive kandidater er klare for planlegging."
                : readiness.usableSlotCount <
                    readiness.neededCapacity / Math.max(panelSize, 1)
                  ? "Det er ikke nok åpne intervjutider med full paneldekning."
                  : "Intervjuerne har ikke nok samlet tilgjengelig kapasitet.";
  const blockedAction = !currentDraftReady
    ? null
    : panelFormationImpossible
      ? interviewerCount > 0
        ? {
            label: `Bruk ${interviewerCount} per intervju`,
            run: () => onPanelSizeChange(interviewerCount),
          }
        : { label: "Se intervjuere", run: onOpenAvailability }
      : !availabilityReady
        ? { label: "Se hvem som mangler", run: onOpenAvailability }
        : conflictBlockedCandidate
          ? {
              label: "Endre mitt svar",
              run: onOpenConflictReview,
            }
          : capabilityBlockedCandidate
            ? {
                label: "Tilpass regler",
                run: () => setAdvancedDrawerOpen(true),
              }
            : readiness.neededCapacity === 0
              ? null
              : readiness.usableSlotCount <
                  readiness.neededCapacity / Math.max(panelSize, 1)
                ? { label: "Juster tidsoppsettet", run: onOpenFramework }
                : { label: "Se tilgjengelighet", run: onOpenAvailability };

  const showConfiguration = !hasProposal || regenerationOpen;

  return (
    <>
      {showConfiguration && (
        <div
          ref={configurationRef}
          data-cy={
            hasProposal ? "regeneration-settings" : "generation-settings"
          }
          className="mx-auto w-full max-w-3xl scroll-mt-4"
        >
          <SchedulePanel dataCy="generation-status">
            <SchedulePanelHeader
              icon={Sparkles}
              title={hasProposal ? "Lag et nytt forslag" : "Lag planutkast"}
              description={
                hasProposal
                  ? "Det gjeldende utkastet beholdes til du eventuelt velger det nye forslaget."
                  : "Start med det anbefalte oppsettet. Flere valg er tilgjengelige når du trenger dem."
              }
              actions={
                hasProposal ? (
                  <button
                    type="button"
                    onClick={() => setRegenerationOpen(false)}
                    className={cn(actionButtonBase, actionButtonNeutral)}
                  >
                    Skjul
                  </button>
                ) : undefined
              }
            />
            <SchedulePanelBody className="space-y-5 px-5 py-5">
              <p className="m-0 text-detail text-text-muted tabular-nums">
                {readiness.submittedInterviewers} intervjuere klare ·{" "}
                {openBlockCount} åpne blokker · {interviewSlotCount}{" "}
                intervjutider
              </p>

              {hasProposal && lockedCount > 0 && (
                <p className="m-0 rounded-md bg-surface-subtle px-3 py-2 text-detail text-text-muted">
                  {lockedCount} låste intervjuer beholdes;{" "}
                  {changeableInterviewCount} kan flyttes.
                </p>
              )}

              <section
                aria-labelledby="panel-size-heading"
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div>
                  <h3
                    id="panel-size-heading"
                    className="m-0 text-ui font-semibold text-text-primary"
                  >
                    Intervjuere per intervju
                  </h3>
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Hvert intervju får dette antallet personer i panelet.
                  </p>
                </div>
                <div data-cy="panel-size">
                  <Stepper
                    value={panelSize}
                    min={1}
                    max={Math.max(1, interviewerCount)}
                    onStep={onPanelSizeChange}
                    aria-label="Panelstørrelse"
                  />
                </div>
              </section>

              <section aria-labelledby="strategy-heading">
                <h3
                  id="strategy-heading"
                  className="m-0 text-ui font-semibold text-text-primary"
                >
                  Fordeling
                </h3>
                {allInterviewersRequired ? (
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Alle intervjuere må delta i hvert intervju, så en
                    fordelingsstrategi vil ikke endre resultatet.
                  </p>
                ) : (
                  <>
                    <CustomSelect
                      value={solverOptions.initial_strategy}
                      onChange={(value) =>
                        choosePreset(value as InitialPlanningStrategy)
                      }
                      options={INITIAL_STRATEGY_PRESETS.map((preset) => ({
                        value: preset.key,
                        label: `${preset.label}${
                          preset.key === "balanced" ? " — anbefalt" : ""
                        }`,
                      }))}
                      aria-label="Planleggingsstrategi"
                      className="mt-2 w-full sm:max-w-md"
                    />
                    <p className="m-0 mt-2 text-detail leading-relaxed text-text-muted">
                      {matchedPreset
                        ? matchedPreset.description
                        : `Tilpasset · basert på ${selectedPreset.label}.`}
                    </p>
                    <button
                      type="button"
                      aria-expanded={strategyComparisonOpen}
                      onClick={() => setStrategyComparisonOpen((open) => !open)}
                      className="mt-2 inline-flex items-center gap-1 text-detail font-semibold text-brand hover:underline"
                    >
                      Sammenlign strategier
                      <ChevronDown
                        size={15}
                        aria-hidden="true"
                        className={cn(
                          "transition-transform",
                          strategyComparisonOpen && "rotate-180",
                        )}
                      />
                    </button>
                    {strategyComparisonOpen && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {INITIAL_STRATEGY_PRESETS.map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            onClick={() => choosePreset(preset.key)}
                            className={cn(
                              "rounded-lg border px-3 py-3 text-left",
                              solverOptions.initial_strategy === preset.key
                                ? "border-brand-border bg-brand-soft"
                                : "border-border-soft bg-surface-base hover:bg-surface-subtle",
                            )}
                          >
                            <strong className="block text-detail text-text-primary">
                              {preset.label}
                            </strong>
                            <span className="mt-1 block text-detail leading-snug text-text-muted">
                              {preset.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>

              <section className="flex flex-wrap items-center justify-between gap-3 border-y border-border-soft py-3">
                <div className="min-w-0">
                  <h3 className="m-0 text-ui font-semibold text-text-primary">
                    Regler
                  </h3>
                  <p
                    data-cy="advanced-settings-summary"
                    className="m-0 mt-1 text-detail text-text-muted"
                  >
                    {advancedSummary.text}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedDrawerOpen(true)}
                  data-cy="open-advanced-generation-settings"
                  className={cn(actionButtonBase, actionButtonNeutral)}
                >
                  <SlidersHorizontal
                    size={iconSizes.small}
                    aria-hidden="true"
                  />
                  Tilpass regler
                </button>
              </section>

              {error && !hasProposal && (
                <div
                  role="alert"
                  className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-ui font-semibold text-danger"
                >
                  {error}
                </div>
              )}

              {!error &&
                (generationBlocked ? (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3"
                  >
                    <p className="m-0 flex items-start gap-2 text-ui font-semibold text-amber-900">
                      <AlertTriangle
                        size={iconSizes.small}
                        className="mt-0.5 flex-none"
                        aria-hidden="true"
                      />
                      {blockedDescription}
                    </p>
                    {blockedAction && (
                      <button
                        type="button"
                        onClick={blockedAction.run}
                        className="text-ui font-semibold text-brand hover:underline"
                      >
                        {blockedAction.label}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="m-0 flex items-center gap-2 text-detail font-semibold text-success">
                    <Check size={iconSizes.small} aria-hidden="true" />
                    Klar til å generere.
                  </p>
                ))}
            </SchedulePanelBody>

            {loading && (
              <div className="border-t border-border-soft bg-surface-mutedSoft px-5 py-3">
                <div
                  role="progressbar"
                  aria-label="Genererer plan"
                  aria-valuenow={
                    waitingForWorker ? undefined : Math.round(progressPercent)
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
                <div className="mt-2 flex justify-between gap-2 text-detail text-text-muted">
                  <span aria-live="polite">{progressMessage}</span>
                  <strong className="tabular-nums text-text-primary">
                    {(elapsedMs / 1000).toFixed(1)}s
                  </strong>
                </div>
              </div>
            )}

            <SchedulePanelFooter className="justify-end">
              <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                {loading && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className={cn(
                      actionButtonBase,
                      actionButtonNeutral,
                      "handheld:flex-1",
                    )}
                  >
                    Avbryt
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSolve}
                  disabled={loading || generationBlocked}
                  data-cy="generate-proposal"
                  className={cn(
                    actionButtonBase,
                    actionButtonPrimary,
                    "handheld:flex-1",
                  )}
                >
                  <Sparkles size={iconSizes.small} aria-hidden="true" />
                  {loading
                    ? "Genererer…"
                    : hasProposal
                      ? "Lag nytt forslag"
                      : "Lag planutkast"}
                </button>
              </div>
            </SchedulePanelFooter>
          </SchedulePanel>
        </div>
      )}

      <ScheduleDrawer
        open={advancedDrawerOpen}
        onClose={() => setAdvancedDrawerOpen(false)}
        title="Tilpass regler"
        description="Krav må alltid oppfylles. Prioriteringer brukes når flere gyldige planer finnes."
        dataCy="generation-drawer"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={resetAdvancedOptions}
              data-cy="reset-advanced-generation-settings"
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              <RotateCcw size={iconSizes.small} aria-hidden="true" />
              Tilbakestill
            </button>
            <button
              type="button"
              onClick={() => setAdvancedDrawerOpen(false)}
              className={cn(actionButtonBase, actionButtonPrimary)}
            >
              Ferdig
            </button>
          </div>
        }
      >
        <div className="space-y-6" data-cy="advanced-settings">
          <section>
            <p className={sectionLabelClass}>Krav</p>
            <AdvancedOptionRow
              title="Samme kjønn i panel"
              description="Krev minst én intervjuer med samme kjønn der kjønn er registrert."
              checked={solverOptions.enforce_same_gender}
              onToggle={() =>
                onSolverOptionsChange((current) => ({
                  ...current,
                  enforce_same_gender: !current.enforce_same_gender,
                }))
              }
              autofocus
            />
            <AdvancedOptionRow
              title="Erfaren intervjuer i hvert panel"
              description="Krev minst én intervjuer som er klassifisert som erfaren. Ukjent erfaring teller ikke."
              checked={solverOptions.require_experienced_panel}
              onToggle={() =>
                onSolverOptionsChange((current) => ({
                  ...current,
                  require_experienced_panel: !current.require_experienced_panel,
                }))
              }
            />
            {allInterviewersRequired ? (
              <p className="m-0 py-3 text-detail text-text-muted">
                Panelstabilitet har ingen effekt når alle må delta i hvert
                intervju.
              </p>
            ) : (
              <div className="py-3">
                <p className="m-0 text-ui font-semibold text-text-primary">
                  Panel i samme blokk
                </p>
                <div
                  role="radiogroup"
                  aria-label="Panelstabilitet"
                  className="mt-2 grid gap-2"
                >
                  {(
                    [
                      {
                        key: "preferred",
                        label: "Foretrekk samme panel — anbefalt",
                        description:
                          "Bevar panelet når det er mulig, men tillat nødvendige bytter.",
                      },
                      {
                        key: "required",
                        label: "Krev samme panel",
                        description:
                          "Avvis planer som bytter panel i en blokk.",
                      },
                      {
                        key: "flexible",
                        label: "La panelet variere",
                        description:
                          "Ikke prioriter samme panel gjennom blokken.",
                      },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={
                        solverOptions.panel_stability === option.key
                      }
                      onClick={() => choosePanelStability(option.key)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-left",
                        solverOptions.panel_stability === option.key
                          ? "border-brand bg-brand-soft"
                          : "border-border-soft bg-surface-base",
                      )}
                    >
                      <span className="block text-detail font-semibold text-text-primary">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-detail text-text-muted">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section>
            <p className={sectionLabelClass}>Prioritering</p>
            <AdvancedOptionRow
              title="Hvile mellom arbeidsblokker"
              description="Prøv å la en intervjuer stå over neste blokk. Strategien styrer hvor kompakt dagen ellers blir."
              checked={solverOptions.avoid_consecutive_interviewer_blocks}
              onToggle={() =>
                onSolverOptionsChange((current) => ({
                  ...current,
                  avoid_consecutive_interviewer_blocks:
                    !current.avoid_consecutive_interviewer_blocks,
                }))
              }
            />
          </section>
        </div>
      </ScheduleDrawer>
    </>
  );
};

export default SolverSetupPanel;
