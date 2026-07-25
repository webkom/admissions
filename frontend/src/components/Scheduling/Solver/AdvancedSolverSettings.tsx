import React, { useState, type RefObject } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

import {
  CustomSelect,
  Stepper,
  actionButtonBase,
  actionButtonNeutral,
  keyboardFocusRingClass,
  sectionLabelClass,
} from "../ui";
import type {
  InitialPlanningStrategy,
  PanelStability,
  SolverOptions,
} from "../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";
import { INITIAL_STRATEGY_PRESETS } from "./solverHelpers";

const AdvancedOptionRow = ({
  title,
  description,
  checked,
  onToggle,
  helper,
  autofocus = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  helper?: React.ReactNode;
  autofocus?: boolean;
}) => (
  <div className="border-b border-border-soft py-3 last:border-b-0">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      data-autofocus={autofocus || undefined}
      className="flex w-full items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
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
          "inline-flex h-6 w-10 flex-none items-center rounded-full border p-0.5 transition-colors",
          checked
            ? "border-brand bg-brand"
            : "border-border-muted bg-surface-muted",
        )}
      >
        <span
          className={cn(
            "block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
    {helper && <div className="mt-2 pl-0.5">{helper}</div>}
  </div>
);

interface AdvancedSolverSettingsProps {
  headingRef: RefObject<HTMLHeadingElement>;
  interviewerCount: number;
  experiencedInterviewerCount: number;
  panelSize: number;
  onPanelSizeChange: (value: number) => void;
  solverOptions: SolverOptions;
  onSolverOptionsChange: React.Dispatch<React.SetStateAction<SolverOptions>>;
  allInterviewersRequired: boolean;
  matchedPreset: (typeof INITIAL_STRATEGY_PRESETS)[number] | undefined;
  selectedPreset: (typeof INITIAL_STRATEGY_PRESETS)[number];
  onChoosePreset: (key: InitialPlanningStrategy) => void;
  onChoosePanelStability: (value: PanelStability) => void;
  onOpenExperienceEditor: () => void;
  onReset: () => void;
  onClose: () => void;
  preview: React.ReactNode;
}

const AdvancedSolverSettings = ({
  headingRef,
  interviewerCount,
  experiencedInterviewerCount,
  panelSize,
  onPanelSizeChange,
  solverOptions,
  onSolverOptionsChange,
  allInterviewersRequired,
  matchedPreset,
  selectedPreset,
  onChoosePreset,
  onChoosePanelStability,
  onOpenExperienceEditor,
  onReset,
  onClose,
  preview,
}: AdvancedSolverSettingsProps) => {
  const [strategyComparisonOpen, setStrategyComparisonOpen] = useState(false);
  const experiencedSummary =
    experiencedInterviewerCount === 0
      ? "Ingen intervjuere er markert som erfarne ennå."
      : experiencedInterviewerCount === 1
        ? "1 intervjuer er markert som erfaren."
        : `${experiencedInterviewerCount} intervjuere er markert som erfarne.`;

  return (
    <section
      id="advanced-generation-settings"
      data-cy="generation-workspace"
      className="border-b border-border-soft pb-6"
      aria-labelledby="advanced-generation-settings-heading"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3
          ref={headingRef}
          id="advanced-generation-settings-heading"
          tabIndex={-1}
          className="m-0 text-base font-semibold text-text-primary focus:outline-none"
        >
          Tilpass oppsett
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            data-cy="reset-advanced-generation-settings"
            className={cn(actionButtonBase, actionButtonNeutral)}
          >
            <RotateCcw size={iconSizes.small} aria-hidden="true" />
            Tilbakestill
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(actionButtonBase, actionButtonNeutral)}
          >
            Ferdig
          </button>
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-7 tablet:grid-cols-[minmax(var(--schedule-settings-column-min-width),0.9fr)_minmax(0,1.1fr)] tablet:items-start">
        <div className="min-w-0 space-y-6" data-cy="advanced-settings">
          <section>
            <p className={sectionLabelClass}>Panel</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="m-0 text-ui font-semibold text-text-primary">
                  Intervjuere per intervju
                </p>
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
            </div>
          </section>

          <section className="border-t border-border-soft pt-5">
            <p className={sectionLabelClass}>Fordeling</p>
            {allInterviewersRequired ? (
              <p className="m-0 text-detail text-text-muted">
                Alle intervjuere må delta i hvert intervju, så en
                fordelingsstrategi vil ikke endre resultatet.
              </p>
            ) : (
              <>
                <CustomSelect
                  value={solverOptions.initial_strategy}
                  onChange={(value) =>
                    onChoosePreset(value as InitialPlanningStrategy)
                  }
                  options={INITIAL_STRATEGY_PRESETS.map((preset) => ({
                    value: preset.key,
                    label: `${preset.label}${
                      preset.key === "balanced" ? " — anbefalt" : ""
                    }`,
                  }))}
                  aria-label="Planleggingsstrategi"
                  className="w-full"
                />
                <p className="m-0 mt-2 text-detail leading-relaxed text-text-muted">
                  {matchedPreset
                    ? matchedPreset.description
                    : `Tilpasset, basert på ${selectedPreset.label}.`}
                </p>
                <button
                  type="button"
                  aria-expanded={strategyComparisonOpen}
                  onClick={() => setStrategyComparisonOpen((open) => !open)}
                  className={cn(
                    "mt-2 inline-flex items-center gap-1 text-detail font-semibold text-brand hover:underline",
                    keyboardFocusRingClass,
                  )}
                >
                  Sammenlign strategier
                  <ChevronDown
                    size={iconSizes.control}
                    aria-hidden="true"
                    className={cn(
                      "transition-transform motion-reduce:transition-none",
                      strategyComparisonOpen && "rotate-180",
                    )}
                  />
                </button>
                {strategyComparisonOpen && (
                  <div className="mt-3 divide-y divide-border-soft overflow-hidden rounded-md border border-border-soft">
                    {INITIAL_STRATEGY_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => onChoosePreset(preset.key)}
                        className={cn(
                          "block w-full px-3 py-3 text-left",
                          solverOptions.initial_strategy === preset.key
                            ? "bg-brand-soft"
                            : "bg-surface-base hover:bg-surface-subtle",
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

          <section className="border-t border-border-soft pt-5">
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
              helper={
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-detail text-text-muted">
                  <span>{experiencedSummary}</span>
                  <button
                    type="button"
                    data-cy="open-experience-levels"
                    onClick={() => {
                      onClose();
                      onOpenExperienceEditor();
                    }}
                    className={cn(
                      "font-semibold text-brand hover:underline",
                      keyboardFocusRingClass,
                    )}
                  >
                    Velg erfarne
                  </button>
                </div>
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
                      onClick={() => onChoosePanelStability(option.key)}
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

          <section className="border-t border-border-soft pt-5">
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

        {preview}
      </div>
    </section>
  );
};

export default AdvancedSolverSettings;
