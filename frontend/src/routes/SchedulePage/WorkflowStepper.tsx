import React from "react";
import { Check, Lock } from "lucide-react";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import cn from "src/utils/cn";
import type { TabType, WorkflowStepDefinition } from "./types";

interface WorkflowStepperProps {
  steps: WorkflowStepDefinition[];
  activeKey: TabType;
  onChange: (key: TabType) => void;
}

const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  steps,
  activeKey,
  onChange,
}) => (
  <nav
    aria-label="Steg i intervjuplanleggingen"
    className="w-full rounded-panel bg-surface-base px-10 py-3 handheld:px-4"
  >
    <ol className="m-0 flex list-none flex-col gap-2 p-0 sm:flex-row sm:gap-0">
      {steps.map((step, idx) => {
        const stepKeys = step.keys ?? [step.key];
        const active = stepKeys.includes(activeKey);
        return (
          <li
            key={step.key}
            className={cn(
              "flex min-w-0 items-start sm:items-center",
              idx < steps.length - 1 ? "flex-1" : "sm:flex-none",
            )}
          >
            <button
              type="button"
              disabled={step.locked}
              aria-current={active ? "step" : undefined}
              onClick={() => onChange(step.navigateKey ?? stepKeys[0])}
              className={cn(
                "group flex min-h-12 min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
                active
                  ? "bg-surface-subtle text-text-primary"
                  : step.locked
                    ? "cursor-not-allowed text-text-disabled"
                    : "text-text-muted hover:bg-surface-subtle hover:text-text-primary",
              )}
            >
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full border text-detail font-bold tabular-nums transition-colors",
                  active
                    ? "border-brand bg-brand text-white"
                    : step.tone === "success"
                      ? "border-success bg-success text-white"
                      : step.locked
                        ? "border-border-soft bg-surface-muted text-text-disabled"
                        : "border-border-muted bg-surface-base text-text-muted",
                )}
              >
                {step.tone === "success" ? (
                  <Check
                    size={iconSizes.compact}
                    strokeWidth={iconStrokeWidths.emphasis}
                    aria-hidden="true"
                  />
                ) : (
                  step.locked && (
                    <Lock size={iconSizes.tiny} aria-hidden="true" />
                  )
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">
                  {idx + 1}. {step.title}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-tiny font-medium tabular-nums",
                    active
                      ? "text-text-muted"
                      : step.tone === "warning"
                        ? "text-amber-700"
                        : "text-text-subtle",
                  )}
                >
                  {step.status}
                </span>
              </span>
            </button>
            {idx < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mx-2 hidden h-px min-w-4 flex-1 sm:block",
                  step.tone === "success"
                    ? "bg-success-border"
                    : "bg-border-soft",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

export default WorkflowStepper;
