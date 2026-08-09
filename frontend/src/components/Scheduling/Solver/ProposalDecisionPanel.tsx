import React from "react";
import { ChevronDown, ClipboardList } from "lucide-react";

import { iconSizes } from "src/styles/designTokens";
import { derivePendingProposalDecision } from "src/routes/SchedulePage/workflowStages";
import cn from "src/utils/cn";
import { formatSlotLabel } from "../scheduleUtils";
import {
  SchedulePanel,
  SchedulePanelBody,
  SchedulePanelFooter,
  SchedulePanelHeader,
  actionButtonBase,
  actionButtonNeutral,
  actionButtonPrimary,
  keyboardFocusRingClass,
} from "../ui";
import type { PendingSolveProposal } from "./solverHelpers";

interface ProposalDecisionPanelProps {
  proposal: PendingSolveProposal;
  stage: string;
  title: string;
  description: string;
  dates: string[];
  sessionDuration: number;
  currentScheduleCount: number;
  currentUnplacedCount: number;
  currentOutsideAvailabilityCount: number;
  proposedUnplacedCount: number;
  proposedOutsideAvailabilityCount: number;
  expiryLabel?: string | null;
  isStale: boolean;
  hasExpired: boolean;
  detailsOpen: boolean;
  actionLoading: boolean;
  headingRef: React.RefObject<HTMLHeadingElement>;
  comparisonTriggerRef: React.RefObject<HTMLButtonElement>;
  comparisonHeadingRef: React.RefObject<HTMLHeadingElement>;
  onToggleDetails: () => void;
  onCloseComparison: () => void;
  onKeepCurrent: () => void;
  onAdjust: () => void;
  onApply: () => void;
}

const ProposalMetric: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <div>
    <dt className="text-label font-semibold text-text-subtle">{label}</dt>
    <dd className="m-0 mt-1 text-title font-bold tabular-nums text-text-primary">
      {value}
    </dd>
  </div>
);

const ProposalDecisionPanel: React.FC<ProposalDecisionPanelProps> = ({
  proposal,
  stage,
  title,
  description,
  dates,
  sessionDuration,
  currentScheduleCount,
  currentUnplacedCount,
  currentOutsideAvailabilityCount,
  proposedUnplacedCount,
  proposedOutsideAvailabilityCount,
  expiryLabel,
  isStale,
  hasExpired,
  detailsOpen,
  actionLoading,
  headingRef,
  comparisonTriggerRef,
  comparisonHeadingRef,
  onToggleDetails,
  onCloseComparison,
  onKeepCurrent,
  onAdjust,
  onApply,
}) => {
  const decision = derivePendingProposalDecision({ isStale, hasExpired });

  return (
    <SchedulePanel
      dataCy="candidate-proposal"
      stage={stage}
      className="animate-fade-in motion-reduce:animate-none"
    >
      <SchedulePanelHeader
        icon={ClipboardList}
        headingRef={headingRef}
        headingDataCy="schedule-stage-heading"
        title={title}
        description={description}
      />
      <SchedulePanelBody className="space-y-5 px-5 py-5">
        <dl className="m-0 grid gap-4 border-b border-border-soft pb-5 sm:grid-cols-3">
          <ProposalMetric
            label="Planlagt"
            value={proposal.result.schedule.length}
          />
          <ProposalMetric label="Uten plass" value={proposedUnplacedCount} />
          <ProposalMetric
            label="Utenfor tilgjengelighet"
            value={proposedOutsideAvailabilityCount}
          />
        </dl>

        {expiryLabel && !hasExpired && (
          <p className="m-0 text-detail text-text-subtle">
            Forslaget lagres til {expiryLabel}.
          </p>
        )}

        <button
          ref={comparisonTriggerRef}
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="proposal-comparison"
          onClick={onToggleDetails}
          className={cn(
            "flex items-center gap-1 text-detail font-semibold text-brand hover:underline",
            keyboardFocusRingClass,
          )}
        >
          {detailsOpen
            ? "Skjul sammenligning"
            : "Sammenlign med gjeldende utkast"}
          <ChevronDown
            size={iconSizes.control}
            aria-hidden="true"
            className={cn(
              "transition-transform motion-reduce:transition-none",
              detailsOpen && "rotate-180",
            )}
          />
        </button>

        {detailsOpen && (
          <div
            id="proposal-comparison"
            role="region"
            aria-labelledby="proposal-comparison-heading"
            onKeyDown={(event) => {
              if (event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              event.stopPropagation();
              onCloseComparison();
            }}
            className="space-y-4"
            data-cy="proposal-comparison"
          >
            <h3
              ref={comparisonHeadingRef}
              id="proposal-comparison-heading"
              tabIndex={-1}
              className="sr-only"
            >
              Sammenligning med gjeldende planutkast
            </h3>
            <div className="overflow-hidden rounded-md border border-border-soft">
              <table className="w-full border-collapse text-left text-detail">
                <thead className="bg-surface-muted text-text-muted">
                  <tr>
                    <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                      Resultat
                    </th>
                    <th className="!rounded-none !bg-transparent px-3 py-2 text-right font-semibold">
                      Gjeldende
                    </th>
                    <th className="!rounded-none !bg-transparent px-3 py-2 text-right font-semibold">
                      Nytt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Planlagt",
                      currentScheduleCount,
                      proposal.result.schedule.length,
                    ],
                    ["Uten plass", currentUnplacedCount, proposedUnplacedCount],
                    [
                      "Utenfor tilgjengelighet",
                      currentOutsideAvailabilityCount,
                      proposedOutsideAvailabilityCount,
                    ],
                  ].map(([label, current, proposed]) => (
                    <tr
                      key={String(label)}
                      className="border-t border-border-faint"
                    >
                      <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold text-text-primary">
                        {label}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums text-text-muted">
                        {current}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-text-primary">
                        {proposed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border border-border-soft">
              <table className="w-full border-collapse text-left text-detail">
                <thead className="sticky top-0 bg-surface-muted text-text-muted">
                  <tr>
                    <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                      Tid
                    </th>
                    <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                      Søker
                    </th>
                    <th className="!rounded-none !bg-transparent px-3 py-2 font-semibold">
                      Panel
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...proposal.result.schedule]
                    .sort((left, right) => left.time - right.time)
                    .map((item) => (
                      <tr
                        key={`${item.candidate_id ?? item.candidate}-${item.time}`}
                        className="border-t border-border-faint"
                      >
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-text-muted">
                          {formatSlotLabel(item.time, dates, sessionDuration)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-text-primary">
                          {item.candidate}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {item.panel.map((member) => member.name).join(", ")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isStale && (
          <p className="m-0 text-detail font-semibold text-danger">
            Utkastet er endret etter beregningen. Lag et nytt forslag før du
            fortsetter.
          </p>
        )}
        {hasExpired && (
          <p className="m-0 text-detail font-semibold text-danger">
            Forslaget har utløpt. Lag et nytt forslag før du fortsetter.
          </p>
        )}
      </SchedulePanelBody>
      <SchedulePanelFooter className="sticky bottom-0 z-10 bg-surface-base">
        <span className="text-detail font-semibold text-text-muted">
          Det gjeldende utkastet er ikke endret.
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={actionLoading}
            onClick={onKeepCurrent}
            className={cn(actionButtonBase, actionButtonNeutral)}
          >
            Behold gjeldende utkast
          </button>
          {decision.showAdjustAction && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={onAdjust}
              className={cn(
                "px-2 py-2 text-detail font-semibold text-text-muted hover:text-text-primary hover:underline",
                keyboardFocusRingClass,
              )}
            >
              Juster og prøv igjen
            </button>
          )}
          <button
            type="button"
            disabled={actionLoading}
            onClick={decision.canApply ? onApply : onAdjust}
            data-cy="schedule-stage-primary-action"
            className={cn(actionButtonBase, actionButtonPrimary)}
          >
            {decision.primaryLabel}
          </button>
        </div>
      </SchedulePanelFooter>
    </SchedulePanel>
  );
};

export default ProposalDecisionPanel;
