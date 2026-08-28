import React from "react";
import { keyboardFocusRingClass } from "../ui";
import type { SchedulePresentation } from "./solverSelectors";

export interface PlanHealthException {
  key: string;
  label: string;
  /** Which fix the exception responds to: unplaced is a scope problem
   *  (widen days), the rest are per-row or plan-level hand-edit problems. */
  kind: "unplaced" | "availability" | "conflict" | "rest";
  /** The row to jump to when the exception is anchored to one interview.
   *  Unplaced candidates have no row; rest violations are block-level and
   *  have no single row either. */
  scheduleIndex?: number;
}

interface PlanHealthSummaryProps {
  overviewStats: NonNullable<SchedulePresentation["overviewStats"]>;
  totalCandidateCount: number;
  healthExceptions: PlanHealthException[];
  onJumpToException?: (exception: PlanHealthException) => void;
  unplaceableCount: number;
  previewLoading: boolean;
  onPreviewWithAvailabilityDeviation: () => void;
}

const PlanHealthSummary = ({
  overviewStats,
  totalCandidateCount,
  healthExceptions,
  onJumpToException,
  unplaceableCount,
  previewLoading,
  onPreviewWithAvailabilityDeviation,
}: PlanHealthSummaryProps) => (
  <section
    aria-label="Resultat fra planleggingen"
    data-cy="plan-health-summary"
    className="mb-4 border-b border-border-soft pb-4"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="m-0 text-ui text-text-muted">
        <strong className="font-semibold tabular-nums text-text-primary">
          {overviewStats.totalInterviews} av {totalCandidateCount} planlagt
        </strong>
        {healthExceptions.map((exception) => (
          <React.Fragment key={exception.key}>
            {", "}
            {onJumpToException ? (
              <button
                type="button"
                onClick={() => onJumpToException(exception)}
                className={`font-semibold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand ${keyboardFocusRingClass}`}
              >
                {exception.label}
              </button>
            ) : (
              exception.label
            )}
          </React.Fragment>
        ))}
      </p>
    </div>
    {unplaceableCount > 0 && (
      <button
        type="button"
        disabled={previewLoading}
        onClick={onPreviewWithAvailabilityDeviation}
        className={`mt-3 justify-self-start font-semibold text-brand hover:underline disabled:opacity-50 ${keyboardFocusRingClass}`}
      >
        {previewLoading
          ? "Beregner forslag…"
          : "Forhåndsvis komplett forslag med avvik"}
      </button>
    )}
  </section>
);

export default PlanHealthSummary;
