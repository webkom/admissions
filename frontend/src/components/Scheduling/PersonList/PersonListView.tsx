import React from "react";
import TimelineWrapper from "../TimelineWrapper";
import type { Candidate, Interviewer } from "../types";
import { DAYS_MAP } from "../utils/timeutils";
import AvailabilityBar from "../Availability/AvailabilityBar";
import { scheduleInsetClass, scheduleLabelClass } from "../shared";
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
            className="rounded-lg border border-[#e4e4e4] bg-white px-4 py-3.5"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e4e4e4] text-sm font-bold",
                  isFemale
                    ? "bg-[rgba(178,18,7,0.07)] text-[#b21207]"
                    : "bg-[#f0f0f0] text-[#6b6b6b]",
                )}
              >
                {personName.charAt(0)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-sm font-bold text-[#111111]">
                    {personName}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-[0.15rem] text-[0.688rem] font-bold",
                      isFemale
                        ? "border-[rgba(178,18,7,0.16)] bg-[rgba(178,18,7,0.07)] text-[#b21207]"
                        : "border-[#e4e4e4] bg-[#f0f0f0] text-[#6b6b6b]",
                    )}
                  >
                    {person.gender}
                  </span>
                </div>
                <span className={scheduleLabelClass}>#{person.id}</span>
              </div>
            </div>

            {isInterviewer && (
              <div className="mt-3 border-t border-[#f0f0f0] pt-3">
                <div className={cn(scheduleLabelClass, "mb-[0.4rem]")}>
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
        <div className={cn(scheduleInsetClass, "px-4 py-8 text-center")}>
          <h4 className="mb-[0.3rem] mt-0 text-sm font-bold text-[#111111]">
            Ingen registrerte personer
          </h4>
          <p className="m-0 text-[0.813rem] leading-[1.6] text-[#a0a0a0]">
            Listen blir fylt når kandidater eller intervjuere er tilgjengelige i
            denne visningen.
          </p>
        </div>
      )}
    </ul>
  );
};

export default PersonListView;
