import React from "react";
import { Check } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";

interface ToggleCardProps {
  title: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
}

export const ToggleCard: React.FC<ToggleCardProps> = ({
  title,
  description,
  checked,
  onToggle,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    className={cn(
      "group relative flex cursor-pointer flex-col gap-1 overflow-hidden rounded-lg border px-4 py-3 pr-12 text-left transition-[border-color,background] duration-100 hover:border-border-quiet hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus",
      checked
        ? "border-brand-activeBorder bg-toggle-active shadow-toggle"
        : "border-border-soft bg-surface-base hover:bg-brand-soft",
    )}
  >
    <h4
      className={cn(
        "m-0 text-sm font-bold transition-colors",
        checked ? "text-brand" : "text-text-primary",
      )}
    >
      {title}
    </h4>
    {description && (
      <p
        className={cn(
          "m-0 text-detail leading-snug transition-colors",
          checked ? "text-text-secondary" : "text-text-muted",
        )}
      >
        {description}
      </p>
    )}
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-all duration-200",
        checked
          ? "border-brand bg-brand ring-4 ring-brand-ringSoft"
          : "border-border-muted bg-surface-base group-hover:border-brand-strongBorder",
      )}
    >
      <Check
        size={iconSizes.small}
        strokeWidth={iconStrokeWidths.emphasis}
        className={cn(
          "text-white transition-opacity duration-200",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  </button>
);
