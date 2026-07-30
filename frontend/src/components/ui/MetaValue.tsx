import React from "react";
import cn from "src/utils/cn";

interface MetaValueProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export const MetaValue: React.FC<MetaValueProps> = ({
  label,
  value,
  className,
}) => (
  <span className={cn("inline-flex items-baseline gap-1.5", className)}>
    <span className="text-detail font-medium text-text-muted">{label}</span>
    <span className="text-sm font-bold tabular-nums text-text-primary">
      {value}
    </span>
  </span>
);
