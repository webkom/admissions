import React from "react";
import TimelineWrapper from "../TimelineWrapper";
import type { Candidate, Interviewer } from "../types";
import { DAYS_MAP } from "../utils/timeutils";
import AvailabilityBar from "../Availability/AvailabilityBar";
import cn from "src/utils/cn";

interface PersonListViewProps {
  data: Candidate[] | Interviewer[];
}

const PersonListView = ({ data }: PersonListViewProps) => {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {data.map((person) => {
        const isInterviewer = "availability" in person;
        const personName = person.name?.trim() || "Ukjent person";
        const isFemale = person.gender === "F";

        return (
          <li
            key={person.id}
            className="rounded-lg border border-border bg-surface-base px-4 py-3.5"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-sm font-bold",
                  isFemale
                    ? "bg-brand-tint text-brand"
                    : "bg-surface-neutral text-text-muted",
                )}
              >
                {personName.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-bold text-text-primary">
                    {personName}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-label font-bold",
                      isFemale
                        ? "border-brand-strongBorder bg-brand-tint text-brand"
                        : "border-border bg-surface-neutral text-text-muted",
                    )}
                  >
                    {person.gender}
                  </span>
                </div>
                <span className="text-label font-bold uppercase tracking-label text-text-subtle">
                  #{person.id}
                </span>
              </div>
            </div>

            {isInterviewer && (
              <div className="mt-3 border-t border-border-soft pt-3">
                <div className="mb-[0.4rem] text-label font-bold uppercase tracking-label text-text-subtle">
                  Tilgjengelighet
                </div>
                <TimelineWrapper $gap="4px">
                  {DAYS_MAP.map((dayLabel, dayIndex) => {
                    const hasAvailability = (
                      person as Interviewer
                    ).availability.some(
                      (slot) => Math.floor(slot / 24) === dayIndex,
                    );
                    return (
                      <AvailabilityBar
                        key={dayIndex}
                        dayLabel={dayLabel}
                        dayIndex={dayIndex}
                        allSlots={(person as Interviewer).availability}
                        isActive={hasAvailability}
                      />
                    );
                  })}
                </TimelineWrapper>
              </div>
            )}
          </li>
        );
      })}

      {data.length === 0 && (
        <div className="rounded-lg border border-border bg-surface-muted px-4 py-8 text-center">
          <h4 className="mb-1 mt-0 text-sm font-bold text-text-primary">
            Ingen registrerte personer
          </h4>
          <p className="m-0 text-ui leading-relaxed text-text-subtle">
            Listen blir fylt når kandidater eller intervjuere er tilgjengelige i
            denne visningen.
          </p>
        </div>
      )}
    </ul>
  );
};

export default PersonListView;
