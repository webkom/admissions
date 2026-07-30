import React from "react";
import { Minus, Plus } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onStep: (next: number) => void;
  "aria-label"?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  min,
  max,
  step = 1,
  unit,
  onStep,
  "aria-label": ariaLabel,
}) => {
  const clamp = (next: number) => {
    let result = next;
    if (typeof min === "number") result = Math.max(min, result);
    if (typeof max === "number") result = Math.min(max, result);
    return result;
  };

  const atMin = typeof min === "number" && value <= min;
  const atMax = typeof max === "number" && value >= max;

  return (
    <div
      className="inline-flex h-control-md items-center gap-1 rounded-md border border-border-soft bg-surface-base px-1"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => onStep(clamp(value - step))}
        disabled={atMin}
        aria-label="Reduser"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus size={iconSizes.small} />
      </button>
      <span className="inline-flex min-w-7 items-baseline justify-center gap-0.5 px-1 text-sm font-bold tabular-nums text-text-primary">
        {value}
        {unit && (
          <span className="text-label font-semibold text-text-subtle">
            {unit}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onStep(clamp(value + step))}
        disabled={atMax}
        aria-label="Øk"
        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-focus disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={iconSizes.small} />
      </button>
    </div>
  );
};
