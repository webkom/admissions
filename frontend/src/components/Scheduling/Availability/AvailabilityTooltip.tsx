import React from "react";
import styled from "styled-components";

interface AvailabilityTooltipProps {
  dayLabel: string;
  hoursText: string;
}

const AvailabilityTooltip = ({
  dayLabel,
  hoursText,
}: AvailabilityTooltipProps) => {
  return (
    <TooltipWrapper>
      <TooltipContent>
        <TooltipHeader>{dayLabel}</TooltipHeader>
        <TooltipBody>{hoursText}</TooltipBody>
      </TooltipContent>
      <Arrow />
    </TooltipWrapper>
  );
};

export default AvailabilityTooltip;

// --- Styles ---

const TooltipWrapper = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: var(--spacing-sm);
  width: max-content;
  max-width: 150px;
  z-index: 50;
  pointer-events: none; /* Let mouse pass through so it doesn't flicker */
`;

const TooltipContent = styled.div`
  background: var(--color-gray-9); /* Dark background */
  color: var(--color-white);
  border-radius: var(--border-radius-sm);
  padding: 6px 12px;
  box-shadow: var(--shadow-md);
  text-align: center;
`;

const TooltipHeader = styled.div`
  font-weight: bold;
  font-size: 10px;
  border-bottom: 1px solid var(--color-gray-7);
  padding-bottom: 4px;
  margin-bottom: 4px;
  color: var(--color-gray-3);
  text-transform: uppercase;
`;

const TooltipBody = styled.div`
  font-family: monospace;
  font-size: 10px;
  color: var(--color-white);
`;

const Arrow = styled.div`
  width: 8px;
  height: 8px;
  background: var(--color-gray-9);
  transform: rotate(45deg) translateX(-50%);
  position: absolute;
  left: 50%;
  bottom: -4px;
`;
