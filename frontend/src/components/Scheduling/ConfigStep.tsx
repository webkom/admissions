import React from "react";
import cn from "src/utils/cn";

interface ConfigStepListProps {
  children: React.ReactNode;
  className?: string;
}

export const ConfigStepList: React.FC<ConfigStepListProps> = ({
  children,
  className,
}) => <ol className={cn("m-0 list-none p-0", className)}>{children}</ol>;

interface ConfigStepProps {
  number: number;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Omits the connector running down to the next step. */
  last?: boolean;
  /** Lets a wrapping section point `aria-labelledby` at the step title. */
  titleId?: string;
}

export const ConfigStep: React.FC<ConfigStepProps> = ({
  number,
  title,
  description,
  children,
  last = false,
  titleId,
}) => (
  // The marker column starts on the panel title's left edge, so the numbers
  // line up under the title rather than being indented past it.
  <li className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
    {!last && (
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-3.5 top-8 w-px -translate-x-1/2 bg-border-soft"
      />
    )}
    <span
      aria-hidden="true"
      className="relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-brand text-detail font-bold tabular-nums text-white"
    >
      {number}
    </span>
    <div className={cn("min-w-0", !last && "pb-8")}>
      {/* Matches the marker's height so the title centres against the circle
          rather than sitting a few pixels above it. */}
      <h3
        id={titleId}
        className="m-0 flex min-h-7 items-center text-ui font-semibold text-text-primary"
      >
        {title}
      </h3>
      {description && (
        <p className="-mt-1 m-0 max-w-prose text-detail text-text-muted">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  </li>
);
