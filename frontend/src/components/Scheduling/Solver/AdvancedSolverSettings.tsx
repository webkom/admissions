import React, { type RefObject } from "react";
import { RotateCcw } from "lucide-react";

import {
  Stepper,
  actionButtonBase,
  actionButtonNeutral,
  keyboardFocusRingClass,
  sectionLabelClass,
} from "../ui";
import type { SolverOptions } from "../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

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
  onOpenExperienceEditor: () => void;
  onReset: () => void;
  onClose: () => void;
  /** Locked rows in the current draft; the rebalance option only matters
   *  when there is something to re-flow. */
  lockedCount: number;
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
  onOpenExperienceEditor,
  onReset,
  onClose,
  lockedCount,
  preview,
}: AdvancedSolverSettingsProps) => {
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
          className="m-0 text-title font-semibold text-text-primary focus:outline-none"
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
          </section>

          {lockedCount > 0 && (
            <section className="border-t border-border-soft pt-5">
              <p className={sectionLabelClass}>Låste intervjuer</p>
              <AdvancedOptionRow
                title="Frigjør låste rader i utkastet"
                description="Solveren kan flytte låste intervjuer i utkastet for å få plass til nye kandidater. Publiserte dager flyttes aldri."
                checked={solverOptions.rebalance_locked}
                onToggle={() =>
                  onSolverOptionsChange((current) => ({
                    ...current,
                    rebalance_locked: !current.rebalance_locked,
                  }))
                }
                helper={
                  <p className="m-0 text-detail text-text-muted">
                    {lockedCount} låste intervjuer kan flyttes når dette er på.
                  </p>
                }
              />
            </section>
          )}

          <section className="border-t border-border-soft pt-5">
            <p className={sectionLabelClass}>Intervjuform</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="m-0 text-ui font-semibold text-text-primary">
                  Kandidater per intervju
                </p>
                <p className="m-0 mt-1 text-detail text-text-muted">
                  1 er et vanlig intervju. Velg 2 eller flere for at ett panel
                  intervjuer akkurat det antallet kandidater sammen i samme
                  tidsluke. Kandidater som ikke kan plasseres i et fullt
                  fellesintervju, blir stående uten intervju.
                </p>
              </div>
              <div data-cy="candidates-per-session">
                <Stepper
                  value={solverOptions.candidates_per_session}
                  min={1}
                  max={4}
                  onStep={(value) =>
                    onSolverOptionsChange((current) => ({
                      ...current,
                      candidates_per_session: value,
                    }))
                  }
                  aria-label="Kandidater per intervju"
                />
              </div>
            </div>
          </section>
        </div>

        {preview}
      </div>
    </section>
  );
};

export default AdvancedSolverSettings;
