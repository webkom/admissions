import React from "react";
import cn from "src/utils/cn";

interface ChipProps {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "muted";
  icon?: React.ReactNode;
  className?: string;
}

export const Chip: React.FC<ChipProps> = ({
  children,
  tone = "neutral",
  icon,
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-detail font-semibold",
      tone === "brand" && "border-brand-border bg-brand-muted text-brand",
      tone === "success" && "border-success-border bg-success-bg text-success",
      tone === "warning" && "border-amber-300 bg-amber-100 text-amber-900",
      tone === "danger" && "border-danger-border bg-danger-bg text-danger",
      tone === "muted" &&
        "border-border-soft bg-surface-subtle text-text-muted",
      tone === "neutral" && "border-border bg-surface-base text-text-muted",
      className,
    )}
  >
    {icon}
    {children}
  </span>
);
