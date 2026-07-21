import React from "react";
import cn from "src/utils/cn";

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "neutral" | "warn";
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  hint,
  tone = "neutral",
}) => (
  <div
    className={cn(
      "flex flex-col gap-1 rounded-lg border bg-surface-base px-4 py-3",
      tone === "warn"
        ? "border-brand-border bg-brand-subtle"
        : "border-border-soft",
    )}
  >
    <span className="text-detail font-medium text-text-muted">{label}</span>
    <span className="text-xl font-extrabold tabular-nums text-text-primary">
      {value}
    </span>
    {hint && (
      <span className="text-detail leading-snug text-text-muted">{hint}</span>
    )}
  </div>
);
