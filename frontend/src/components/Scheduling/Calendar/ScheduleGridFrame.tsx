import React from "react";
import cn from "src/utils/cn";
import { calendarGrid } from "src/styles/designTokens";
import { formatDateHeader, formatMinutes } from "../scheduleUtils";

interface ScheduleGridFrameProps {
  dates: string[];
  children: React.ReactNode;
  className?: string;
  gridClassName?: string;
}

/** Shared scrolling frame and dimensions for Rammer, availability, and coverage. */
const ScheduleGridFrame: React.FC<ScheduleGridFrameProps> = ({
  dates,
  children,
  className,
  gridClassName,
}) => (
  <div
    className={cn(
      "min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3",
      className,
    )}
  >
    <div
      className={cn("grid touch-auto gap-1", gridClassName)}
      style={{
        gridTemplateColumns: `${calendarGrid.timeColumnWidth}px repeat(${dates.length}, minmax(${calendarGrid.dayColumnMinWidth}px, 1fr))`,
        minWidth: `max(${calendarGrid.minimumWidth}px, ${dates.length * calendarGrid.dayColumnMinWidth + calendarGrid.timeColumnWidth}px)`,
      }}
    >
      {children}
    </div>
  </div>
);

interface ScheduleDayHeaderProps {
  date: string;
  children?: React.ReactNode;
  className?: string;
}

export const ScheduleDayHeader: React.FC<ScheduleDayHeaderProps> = ({
  date,
  children,
  className,
}) => {
  const { weekday, dayMonth } = formatDateHeader(date);

  return (
    <div
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-surface-base px-2 py-1.5 text-center",
        className,
      )}
    >
      <span className="text-detail font-semibold text-text-muted">
        {weekday}
      </span>
      <span className="text-label font-semibold text-text-subtle">
        {dayMonth}
      </span>
      {children}
    </div>
  );
};

interface ScheduleTimeLabelProps {
  startMinute: number;
  endMinute: number;
  showEnd?: boolean;
  className?: string;
}

export const ScheduleTimeLabel: React.FC<ScheduleTimeLabelProps> = ({
  startMinute,
  endMinute,
  showEnd = true,
  className,
}) => (
  <div
    className={cn(
      "flex min-h-14 flex-col items-end justify-center bg-surface-muted pr-2",
      className,
    )}
  >
    <span className="text-label font-semibold tabular-nums text-text-subtle">
      {formatMinutes(startMinute)}
    </span>
    {showEnd && (
      <span className="text-nano font-medium leading-none tabular-nums text-text-disabled">
        til {formatMinutes(endMinute)}
      </span>
    )}
  </div>
);

export const scheduleCellBaseClass =
  "relative flex min-h-14 w-full items-center justify-center overflow-hidden rounded-md border p-1.5 transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus";

export const scheduleClosedCellClass =
  "cursor-default border-border-soft bg-surface-neutral text-text-disabled [background-image:var(--pattern-unavailable)]";

interface ScheduleBlockCellProps extends React.HTMLAttributes<HTMLDivElement> {
  closed?: boolean;
}

/**
 * Shared block surface for schedule configuration, personal availability, and
 * the read-only availability overview. Modes supply their own state indicator,
 * but never their own cell geometry or closed treatment.
 */
export const ScheduleBlockCell: React.FC<ScheduleBlockCellProps> = ({
  children,
  className,
  closed = false,
  ...props
}) => (
  <div
    {...props}
    className={cn(
      scheduleCellBaseClass,
      "group flex-col gap-1.5",
      closed && scheduleClosedCellClass,
      className,
    )}
  >
    {children}
  </div>
);

interface ScheduleSlotSegmentsProps {
  fills: number[];
  closed?: boolean;
  className?: string;
}

/** Small per-slot tracks shared by every block mode. Fill is normalized 0–1. */
export const ScheduleSlotSegments: React.FC<ScheduleSlotSegmentsProps> = ({
  fills,
  closed = false,
  className,
}) => (
  <div
    aria-hidden="true"
    className={cn("flex h-1.5 w-full items-center gap-1", className)}
  >
    {fills.map((fill, index) => (
      <span
        key={index}
        data-schedule-slot-segment=""
        className="relative h-full flex-1 overflow-hidden rounded-full bg-border-faint"
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width,opacity] duration-150",
            closed ? "bg-border-mutedSoft opacity-70" : "bg-brand-activeBorder",
          )}
          style={{
            width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`,
          }}
        />
      </span>
    ))}
  </div>
);

interface ScheduleGridLegendItemProps {
  label: string;
  className?: string;
  swatchClassName: string;
  swatchStyle?: React.CSSProperties;
}

export const ScheduleGridLegendItem: React.FC<ScheduleGridLegendItemProps> = ({
  label,
  className,
  swatchClassName,
  swatchStyle,
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 text-detail font-medium text-text-muted",
      className,
    )}
  >
    <span
      aria-hidden="true"
      className={cn("h-3.5 w-5 rounded-sm border", swatchClassName)}
      style={swatchStyle}
    />
    {label}
  </span>
);

export default ScheduleGridFrame;
