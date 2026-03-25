import React from "react";
import { DAYS_MAP } from "../utils/timeutils";
import type { Interviewer } from "../types";
import AvailabilityBar from "./AvailabilityBar";
import styled from "styled-components";

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

// --- Lego Styled Components ---

const TimelineWrapper = styled.div`
  display: flex;
  gap: 3px;
  width: 100%;
`;
