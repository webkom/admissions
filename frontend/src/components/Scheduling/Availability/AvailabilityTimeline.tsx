import React from "react";
import TimelineWrapper from "../TimelineWrapper";
import { DAYS_MAP } from "../utils/timeutils";
import type { Interviewer } from "../types";
import AvailabilityBar from "./AvailabilityBar";

interface AvailabilityTimelineProps {
  availability: Interviewer["availability"];
}

const AvailabilityTimeline = ({ availability }: AvailabilityTimelineProps) => {
  return (
    <TimelineWrapper>
      {DAYS_MAP.map((dayLabel, dayIndex) => {
        const hasAvailability = availability.some(
          (slot) => Math.floor(slot / 24) === dayIndex,
        );

        return (
          <AvailabilityBar
            key={dayIndex}
            dayLabel={dayLabel}
            dayIndex={dayIndex}
            allSlots={availability}
            isActive={hasAvailability}
          />
        );
      })}
    </TimelineWrapper>
  );
};

export default AvailabilityTimeline;
