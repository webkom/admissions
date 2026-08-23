import React from "react";
import { CalendarDays, List } from "lucide-react";

import {
  SegmentedControl,
  actionButtonActive,
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import { NameVisibility } from "../../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

interface PlanFilterBarProps {
  myInterviewsOnly: boolean;
  onToggleMyInterviews: () => void;
  myInterviewsCount: number;
  planViewMode: "calendar" | "table";
  onChangePlanViewMode: (mode: "calendar" | "table") => void;
  canToggleCandidateNames: boolean;
  canHideCandidateNames: boolean;
  nameVisibility: NameVisibility;
  onSelectVisibility: (next: NameVisibility) => void;
  isUpdatingNames: boolean;
  conflictBadgeCount: number;
}

const PlanFilterBar: React.FC<PlanFilterBarProps> = ({
  myInterviewsOnly,
  onToggleMyInterviews,
  myInterviewsCount,
  planViewMode,
  onChangePlanViewMode,
  canToggleCandidateNames,
  canHideCandidateNames,
  nameVisibility,
  onSelectVisibility,
  isUpdatingNames,
  conflictBadgeCount,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-6 py-3">
      <button
        type="button"
        onClick={onToggleMyInterviews}
        aria-pressed={myInterviewsOnly}
        className={cn(
          actionButtonBase,
          myInterviewsOnly ? actionButtonActive : actionButtonNeutral,
          "px-3 py-1.5",
        )}
      >
        Mine intervjuer
        {myInterviewsCount > 0 && (
          <span className="ml-1 rounded-full bg-surface-subtle px-1.5 py-0.5 text-tiny font-bold tabular-nums">
            {myInterviewsCount}
          </span>
        )}
      </button>

      <SegmentedControl<"calendar" | "table">
        aria-label="Visning av intervjuplan"
        value={planViewMode}
        onChange={onChangePlanViewMode}
        items={[
          {
            key: "table",
            icon: <List size={iconSizes.control} />,
            title: "Liste",
          },
          {
            key: "calendar",
            icon: <CalendarDays size={iconSizes.control} />,
            title: "Kalender",
          },
        ]}
      />

      {canToggleCandidateNames && (
        <div
          className="inline-flex items-center gap-2"
          title="Hvem skal se kandidatnavnene"
        >
          <SegmentedControl<NameVisibility>
            aria-label="Synlighet for kandidatnavn"
            value={nameVisibility}
            onChange={onSelectVisibility}
            items={[
              ...(canHideCandidateNames
                ? ([{ key: "hidden", label: "Skjult" }] as const)
                : []),
              { key: "admin_only", label: "Opptaksansvarlige" },
              { key: "committee", label: "Hele komiteen" },
            ]}
          />
          {isUpdatingNames && (
            <span className="text-detail italic text-text-muted">
              Oppdaterer…
            </span>
          )}
        </div>
      )}
      <span className="ml-auto text-detail text-text-muted">
        {conflictBadgeCount > 0 && (
          <span className="ml-2 rounded-full border border-brand-border bg-brand-muted px-2 py-0.5 text-label font-bold text-brand">
            {conflictBadgeCount} inhabiliteter
          </span>
        )}
      </span>
    </div>
  );
};

export default PlanFilterBar;
