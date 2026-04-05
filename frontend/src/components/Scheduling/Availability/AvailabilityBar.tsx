import React, { useState } from "react";
import styled from "styled-components";
import { scheduleLabel } from "../shared";
import { formatAvailabilityForDay } from "../utils/timeutils";
import AvailabilityTooltip from "./AvailabilityTooltip";

interface AvailabilityBarProps {
  dayLabel: string;
  dayIndex: number;
  allSlots: number[];
  isActive: boolean;
}

const AvailabilityBar = ({
  dayLabel,
  dayIndex,
  allSlots,
  isActive,
}: AvailabilityBarProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const hoursText = isActive
    ? formatAvailabilityForDay(allSlots, dayIndex)
    : "Utilgjengelig";

  return (
    <Wrapper>
      <Bar
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        $isActive={isActive}
      />

      <DayLabel $isActive={isActive}>{dayLabel.charAt(0)}</DayLabel>

      {showTooltip && (
        <AvailabilityTooltip dayLabel={dayLabel} hoursText={hoursText} />
      )}
    </Wrapper>
  );
};

export default AvailabilityBar;

const Wrapper = styled.div`
  position: relative;
  flex: 1;
`;

const Bar = styled.div<{ $isActive: boolean }>`
  height: 6px;
  width: 100%;
  border-radius: 999px;
  transition: all 0.2s ease;

  background-color: ${(props) => (props.$isActive ? "#166534" : "#d8cec0")};

  &:hover {
    transform: scaleY(1.5);
    background-color: ${(props) => (props.$isActive ? "#14532d" : "#c9bcab")};
  }
`;

const DayLabel = styled.div<{ $isActive: boolean }>`
  ${scheduleLabel};
  text-align: center;
  margin-top: 6px;
  transition: color 0.2s ease;

  color: ${(props) => (props.$isActive ? "#111827" : "#a39584")};
`;
