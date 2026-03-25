import React, { useState } from "react";
import styled from "styled-components";
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
  border-radius: 3px;
  transition: all 0.2s ease;

  background-color: ${(props) =>
    props.$isActive ? "var(--success-color)" : "var(--color-gray-2)"};

  &:hover {
    transform: scaleY(1.5);
    background-color: ${(props) =>
      props.$isActive ? "var(--color-green-7)" : "var(--color-gray-3)"};
  }
`;

const DayLabel = styled.div<{ $isActive: boolean }>`
  font-size: 10px;
  text-align: center;
  margin-top: 6px;
  font-weight: 700;
  text-transform: uppercase;
  transition: color 0.2s ease;

  color: ${(props) =>
    props.$isActive ? "var(--lego-font-color)" : "var(--color-gray-4)"};
`;
