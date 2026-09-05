import React from "react";
import { CalendarDays, List, Users } from "lucide-react";

import { SegmentedControl } from "src/components/Scheduling/ui";
import { NameVisibility } from "../../types";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

export interface PlanFilterBarProps {
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
  onOpenConflictsOverview?: () => void;
  dates?: string[];
  selectedDateFilter?: string | null;
  onSelectDateFilter?: (date: string | null) => void;
  dateCounts?: Map<string, number>;
  statusCounts?: {
    total: number;
    not_invited: number;
    invited: number;
    confirmed: number;
    completed: number;
    cancelled?: number;
  };
  selectedStatusFilter?: string | null;
  onSelectStatusFilter?: (status: string | null) => void;
  /**
   * Status chips reveal the committee's outreach progress (who has been
   * invited, who cancelled, who confirmed). That is a recruiting-side
   * concern; ordinary members must not be able to surface it.
   */
  canFilterByStatus?: boolean;
}

const formatDayButtonLabel = (dateStr: string) => {
  try {
    const date = new Date(dateStr + "T12:00:00");
    const weekday = date.toLocaleDateString("nb-NO", { weekday: "short" });
    const dayMonth = date
      .toLocaleDateString("nb-NO", { day: "numeric", month: "short" })
      .replace(".", "");
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${dayMonth}`;
  } catch {
    return dateStr;
  }
};

// Both filter rows share one chip: a plain bordered chip that fills with the
// brand tint when it is the active filter - the same treatment the segmented
// controls above use. Status chips add a coloured dot so the status colour
// code (matching the badges in the table) stays readable in every state.
const filterChipClass =
  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-detail font-semibold transition-colors cursor-pointer";
const filterChipIdleClass =
  "border-border-soft bg-surface-base text-text-muted hover:bg-surface-hover hover:text-text-primary";
const filterChipActiveClass = "border-brand-border bg-brand-tint text-brand";

const filterCountClass = (active: boolean) =>
  cn("font-normal tabular-nums", active ? "text-brand/70" : "text-text-faded");

type StatusFilterKey =
  | "confirmed"
  | "invited"
  | "not_invited"
  | "completed"
  | "cancelled";

const STATUS_FILTERS: {
  key: StatusFilterKey;
  label: string;
  dotClass: string;
}[] = [
  { key: "not_invited", label: "Ikke kalt inn", dotClass: "bg-text-subtle" },
  { key: "invited", label: "Kalt inn", dotClass: "bg-warning-solid" },
  { key: "confirmed", label: "Tid bekreftet", dotClass: "bg-success" },
  { key: "completed", label: "Fullført", dotClass: "bg-success" },
  { key: "cancelled", label: "Trukket / Avlyst", dotClass: "bg-danger" },
];

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
  onOpenConflictsOverview,
  dates = [],
  selectedDateFilter = null,
  onSelectDateFilter,
  dateCounts,
  statusCounts,
  selectedStatusFilter = null,
  onSelectStatusFilter,
  canFilterByStatus = false,
}) => {
  const totalDateCount = dateCounts
    ? Array.from(dateCounts.values()).reduce((sum, c) => sum + c, 0)
    : 0;

  const showSecondRow =
    (dates.length > 1 && onSelectDateFilter) ||
    (canFilterByStatus &&
      statusCounts &&
      statusCounts.total > 0 &&
      onSelectStatusFilter);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-6 py-3">
        <div
          className="inline-flex"
          title="Vis hele planen eller bare intervjuene du selv sitter i"
        >
          <SegmentedControl<"all" | "mine">
            aria-label="Filtrer intervjuer"
            value={myInterviewsOnly ? "mine" : "all"}
            onChange={(next) => {
              if ((next === "mine") !== myInterviewsOnly)
                onToggleMyInterviews();
            }}
            items={[
              { key: "all", label: "Alle" },
              {
                key: "mine",
                label: "Mine",
                count: myInterviewsCount > 0 ? myInterviewsCount : undefined,
              },
            ]}
          />
        </div>

        <SegmentedControl<"calendar" | "table">
          aria-label="Visning av intervjuplan"
          value={planViewMode}
          onChange={onChangePlanViewMode}
          items={[
            {
              key: "table",
              icon: <List size={iconSizes.control} />,
              label: "Liste",
            },
            {
              key: "calendar",
              icon: <CalendarDays size={iconSizes.control} />,
              label: "Kalender",
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
        <span className="ml-auto flex items-center gap-2">
          {onOpenConflictsOverview && (
            <button
              type="button"
              onClick={onOpenConflictsOverview}
              title="Åpne oversikt over inhabiliteter i komiteen"
              className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-surface-base px-2.5 py-1 text-label font-semibold text-text-primary hover:border-brand hover:bg-brand-soft hover:text-brand transition-colors cursor-pointer"
            >
              <Users size={iconSizes.tiny} className="text-brand" />
              <span>Inhabiliteter</span>
              {conflictBadgeCount > 0 && (
                <span className="rounded-full bg-brand-soft px-1.5 py-0.2 text-nano font-bold text-brand">
                  {conflictBadgeCount}
                </span>
              )}
            </button>
          )}
          {!onOpenConflictsOverview && conflictBadgeCount > 0 && (
            <span className="rounded-full border border-brand-border bg-brand-muted px-2 py-0.5 text-label font-bold text-brand">
              {conflictBadgeCount} inhabiliteter
            </span>
          )}
        </span>
      </div>
      {showSecondRow && (
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-border-soft bg-surface-subtle/50 px-6 py-3">
          {dates.length > 1 && onSelectDateFilter && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-0.5 text-detail font-bold uppercase tracking-wide text-text-subtle">
                Dag
              </span>
              <button
                type="button"
                onClick={() => onSelectDateFilter(null)}
                aria-pressed={selectedDateFilter === null}
                className={cn(
                  filterChipClass,
                  selectedDateFilter === null
                    ? filterChipActiveClass
                    : filterChipIdleClass,
                )}
              >
                Alle dager
                {totalDateCount > 0 && (
                  <span
                    className={filterCountClass(selectedDateFilter === null)}
                  >
                    ({totalDateCount})
                  </span>
                )}
              </button>
              {dates.map((date) => {
                const count = dateCounts?.get(date) ?? 0;
                const isSelected = selectedDateFilter === date;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDateFilter(isSelected ? null : date)}
                    aria-pressed={isSelected}
                    className={cn(
                      filterChipClass,
                      isSelected ? filterChipActiveClass : filterChipIdleClass,
                    )}
                  >
                    {formatDayButtonLabel(date)}
                    <span className={filterCountClass(isSelected)}>
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {canFilterByStatus &&
            statusCounts &&
            statusCounts.total > 0 &&
            onSelectStatusFilter && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-0.5 text-detail font-bold uppercase tracking-wide text-text-subtle">
                  Status
                </span>
                {STATUS_FILTERS.filter(
                  (status) => (statusCounts[status.key] ?? 0) > 0,
                ).map((status) => {
                  const count = statusCounts[status.key] ?? 0;
                  const isSelected = selectedStatusFilter === status.key;
                  return (
                    <button
                      key={status.key}
                      type="button"
                      onClick={() =>
                        onSelectStatusFilter(isSelected ? null : status.key)
                      }
                      aria-pressed={isSelected}
                      title={
                        isSelected
                          ? "Fjern statusfilter"
                          : `Vis bare intervjuer med status: ${status.label}`
                      }
                      className={cn(
                        filterChipClass,
                        isSelected
                          ? filterChipActiveClass
                          : filterChipIdleClass,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-2 w-2 flex-none rounded-full",
                          status.dotClass,
                        )}
                      />
                      {status.label}
                      <span className={filterCountClass(isSelected)}>
                        ({count})
                      </span>
                    </button>
                  );
                })}
                {selectedStatusFilter && (
                  <button
                    type="button"
                    onClick={() => onSelectStatusFilter(null)}
                    className="ml-0.5 text-detail font-semibold text-text-muted underline underline-offset-2 hover:text-text-primary cursor-pointer"
                  >
                    Nullstill
                  </button>
                )}
              </div>
            )}
        </div>
      )}
    </>
  );
};

export default PlanFilterBar;
