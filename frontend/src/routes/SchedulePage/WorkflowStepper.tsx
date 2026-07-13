import React from "react";
import { Lock } from "lucide-react";
import cn from "src/utils/cn";
import type { TabType, WorkflowStepDefinition } from "./types";

interface WorkflowStepperProps {
  steps: WorkflowStepDefinition[];
  activeKey: TabType;
  onChange: (key: TabType) => void;
}

const StatusMarker: React.FC<{
  tone: WorkflowStepDefinition["tone"];
  active: boolean;
}> = ({ tone, active }) => {
  if (tone === "locked") {
    return (
      <Lock
        size={10}
        aria-hidden="true"
        className="flex-none text-text-subtle"
      />
    );
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
  <nav
    aria-label="Steg i intervjuplanleggingen"
    className="flex w-full overflow-x-auto border-b-2 border-border bg-surface-base px-2"
  >
    {steps.map((step, idx) => {
      const active = activeKey === step.key;
      const Icon = step.icon;
      return (
        <button
          key={step.key}
          type="button"
          disabled={step.locked}
          aria-current={active ? "step" : undefined}
          onClick={() => onChange(step.key)}
          className={cn(
            "group -mb-0.5 flex min-w-fit items-center gap-2 border-b-2 px-4 py-3 text-left transition-colors duration-100",
            active
              ? "border-brand text-brand"
              : step.locked
                ? "cursor-not-allowed border-transparent text-text-disabled"
                : "border-transparent text-text-muted hover:border-border-quiet hover:text-text-primary",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 flex-none items-center justify-center transition-colors duration-100",
              active
                ? "text-brand"
                : step.locked
                  ? "text-text-disabled"
                  : step.tone === "success"
                    ? "text-success"
                    : "text-text-muted group-hover:text-text-primary",
            )}
          >
            <Icon size={14} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3
              className={cn(
                "m-0 whitespace-nowrap text-sm font-semibold transition-colors",
                step.locked
                  ? "text-text-disabled"
                  : active
                    ? "text-brand"
                    : "text-inherit",
              )}
            >
              {idx + 1}. {step.title}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1">
              <StatusMarker tone={step.tone} active={active} />
              <span
                className={cn(
                  "text-tiny font-medium tabular-nums",
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
