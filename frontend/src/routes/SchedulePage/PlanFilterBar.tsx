import React from "react";
import { CalendarDays, List } from "lucide-react";

import {
  SegmentedControl,
  actionButtonActive,
  actionButtonBase,
  actionButtonNeutral,
} from "src/components/Scheduling/ui";
import { NameVisibility } from "../../types";
import cn from "src/utils/cn";

interface PlanFilterBarProps {
  myInterviewsOnly: boolean;
  onToggleMyInterviews: () => void;
  myInterviewsCount: number;
  planViewMode: "calendar" | "table";
  onChangePlanViewMode: (mode: "calendar" | "table") => void;
  canToggleCandidateNames: boolean;
  nameVisibility: NameVisibility;
  onSelectVisibility: (next: NameVisibility) => void;
  isUpdatingNames: boolean;
  showRerun: boolean;
  onRerun: () => void;
  isRerunning: boolean;
  conflictBadgeCount: number;
}

/** The toolbar above the distributed plan: filters, view mode, name visibility
 * and the rerun control. */
const PlanFilterBar: React.FC<PlanFilterBarProps> = ({
  myInterviewsOnly,
  onToggleMyInterviews,
  myInterviewsCount,
  planViewMode,
  onChangePlanViewMode,
  canToggleCandidateNames,
  nameVisibility,
  onSelectVisibility,
  isUpdatingNames,
  showRerun,
  onRerun,
  isRerunning,
  conflictBadgeCount,
}) => (
  <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-6 py-3">
    <button
      type="button"
      onClick={onToggleMyInterviews}
      className={cn(
        actionButtonBase,
        myInterviewsOnly ? actionButtonActive : actionButtonNeutral,
        "px-3 py-1.5",
      )}
    >
      Mine intervjuer
      {myInterviewsCount > 0 && (
        <span className="ml-1 rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
          {myInterviewsCount}
        </span>
      )}
    </button>

    <SegmentedControl<"calendar" | "table">
      value={planViewMode}
      onChange={onChangePlanViewMode}
      items={[
        { key: "table", icon: <List size={15} />, title: "Liste" },
        {
          key: "calendar",
          icon: <CalendarDays size={15} />,
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
          value={nameVisibility}
          onChange={onSelectVisibility}
          items={[
            { key: "hidden", label: "Skjult" },
            { key: "admin_only", label: "Admin" },
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

    {showRerun && (
      <button
        type="button"
        onClick={onRerun}
        disabled={isRerunning}
        className={cn(actionButtonBase, actionButtonNeutral, "px-3 py-1.5")}
      >
        {isRerunning ? "Kjører…" : "Kjør på nytt med inhabiliteter"}
      </button>
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

export default PlanFilterBar;
