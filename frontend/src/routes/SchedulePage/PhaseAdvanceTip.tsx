import React from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  actionButtonBase,
  actionButtonPrimary,
} from "src/components/Scheduling/ui";
import cn from "src/utils/cn";
import type { TabType, WorkflowStepDefinition } from "./types";

const PhaseAdvanceTip: React.FC<{
  steps: WorkflowStepDefinition[];
  activeKey: TabType;
  onAdvance: (key: TabType) => void;
}> = ({ steps, activeKey, onAdvance }) => {
  const idx = steps.findIndex((step) => step.key === activeKey);
  if (idx === -1) return null;
  const current = steps[idx];
  const next = steps[idx + 1];
  if (current.tone !== "success" || !next) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-success-border bg-success-bg/60 px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-success text-white">
          <Check size={16} />
        </span>
        <div>
          <p className="m-0 text-sm font-bold text-text-primary">
            {current.title} er ferdig
          </p>
          <p className="m-0 text-detail text-text-muted">
            {next.locked
              ? `Neste steg: ${next.title}`
              : `Klar for neste steg — ${next.title}.`}
          </p>
        </div>
      </div>
      {!next.locked && (
        <button
          type="button"
          onClick={() => onAdvance(next.key)}
          className={cn(actionButtonBase, actionButtonPrimary)}
        >
          {next.title}
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
};

export default PhaseAdvanceTip;
