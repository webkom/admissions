import React from "react";
import { Lock } from "lucide-react";
import cn from "src/utils/cn";
import type { TabType, WorkflowStepDefinition } from "./types";

interface WorkflowStepperProps {
  steps: WorkflowStepDefinition[];
  activeKey: TabType;
  onChange: (key: TabType) => void;
}

/** Small leading status marker — a filled/hollow dot or a lock glyph — so the
 *  step's state reads at a glance instead of relying on the label text alone. */
const StatusMarker: React.FC<{
  tone: WorkflowStepDefinition["tone"];
  active: boolean;
}> = ({ tone, active }) => {
  if (tone === "locked") {
    return <Lock size={10} className="flex-none text-text-faded" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-2 w-2 flex-none rounded-full",
        tone === "success"
          ? "bg-success"
          : tone === "active" || active
            ? "bg-brand animate-pulse-brand"
            : "border border-border-quiet",
      )}
    />
  );
};

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeKey,
  onChange,
}) => (
  <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
    {steps.map((step, idx) => {
      const active = activeKey === step.key;
      const Icon = step.icon;
      return (
        <button
          key={step.key}
          type="button"
          disabled={step.locked}
          onClick={() => onChange(step.key)}
          className={cn(
            "group relative flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all duration-200",
            active
              ? "border-brand bg-surface-base shadow-[0_12px_24px_-14px_rgba(var(--color-brand-rgb),0.18)] ring-1 ring-brand"
              : step.locked
                ? "cursor-not-allowed border-border-muted bg-surface-muted/40"
                : "border-border-muted bg-surface-base hover:border-brand-border hover:bg-brand-soft/30",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors duration-200",
              active
                ? "bg-brand text-white shadow-brand-sm"
                : step.locked
                  ? "bg-surface-subtle text-text-faded"
                  : step.tone === "success"
                    ? "bg-success-bg text-success"
                    : "bg-surface-subtle text-text-muted group-hover:bg-brand-soft group-hover:text-brand",
            )}
          >
            <Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                "truncate text-[13px] font-bold tracking-tight transition-colors",
                step.locked
                  ? "text-text-faded"
                  : active
                    ? "text-text-primary"
                    : "text-text-muted group-hover:text-text-primary",
              )}
            >
              {idx + 1}. {step.title}
            </h3>
            <p
              className={cn(
                "mt-0.5 line-clamp-2 text-tiny leading-snug",
                step.locked ? "text-text-disabled" : "text-text-faded",
              )}
            >
              {step.description}
            </p>
            <span className="mt-1 inline-flex items-center gap-1">
              <StatusMarker tone={step.tone} active={active} />
              <span
                className={cn(
                  "text-tiny font-semibold tabular-nums",
                  step.tone === "success"
                    ? "text-success"
                    : step.tone === "active" || active
                      ? "text-brand"
                      : "text-text-subtle",
                )}
              >
                {step.status}
              </span>
            </span>
          </div>
        </button>
      );
    })}
  </nav>
);

export default WorkflowStepper;
