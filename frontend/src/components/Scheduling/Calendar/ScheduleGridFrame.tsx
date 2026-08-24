import React from "react";
import { Check, Minus } from "lucide-react";
import cn from "src/utils/cn";
import {
  calendarGrid,
  iconSizes,
  iconStrokeWidths,
} from "src/styles/designTokens";
import { formatDateHeader, formatMinutes } from "../scheduleUtils";

interface ScheduleGridFrameProps {
  dates: string[];
  children: React.ReactNode;
  className?: string;
  gridClassName?: string;
  gridAriaLabel?: string;
  layout?: "grid" | "table";
}

/** Shared scrolling frame and dimensions for Rammer, availability, and coverage. */
const ScheduleGridFrame: React.FC<ScheduleGridFrameProps> = ({
  dates,
  children,
  className,
  gridClassName,
  gridAriaLabel,
  layout = "grid",
}) => (
  <div
    data-cy="schedule-grid-frame"
    className={cn(
      "min-w-0 overflow-x-auto rounded-lg border border-border bg-surface-muted p-3",
      className,
    )}
  >
    <div
      role={gridAriaLabel ? "grid" : undefined}
      aria-label={gridAriaLabel}
      className={cn(
        "touch-auto",
        layout === "grid" && "grid gap-2",
        gridClassName,
      )}
      style={{
        gridTemplateColumns:
          layout === "grid"
            ? `${calendarGrid.timeColumnWidth}px repeat(${dates.length}, minmax(${calendarGrid.dayColumnMinWidth}px, 1fr))`
            : undefined,
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

const scheduleCellBaseClass =
  "relative flex min-h-14 w-full items-center justify-center overflow-hidden rounded-md border p-1.5 transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus";

const scheduleClosedCellClass =
  "cursor-default border-border-soft bg-surface-neutral text-text-disabled [background-image:var(--pattern-unavailable)]";

export const scheduleInteractiveCellMotionClass =
  "transition-[background-color,border-color,box-shadow,color,transform] duration-200 ease-out hover:-translate-y-px active:scale-[0.985] motion-reduce:translate-y-0 motion-reduce:transition-none motion-reduce:active:scale-100";

export const scheduleSelectedCellClass =
  "border-border bg-surface-base text-text-primary hover:border-brand-border hover:bg-brand-soft";

// The two personal-availability answers. A paint-mode button renders its own
// swatch from the same constant as the cell it paints, so the sample beside
// the button is literally the surface the click produces.
export const scheduleAvailableSurfaceClass =
  "border-solid border-brand bg-brand-tint";

export const scheduleDiscouragedSurfaceClass =
  "border-dashed border-border-strong bg-surface-base";

export const scheduleAvailableCellClass =
  "border-border bg-surface-base hover:border-brand-border hover:bg-brand-soft";

export const scheduleSelectionMarkClass =
  "relative z-10 text-text-muted transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

export const scheduleOpenLegendStyle: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to bottom, transparent 42%, var(--color-brand-active-border) 42%, var(--color-brand-active-border) 58%, transparent 58%)",
};

interface ScheduleBlockCellProps extends React.HTMLAttributes<HTMLDivElement> {
  closed?: boolean;
}

/**
 * Shared block surface for schedule configuration, personal availability, and
 * the read-only availability overview. Modes supply their own state indicator,
 * but never their own cell geometry or closed treatment.
 */
export const ScheduleBlockCell = React.forwardRef<
  HTMLDivElement,
  ScheduleBlockCellProps
>(({ children, className, closed = false, ...props }, ref) => (
  <div
    ref={ref}
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
));
ScheduleBlockCell.displayName = "ScheduleBlockCell";

interface ScheduleSelectableBlockCellProps extends ScheduleBlockCellProps {
  activeCount: number;
  totalCount: number;
  fills: number[];
  selectable?: boolean;
  trackStyle?: React.CSSProperties;
  trackDataCy?: string;
  statusText?: React.ReactNode;
  distinguishUnavailable?: boolean;
  hideTrackWhenUnavailable?: boolean;
  /**
   * Replaces the default selected treatment. Availability paints two distinct
   * answers, and passing the surface in beats appending an override class:
   * `cn` has no tailwind-merge, so two competing `bg-*` utilities would be
   * decided by the generated stylesheet's order rather than by this call.
   */
  activeClassName?: string;
}

/**
 * The actual selectable block shared by setup and personal availability.
 * Callers own data mutations; this component owns every visual state change.
 */
export const ScheduleSelectableBlockCell = React.forwardRef<
  HTMLDivElement,
  ScheduleSelectableBlockCellProps
>(
  (
    {
      activeCount,
      totalCount,
      fills,
      selectable = true,
      trackStyle,
      trackDataCy,
      statusText,
      distinguishUnavailable = false,
      hideTrackWhenUnavailable = false,
      activeClassName,
      className,
      ...props
    },
    ref,
  ) => {
    const isActive = selectable && totalCount > 0 && activeCount === totalCount;
    const isPartial = activeCount > 0 && !isActive;
    const isVisuallyClosed = !isActive && !isPartial;
    const closedPatternClass = isVisuallyClosed
      ? distinguishUnavailable && !selectable
        ? "[background-image:var(--pattern-unavailable)] opacity-35"
        : "opacity-70 group-hover:opacity-100"
      : "opacity-0";
    const selectionState = !selectable
      ? "blocked"
      : isActive
        ? "active"
        : isPartial
          ? "partial"
          : "closed";

    return (
      <ScheduleBlockCell
        ref={ref}
        {...props}
        data-selection-surface="schedule-block"
        data-selection-state={selectionState}
        className={cn(
          scheduleInteractiveCellMotionClass,
          selectable
            ? "cursor-pointer"
            : distinguishUnavailable
              ? "cursor-not-allowed"
              : "cursor-default",
          (isActive || isPartial) &&
            (activeClassName ?? scheduleSelectedCellClass),
          isVisuallyClosed &&
            "border-border-soft bg-surface-neutral text-text-disabled",
          selectable &&
            isVisuallyClosed &&
            "hover:border-brand-border hover:bg-surface-muted",
          distinguishUnavailable && !selectable && isVisuallyClosed
            ? "border-dashed border-border-muted bg-surface-muted"
            : !selectable
              ? "opacity-55"
              : undefined,
          className,
        )}
      >
        <span
          aria-hidden="true"
          data-selection-closed-overlay=""
          className={cn(
            "pointer-events-none absolute inset-0 transition-[opacity,background-position] duration-300 ease-out motion-reduce:transition-none",
            closedPatternClass,
          )}
        />
        <div className="relative z-10 flex w-full min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div
              data-cy={trackDataCy}
              style={trackStyle}
              className="min-w-0 rounded-sm p-1"
            >
              <ScheduleSlotSegments
                className="h-schedule-progress"
                closed={isVisuallyClosed}
                hideWhenClosed={
                  distinguishUnavailable &&
                  !selectable &&
                  hideTrackWhenUnavailable
                }
                fills={fills}
              />
            </div>
          </div>
          {statusText && (
            <span className="text-label font-bold tabular-nums text-text-muted">
              {statusText}
            </span>
          )}
          <span
            data-selection-mark=""
            className="flex w-4 flex-none items-center justify-center"
          >
            {isPartial ? (
              <Minus
                size={iconSizes.compact}
                strokeWidth={iconStrokeWidths.strong}
                aria-hidden="true"
                className={cn(
                  scheduleSelectionMarkClass,
                  "scale-100 opacity-60",
                )}
              />
            ) : (
              <Check
                size={iconSizes.compact}
                strokeWidth={iconStrokeWidths.strong}
                aria-hidden="true"
                className={cn(
                  scheduleSelectionMarkClass,
                  isActive ? "scale-100 opacity-60" : "scale-75 opacity-0",
                )}
              />
            )}
          </span>
        </div>
      </ScheduleBlockCell>
    );
  },
);
ScheduleSelectableBlockCell.displayName = "ScheduleSelectableBlockCell";

interface ScheduleSlotSegmentsProps {
  fills: number[];
  closed?: boolean;
  className?: string;
  hideWhenClosed?: boolean;
}

/** Small per-slot tracks shared by every block mode. Fill is normalized 0–1. */
export const ScheduleSlotSegments: React.FC<ScheduleSlotSegmentsProps> = ({
  fills,
  closed = false,
  className,
  hideWhenClosed = false,
}) => {
  if (closed && hideWhenClosed) return null;

  return (
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
              "absolute inset-y-0 left-0 rounded-full transition-[width,opacity] duration-150 motion-reduce:transition-none",
              closed
                ? "bg-border-mutedSoft opacity-70"
                : "bg-brand-activeBorder",
            )}
            style={{
              width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`,
            }}
          />
        </span>
      ))}
    </div>
  );
};

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
