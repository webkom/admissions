import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  GitCompareArrows,
  LoaderCircle,
} from "lucide-react";

import cn from "../../../utils/cn";
import { decodeScheduleTime } from "../scheduleUtils";
import type { RepairStrategy } from "../types";
import {
  Chip,
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
} from "../ui";
import { REPAIR_STRATEGY_PRESETS } from "./solverHelpers";
import type { RepairScenario } from "./repairScenarios";

interface RepairScenarioPanelProps {
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
  <SchedulePanel>
    <SchedulePanelHeader
      icon={AlertTriangle}
      title={`${conflictCount} ny inhabilitet${conflictCount === 1 ? "" : "er"}`}
      description="Velg hva solveren skal beskytte. Først forhåndsviser vi endringene; utkastet lagres ikke før du bruker løsningen."
      chips={<Chip tone="warning">Må løses før publisering</Chip>}
    />
    <SchedulePanelBody className="flex flex-col gap-5 px-5 py-5">
      <div>
        <p className="m-0 mb-2 text-detail font-semibold uppercase tracking-badge text-text-muted">
          Ved ny generering
        </p>
        <div
          role="radiogroup"
          aria-label="Ved ny generering"
          className="divide-y divide-border-soft border-y border-border-soft"
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
                className="flex w-full items-start gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus disabled:cursor-wait disabled:opacity-60"
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
                  {active && (
                    <span className="mt-0.5 block text-detail leading-relaxed text-text-muted">
                      {preset.description}
                    </span>
                  )}
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
        <div className="overflow-hidden rounded-lg border border-border-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-detail">
              <thead className="bg-surface-mutedSoft text-text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Løsning</th>
                  <th className="px-3 py-2.5 font-semibold">Intervjuer</th>
                  <th className="px-3 py-2.5 font-semibold">Nye tider</th>
                  <th className="px-3 py-2.5 font-semibold">
                    Berørte personer
                  </th>
                  <th className="px-3 py-2.5 font-semibold">Panelavvik</th>
                  <th className="px-3 py-2.5 font-semibold">Overtid</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => {
                  const active =
                    selectedScenario?.strategy === scenario.strategy;
                  return (
                    <tr
                      key={scenario.strategy}
                      className={cn(
                        "cursor-pointer border-t border-border-soft",
                        active ? "bg-brand-panel" : "hover:bg-surface-subtle",
                      )}
                      onClick={() => onSelectScenario(scenario.strategy)}
                    >
                      <td className="px-3 py-3 font-semibold text-text-primary">
                        {strategyLabel(scenario.strategy)}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {scenario.metrics.changedInterviews}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {scenario.metrics.changedTimes}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {scenario.metrics.affectedInterviewers}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {scenario.metrics.brokenPanelBlocks}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {signedMinutes(scenario.metrics.overtimeDeltaMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedScenario && (
            <div className="border-t border-border-soft bg-surface-subtle px-4 py-4">
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
              <div className="mt-3 flex flex-col gap-2">
                {selectedScenario.changes.slice(0, 6).map((change) => (
                  <div
                    key={`${change.candidate}:${change.beforeTime ?? "new"}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-detail text-text-muted"
                  >
                    <strong className="text-text-primary">
                      {change.candidate}
                    </strong>
                    {change.beforeTime !== change.afterTime && (
                      <span>
                        {formatTime(change.beforeTime, dates, sessionDuration)}{" "}
                        → {formatTime(change.afterTime, dates, sessionDuration)}
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
                {selectedScenario.changes.length > 6 && (
                  <p className="m-0 text-detail text-text-subtle">
                    + {selectedScenario.changes.length - 6} flere endrede
                    intervjuer
                  </p>
                )}
              </div>
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
    </SchedulePanelBody>
    <SchedulePanelFooter>
      <div className="text-detail text-text-muted">
        Alle alternativer bruker samme plan og samme inhabiliteter.
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          className={cn(actionButtonBase, actionButtonNeutral)}
          onClick={onCompare}
          disabled={loading}
        >
          <GitCompareArrows size={16} />
          Sammenlign tre løsninger
        </button>
        {selectedScenario ? (
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonPrimary)}
            onClick={() => onApply(selectedScenario)}
            disabled={loading}
          >
            Bruk denne løsningen
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={cn(actionButtonBase, actionButtonPrimary)}
            onClick={() => onPreview(selectedStrategy)}
            disabled={loading}
          >
            Forhåndsvis løsning
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </SchedulePanelFooter>
  </SchedulePanel>
);

export default RepairScenarioPanel;
