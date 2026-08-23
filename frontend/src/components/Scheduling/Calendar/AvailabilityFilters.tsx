import React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { CustomSelect } from "../ui";
import { iconSizes } from "src/styles/designTokens";
import cn from "src/utils/cn";

export type AvailabilityGenderFilter = "all" | "male" | "female";

const genderOptions = [
  { value: "all", label: "Alle" },
  { value: "male", label: "Menn" },
  { value: "female", label: "Kvinner" },
];

interface AvailabilityFiltersProps {
  isOpen: boolean;
  onToggle: () => void;
  genderFilter: AvailabilityGenderFilter;
  onGenderFilterChange: (value: AvailabilityGenderFilter) => void;
  highlightedInterviewer: string;
  onHighlightedInterviewerChange: (value: string) => void;
  interviewers: Array<{ id: string; name: string }>;
}

const AvailabilityFilters = ({
  isOpen,
  onToggle,
  genderFilter,
  onGenderFilterChange,
  highlightedInterviewer,
  onHighlightedInterviewerChange,
  interviewers,
}: AvailabilityFiltersProps) => (
  <div className="flex flex-col items-start gap-3 tablet:items-end">
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls="availability-filters"
      onClick={onToggle}
      className="inline-flex items-center justify-between gap-2 rounded-md border border-border-soft bg-surface-base px-2.5 py-1.5 text-detail font-semibold text-text-primary shadow-sm transition-colors hover:border-brand-border hover:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-focus"
    >
      <span className="inline-flex items-center gap-2">
        <SlidersHorizontal size={iconSizes.small} aria-hidden="true" />
        Filtrer og fremhev
        {(genderFilter !== "all" || highlightedInterviewer) && (
          <span className="rounded bg-brand-soft px-1.5 py-0.5 text-label font-semibold text-brand">
            Aktiv
          </span>
        )}
      </span>
      <ChevronDown
        size={iconSizes.small}
        aria-hidden="true"
        className={cn(
          "transition-transform motion-reduce:transition-none",
          isOpen && "rotate-180",
        )}
      />
    </button>
    {isOpen && (
      <fieldset
        id="availability-filters"
        className="flex w-full flex-wrap items-end gap-x-4 gap-y-3 rounded-md border border-border-soft bg-surface-subtle p-3 animate-fade-in motion-reduce:animate-none"
      >
        <legend className="sr-only">Visning</legend>
        <label
          className="flex flex-col gap-1 text-detail font-medium text-text-muted"
          htmlFor="gender-filter"
        >
          Kjønn på intervjuere
          <CustomSelect
            id="gender-filter"
            value={genderFilter}
            className="min-w-36"
            onChange={(value) =>
              onGenderFilterChange(value as AvailabilityGenderFilter)
            }
            options={genderOptions}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-detail font-medium text-text-muted"
          htmlFor="interviewer-highlight"
        >
          Fremhev intervjuer
          <CustomSelect
            id="interviewer-highlight"
            value={highlightedInterviewer}
            className="min-w-44"
            placeholder="Ingen"
            onChange={onHighlightedInterviewerChange}
            options={[
              { value: "", label: "Ingen" },
              ...interviewers.map((interviewer) => ({
                value: interviewer.id,
                label: interviewer.name,
              })),
            ]}
          />
        </label>
      </fieldset>
    )}
  </div>
);

export default AvailabilityFilters;
