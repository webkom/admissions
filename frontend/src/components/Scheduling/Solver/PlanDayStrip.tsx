import React, { useMemo } from "react";
import { Check, Lock } from "lucide-react";
import cn from "src/utils/cn";
import { formatAccessibleDate } from "src/components/Scheduling/scheduleUtils";
import { iconSizes } from "src/styles/designTokens";
import {
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import { derivePlanDayStrip, type PlanDayCell } from "./planDayStripModel";

/**
 * The period at a glance, and the only place the two cursors move.
 *
 * Framework days run left to right. Published days sit behind a solid rule and
 * carry a lock; planned-but-unpublished days sit between the rules; days with
 * nothing on them yet sit past the dashed one. Clicking a day extends whichever
 * cursor that day is a candidate for - planning to the right of the plan, or
 * publishing over days already planned.
 *
 * Rendered read-only (no click targets) for anyone who cannot manage the
 * schedule, so an ordinary member cannot infer how much is still unpublished.
 */

export interface PlanDayStripProps {
  dates: string[];
  /** Framework days with at least one open slot. Defaults to every date. */
  plannableDates?: readonly string[];
  /** Days holding at least one placed interview. */
  filledDates?: ReadonlySet<string> | null;
  /** Last published date, or null when nothing is published yet. */
  distributedThrough: string | null;
  /** Preview boundary for the publish gate (the selected through-date). */
  previewThrough?: string | null;
  /** Solve through this date, keeping everything already planned. */
  onPlanThrough?: (date: string) => void;
  /** Move the publication boundary to this date. */
  onPublishThrough?: (date: string) => void;
  /** Framework days the admin has marked finished. Their open slots are
   *  withheld from later solves. */
  completedDates?: ReadonlySet<string>;
  /** Toggle a planned day's "finished" mark. Only wired in the draft view. */
  onToggleComplete?: (date: string) => void;
  loading?: boolean;
  compact?: boolean;
  /** Suppresses the follow-on publish suggestion while the draft has unsaved
   *  or failed writes - publishing then would release a plan the server has
   *  not accepted yet. */
  publishSuggestionReady?: boolean;
}

const cellToneClass = (
  cell: PlanDayCell,
  isPreview: boolean,
  isActionable: boolean,
) => {
  if (cell.state === "published") {
    return "border-success-border bg-success-bg text-success";
  }
  if (isPreview) return "border-brand bg-brand-soft text-brand";
  if (cell.state === "planned") {
    return "border-border-muted bg-surface-base text-text-primary";
  }
  if (cell.state === "unplanned") {
    // A day you can still plan into is the main thing to click here, so it
    // reads as an empty slot waiting to be filled rather than as blank space.
    return isActionable
      ? "border-dashed border-border-muted bg-surface-base text-text-muted"
      : "border-dashed border-border-faint bg-transparent text-text-muted";
  }
  // Closed: nothing can happen here, so it stays out of the way.
  return "border-border-faint bg-transparent text-text-disabled";
};

const PlanDayStrip: React.FC<PlanDayStripProps> = ({
  dates,
  plannableDates,
  filledDates = null,
  distributedThrough,
  previewThrough = null,
  onPlanThrough,
  onPublishThrough,
  completedDates,
  onToggleComplete,
  loading = false,
  compact = false,
  publishSuggestionReady = true,
}) => {
  const model = useMemo(
    () =>
      derivePlanDayStrip({
        dates,
        plannableDates: plannableDates ?? dates,
        // With no fill information every day counts as planned, which keeps
        // the publish-direction clicks available on callers that do not track
        // per-day occupancy.
        filledDates: filledDates ?? new Set(dates),
        distributedThrough,
        previewThrough,
        canPlan: Boolean(onPlanThrough) && !loading,
        canPublish: Boolean(onPublishThrough) && !loading,
      }),
    [
      dates,
      distributedThrough,
      filledDates,
      loading,
      onPlanThrough,
      onPublishThrough,
      plannableDates,
      previewThrough,
    ],
  );

  if (model.cells.length === 0) return null;

  const summary = distributedThrough
    ? `Publisert t.o.m. ${formatAccessibleDate(distributedThrough)}`
    : "Ikke publisert";

  return (
    <div
      data-cy="plan-day-strip"
      className={cn(
        "rounded-xl border border-border bg-surface-subtle",
        compact ? "px-3 py-2.5" : "px-4 py-3",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="m-0 text-detail font-semibold text-text-muted">
          {summary}
        </span>
        <span className="m-0 flex items-center gap-3 text-detail tabular-nums text-text-muted">
          {model.publishedCount > 0 && (
            <span className="flex items-center gap-1">
              <Lock size={iconSizes.tiny} aria-hidden="true" />
              {model.publishedCount}
            </span>
          )}
          {model.unplannedCount > 0 && (
            <span>{model.unplannedCount} ikke planlagt</span>
          )}
        </span>
      </div>

      <div className="relative mt-2">
        <ul className="m-0 flex list-none gap-1 overflow-hidden p-0">
          {model.cells.map((cell) => {
            const isPreview = cell.index <= model.previewThroughIndex;
            const isActionable = cell.canPublishThrough || cell.canPlanThrough;
            const isCompleted = Boolean(completedDates?.has(cell.date));
            const className = cn(
              "flex h-7 w-full min-w-0 items-center justify-center rounded-md border text-tiny font-semibold tabular-nums transition-colors",
              cellToneClass(cell, isPreview, isActionable),
              isCompleted &&
                cell.state !== "published" &&
                "border-success-border bg-success-bg text-success",
            );
            const content =
              cell.state === "published" ? (
                <Lock size={iconSizes.tiny} aria-hidden="true" />
              ) : isCompleted ? (
                <Check size={iconSizes.tiny} aria-hidden="true" />
              ) : (
                <span>{cell.index + 1}</span>
              );
            // Publishing is the more consequential of the two and is offered
            // only over days that are already planned, so it wins the click
            // where both would apply.
            const action = cell.canPublishThrough
              ? {
                  label: `Publiser til og med ${formatAccessibleDate(cell.date)}`,
                  run: () => onPublishThrough?.(cell.date),
                }
              : cell.canPlanThrough
                ? {
                    label: `Planlegg til og med ${formatAccessibleDate(cell.date)}`,
                    run: () => onPlanThrough?.(cell.date),
                  }
                : null;

            return (
              <li key={cell.date} className="min-w-0 flex-1">
                {action ? (
                  <button
                    type="button"
                    onClick={action.run}
                    disabled={loading}
                    title={action.label}
                    className={cn(
                      className,
                      "cursor-pointer hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed",
                    )}
                  >
                    {content}
                    <span className="sr-only">{action.label}</span>
                  </button>
                ) : (
                  <span
                    title={formatAccessibleDate(cell.date)}
                    className={className}
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {/* Solid rule: the publication boundary. */}
        {model.publishedThroughIndex >= 0 &&
          model.publishedThroughIndex < model.cells.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-[-4px] bottom-[-4px] w-0.5 rounded bg-brand"
              style={{
                left: `calc(${
                  ((model.publishedThroughIndex + 1) / model.cells.length) * 100
                }% - 1px)`,
              }}
            />
          )}
        {/* Dashed rule: how far the plan reaches. Hidden when it coincides
            with the publication boundary, which would draw two rules in one
            place and suggest a distinction that is not there. */}
        {model.plannedThroughIndex > model.publishedThroughIndex &&
          model.plannedThroughIndex < model.cells.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute top-[-2px] bottom-[-2px] w-0 border-l border-dashed border-border-muted"
              style={{
                left: `calc(${
                  ((model.plannedThroughIndex + 1) / model.cells.length) * 100
                }%)`,
              }}
            />
          )}
      </div>

      {/* Newly planned days are the whole reason to come back here, so the
          release step is offered where they are drawn rather than on another
          screen. */}
      {onPublishThrough &&
        publishSuggestionReady &&
        model.publishableCount > 0 &&
        model.plannedThroughIndex >= 0 && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-detail text-text-muted">
              {model.publishableCount}{" "}
              {model.publishableCount === 1
                ? "planlagt dag er ikke publisert"
                : "planlagte dager er ikke publisert"}
              .
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                onPublishThrough(model.cells[model.plannedThroughIndex].date)
              }
              data-cy="plan-day-strip-publish-planned"
              className={cn(actionButtonBase, actionButtonNeutral)}
            >
              Publiser t.o.m.{" "}
              {formatAccessibleDate(
                model.cells[model.plannedThroughIndex].date,
              )}
            </button>
          </div>
        )}

      {/* Marking a day finished keeps its interviews but withholds its open
          slots from every later solve - so "plan the rest" never backfills a
          day that is done, even one that lost an interview to a removal. */}
      {onToggleComplete &&
        model.cells.some((cell) => cell.state === "planned") && (
          <div
            className="mt-2.5 flex flex-wrap items-center gap-1.5"
            data-cy="plan-day-strip-complete"
          >
            <span className="mr-1 text-detail text-text-muted">Fullført:</span>
            {model.cells
              .filter((cell) => cell.state === "planned")
              .map((cell) => {
                const done = Boolean(completedDates?.has(cell.date));
                return (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={loading}
                    onClick={() => onToggleComplete(cell.date)}
                    aria-pressed={done}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-detail font-semibold transition-colors disabled:cursor-not-allowed",
                      done
                        ? "border-success-border bg-success-bg text-success"
                        : "border-border-soft bg-surface-base text-text-muted hover:border-border-quiet",
                    )}
                  >
                    {done && <Check size={iconSizes.tiny} aria-hidden="true" />}
                    {formatAccessibleDate(cell.date)}
                  </button>
                );
              })}
          </div>
        )}
    </div>
  );
};

export default PlanDayStrip;
