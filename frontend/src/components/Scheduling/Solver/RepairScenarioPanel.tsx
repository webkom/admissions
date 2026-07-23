import React from "react";
import { ArrowRight, GitCompareArrows, LoaderCircle } from "lucide-react";

import cn from "../../../utils/cn";
import ScheduleDrawer from "../ScheduleDrawer";
import { decodeScheduleTime } from "../scheduleUtils";
import type { RepairStrategy } from "../types";
import {
  Chip,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";
import { REPAIR_STRATEGY_PRESETS } from "./solverHelpers";
import type { RepairScenario } from "./repairScenarios";

interface RepairScenarioPanelProps {
  open: boolean;
  onClose: () => void;
  conflictCount: number;
  selectedStrategy: RepairStrategy;
  onSelectedStrategyChange: (strategy: RepairStrategy) => void;
  scenarios: RepairScenario[];
  selectedScenario?: RepairScenario;
  onSelectScenario: (strategy: RepairStrategy) => void;
  onPreview: (strategy: RepairStrategy) => void;
  onCompare: () => void;
  onApply: (scenario: RepairScenario) => void;
  loading: boolean;
  runningStrategy?: RepairStrategy;
  error: string;
  dates: string[];
  sessionDuration: number;
}

const signedMinutes = (minutes: number) =>
  minutes > 0 ? `+${minutes} min` : `${minutes} min`;

const formatTime = (
  time: number | undefined,
  dates: string[],
  sessionDuration: number,
) => {
  if (time === undefined) return "ikke satt";
  const { dayIndex, minute } = decodeScheduleTime(time, sessionDuration);
  const date = dates[dayIndex] ?? `Dag ${dayIndex + 1}`;
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  const minutes = String(minute % 60).padStart(2, "0");
  return `${date} kl. ${hours}:${minutes}`;
};

const strategyLabel = (strategy: RepairStrategy) =>
  REPAIR_STRATEGY_PRESETS.find((preset) => preset.key === strategy)?.label ??
  strategy;

const regenerationLabel = (strategy: RepairStrategy) =>
  strategy === "minimum_change"
    ? "Behold mest mulig"
    : strategy === "preserve_panels"
      ? "Behold panelene"
      : "Tillat flere endringer";

const RepairScenarioPanel = ({
  open,
  onClose,
  conflictCount,
  selectedStrategy,
  onSelectedStrategyChange,
  scenarios,
  selectedScenario,
  onSelectScenario,
  onPreview,
  onCompare,
  onApply,
  loading,
  runningStrategy,
  error,
  dates,
  sessionDuration,
}: RepairScenarioPanelProps) => (
  <ScheduleDrawer
    open={open}
    onClose={onClose}
    title="Løs inhabiliteter"
    description={`${conflictCount} tildeling${conflictCount === 1 ? "" : "er"} må endres før planen kan publiseres. Ingen endringer lagres før du bruker en løsning.`}
    widthClassName="sm:max-w-2xl"
    dataCy="repair-schedule-drawer"
    footer={
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={cn(actionButtonBase, actionButtonNeutral)}
          onClick={onCompare}
          disabled={loading}
        >
          <GitCompareArrows size={16} aria-hidden="true" />
          Sammenlign alternativer
        </button>
        {selectedScenario ? (
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonPrimary)}
            onClick={() => onApply(selectedScenario)}
            disabled={loading}
          >
            Bruk denne løsningen
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonPrimary)}
            onClick={() => onPreview(selectedStrategy)}
            disabled={loading}
          >
            Forhåndsvis løsning
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    }
  >
    <div className="flex flex-col gap-5">
      <div>
        <p className="m-0 mb-2 text-ui font-bold text-text-primary">
          Hva skal bevares?
        </p>
        <div
          role="radiogroup"
          aria-label="Ved ny generering"
          className="overflow-hidden rounded-lg border border-border-soft"
        >
          {REPAIR_STRATEGY_PRESETS.map((preset) => {
            const active = selectedStrategy === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectedStrategyChange(preset.key)}
                disabled={loading}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border-soft px-4 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus disabled:cursor-wait disabled:opacity-60",
                  active ? "bg-brand-soft" : "hover:bg-surface-subtle",
                )}
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
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span>
                  <span className="block text-ui font-semibold text-text-primary">
                    {regenerationLabel(preset.key)}
                  </span>
                  <span className="mt-0.5 block text-detail leading-relaxed text-text-muted">
                    {preset.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-ui font-semibold text-danger">
          {error}
        </div>
      )}

      {scenarios.length > 0 && (
        <div className="space-y-3">
          <p className="m-0 text-ui font-bold text-text-primary">
            Beregnede alternativer
          </p>
          <div className="grid gap-2">
            {scenarios.map((scenario) => {
              const active = selectedScenario?.strategy === scenario.strategy;
              return (
                <button
                  key={scenario.strategy}
                  type="button"
                  onClick={() => onSelectScenario(scenario.strategy)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left",
                    active
                      ? "border-brand-strongBorder bg-brand-soft ring-1 ring-brand-ring"
                      : "border-border-soft hover:bg-surface-subtle",
                  )}
                >
                  <span className="block text-ui font-bold text-text-primary">
                    {strategyLabel(scenario.strategy)}
                  </span>
                  <span className="mt-1 block text-detail text-text-muted">
                    {scenario.metrics.changedInterviews} endrede intervjuer ·{" "}
                    {scenario.metrics.changedTimes} nye tider ·{" "}
                    {scenario.metrics.affectedInterviewers} berørte personer ·{" "}
                    {signedMinutes(scenario.metrics.overtimeDeltaMinutes)}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedScenario && (
            <div className="rounded-lg bg-surface-subtle px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="m-0 text-ui font-bold text-text-primary">
                    Forhåndsvisning · {strategyLabel(selectedScenario.strategy)}
                  </p>
                  <p className="m-0 mt-1 text-detail text-text-muted">
                    Arbeidsfordelingens spenn blir{" "}
                    {selectedScenario.metrics.workloadSpread} intervju
                    {selectedScenario.metrics.workloadSpread === 1 ? "" : "er"}.
                  </p>
                </div>
                {selectedScenario.metrics.changedTimes === 0 && (
                  <Chip tone="success">Ingen kandidater flyttes</Chip>
                )}
              </div>
              <details className="group mt-3">
                <summary className="cursor-pointer text-detail font-semibold text-brand">
                  Se konkrete endringer
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                  {selectedScenario.changes.map((change) => (
                    <div
                      key={`${change.candidate}:${change.beforeTime ?? "new"}`}
                      className="flex flex-col gap-0.5 border-t border-border-soft pt-2 text-detail text-text-muted first:border-0 first:pt-0"
                    >
                      <strong className="text-text-primary">
                        {change.candidate}
                      </strong>
                      {change.beforeTime !== change.afterTime && (
                        <span>
                          {formatTime(
                            change.beforeTime,
                            dates,
                            sessionDuration,
                          )}{" "}
                          →{" "}
                          {formatTime(change.afterTime, dates, sessionDuration)}
                        </span>
                      )}
                      {(change.removedInterviewers.length > 0 ||
                        change.addedInterviewers.length > 0) && (
                        <span>
                          {change.removedInterviewers.join(", ") || "Ingen"} →{" "}
                          {change.addedInterviewers.join(", ") || "Ingen"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-mutedSoft px-4 py-3 text-ui text-text-muted">
          <LoaderCircle size={17} className="animate-spin text-brand" />
          Beregner{" "}
          {runningStrategy
            ? strategyLabel(runningStrategy).toLowerCase()
            : "løsning"}{" "}
          fra samme utkast…
        </div>
      )}
    </div>
  </ScheduleDrawer>
);

export default RepairScenarioPanel;
