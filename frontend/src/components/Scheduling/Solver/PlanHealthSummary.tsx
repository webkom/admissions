import React from "react";
import { ChevronDown } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import cn from "../../../utils/cn";
import { keyboardFocusRingClass } from "../ui";
import type { BlockRestSummary, SchedulePresentation } from "./solverSelectors";

const textActionClass = `inline-flex items-center gap-1 text-detail font-semibold text-brand hover:underline ${keyboardFocusRingClass}`;

interface PlanHealthSummaryProps {
  overviewStats: NonNullable<SchedulePresentation["overviewStats"]>;
  totalCandidateCount: number;
  healthExceptions: string[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  usedBlockCount: number;
  strategyLabel: string;
  blockRestPreferenceEnabled: boolean | null;
  blockRestSummary: BlockRestSummary;
  unplaceableCount: number;
  previewLoading: boolean;
  onPreviewWithAvailabilityDeviation: () => void;
}

const PlanHealthSummary = ({
  overviewStats,
  totalCandidateCount,
  healthExceptions,
  detailsOpen,
  onToggleDetails,
  usedBlockCount,
  strategyLabel,
  blockRestPreferenceEnabled,
  blockRestSummary,
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
          <span key={exception}>, {exception}</span>
        ))}
      </p>
      <button
        type="button"
        aria-expanded={detailsOpen}
        aria-controls="plan-draft-details"
        onClick={onToggleDetails}
        className={textActionClass}
      >
        {detailsOpen ? "Skjul detaljer" : "Vis detaljer"}
        <ChevronDown
          size={iconSizes.control}
          aria-hidden="true"
          className={cn("transition-transform", detailsOpen && "rotate-180")}
        />
      </button>
    </div>
    {detailsOpen && (
      <div
        id="plan-draft-details"
        className="mt-4 grid gap-3 rounded-lg bg-surface-subtle px-4 py-3 text-detail text-text-muted"
      >
        <dl className="m-0 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="font-semibold text-text-subtle">Fordeling</dt>
            <dd className="m-0 mt-0.5 font-semibold tabular-nums text-text-primary">
              {overviewStats.minLoad}–{overviewStats.maxLoad} intervjuer
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text-subtle">Arbeidsblokker</dt>
            <dd className="m-0 mt-0.5 font-semibold tabular-nums text-text-primary">
              {usedBlockCount}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-text-subtle">Generering</dt>
            <dd className="m-0 mt-0.5 font-semibold text-text-primary">
              {strategyLabel}
            </dd>
          </div>
        </dl>
        <p data-cy="block-rest-summary" className="m-0">
          {blockRestPreferenceEnabled === null
            ? "Innstillingen for hvile mellom blokker er ukjent for dette utkastet."
            : !blockRestPreferenceEnabled
              ? "Hvile mellom arbeidsblokker var ikke prioritert."
              : blockRestSummary.honored
                ? "Hvile mellom arbeidsblokker er oppfylt."
                : `${blockRestSummary.exceptionCount} unntak fra hvile mellom arbeidsblokker.`}
        </p>
        {blockRestSummary.isNonOptimal && (
          <p className="m-0 font-semibold text-amber-800">
            Søket ble avsluttet før optimalitet var bevist.
          </p>
        )}
        {blockRestSummary.optimalityUnknown && (
          <p className="m-0">
            Optimalitet er ikke kjent for dette gjenopprettede utkastet.
          </p>
        )}
        {unplaceableCount > 0 && (
          <button
            type="button"
            disabled={previewLoading}
            onClick={onPreviewWithAvailabilityDeviation}
            className={`justify-self-start font-semibold text-brand hover:underline disabled:opacity-50 ${keyboardFocusRingClass}`}
          >
            {previewLoading
              ? "Beregner forslag…"
              : "Forhåndsvis komplett forslag med avvik"}
          </button>
        )}
      </div>
    )}
  </section>
);

export default PlanHealthSummary;
