import React, { useMemo } from "react";
import { Lock, Sparkles } from "lucide-react";
import cn from "src/utils/cn";
import { formatAccessibleDate } from "src/components/Scheduling/scheduleUtils";
import { iconSizes } from "src/styles/designTokens";
import {
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";

/**
 * Publish-boundary timeline: the one image that explains progressive publishing.
 *
 * Published days sit left of the boundary and carry a lock; draft days sit
 * right of it and stay quiet. The boundary itself is a vertical rule with the
 * "publisert t.o.m." date. When nothing is published yet (publish-gate
 * preview) the whole strip is draft and the boundary moves to the chosen
 * through-date instead — same picture, one rule to learn.
 */

export interface PublishBoundaryTimelineProps {
  dates: string[];
  /** Last published date, or null when nothing is published yet. */
  distributedThrough: string | null;
  /** Preview boundary for the publish gate (selected through-date). */
  previewThrough?: string | null;
  /** Days that have at least one placed interview (dims empty days). */
  filledDates?: Set<string> | null;
  onExtendDay?: () => void;
  onFillRemainingDays?: () => void;
  extendDisabled?: boolean;
  fillDisabled?: boolean;
  loading?: boolean;
  compact?: boolean;
}

const PublishBoundaryTimeline: React.FC<PublishBoundaryTimelineProps> = ({
  dates,
  distributedThrough,
  previewThrough = null,
  filledDates = null,
  onExtendDay,
  onFillRemainingDays,
  extendDisabled = false,
  fillDisabled = false,
  loading = false,
  compact = false,
}) => {
  const sorted = useMemo(() => [...dates].sort(), [dates]);
  // The effective boundary: real publish state wins; in the gate preview the
  // chosen through-date plays the same role so the picture matches the action.
  const boundary = distributedThrough ?? previewThrough ?? null;
  const boundaryIndex = boundary ? sorted.indexOf(boundary) : -1;

  const publishedCount = boundaryIndex >= 0 ? boundaryIndex + 1 : 0;
  const remaining = Math.max(0, sorted.length - publishedCount);
  const canExtend = Boolean(onExtendDay) && !extendDisabled && remaining > 0;
  const canFill =
    Boolean(onFillRemainingDays) && !fillDisabled && remaining > 1;

  if (sorted.length === 0) return null;

  return (
    <div
      data-cy="publish-boundary-timeline"
      className={cn(
        "rounded-xl border border-border bg-surface-subtle",
        compact ? "px-3 py-2.5" : "px-4 py-3",
      )}
      role="img"
      aria-label={
        boundary
          ? `Publisert til og med ${formatAccessibleDate(boundary)}, ${remaining} ${remaining === 1 ? "dag" : "dager"} gjenstår`
          : `${sorted.length} ${sorted.length === 1 ? "dag" : "dager"} i utkast`
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="m-0 text-detail font-semibold text-text-muted">
          {boundary
            ? `Publisert t.o.m. ${formatAccessibleDate(boundary)}`
            : "Utkast"}
        </span>
        <span className="m-0 flex items-center gap-3 text-detail tabular-nums text-text-muted">
          {publishedCount > 0 && (
            <span className="flex items-center gap-1">
              <Lock size={iconSizes.tiny} aria-hidden="true" />
              {publishedCount}
            </span>
          )}
          {remaining > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles size={iconSizes.tiny} aria-hidden="true" />
              {remaining}
            </span>
          )}
        </span>
      </div>

      {/* The strip itself: published cells locked and tinted, draft cells open,
          the boundary a vertical rule between them. */}
      <div className="relative mt-2">
        <div className="flex gap-1 overflow-hidden">
          {sorted.map((date, index) => {
            const isPublished = boundaryIndex >= 0 && index <= boundaryIndex;
            const hasContent = !filledDates || filledDates.has(date);
            return (
              <div
                key={date}
                title={formatAccessibleDate(date)}
                className={cn(
                  "flex h-7 min-w-0 flex-1 items-center justify-center rounded-md border text-tiny font-semibold tabular-nums",
                  isPublished
                    ? "border-success-border bg-success-bg text-success"
                    : hasContent
                      ? "border-border-muted bg-surface-base text-text-muted"
                      : "border-border-faint bg-transparent text-text-disabled",
                )}
              >
                {isPublished ? (
                  <Lock size={iconSizes.tiny} aria-hidden="true" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
            );
          })}
        </div>
        {boundaryIndex >= 0 && boundaryIndex < sorted.length - 1 && (
          <span
            aria-hidden="true"
            className="absolute top-[-4px] bottom-[-4px] w-0.5 rounded bg-brand"
            style={{
              left: `calc(${((boundaryIndex + 1) / sorted.length) * 100}% - 1px)`,
            }}
          />
        )}
      </div>

      {(canExtend || canFill) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {canExtend && (
            <button
              type="button"
              onClick={onExtendDay}
              disabled={loading}
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              + 1 dag
            </button>
          )}
          {canFill && (
            <button
              type="button"
              onClick={onFillRemainingDays}
              disabled={loading}
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              Resten på én gang ({remaining})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PublishBoundaryTimeline;
