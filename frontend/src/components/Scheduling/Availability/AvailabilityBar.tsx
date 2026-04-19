import React, { useState } from "react";
import { formatAvailabilityForDay } from "../utils/timeutils";
import AvailabilityTooltip from "./AvailabilityTooltip";
import cn from "src/utils/cn";

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
    <div className="relative flex-1">
      <div
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          "h-1.5 w-full rounded-full transition-all duration-200 hover:scale-y-150",
          isActive
            ? "bg-brand hover:bg-brand-dark"
            : "bg-border hover:bg-border-quiet",
        )}
      />

      <div
        className={cn(
          "mt-1.5 text-center text-label font-bold uppercase tracking-label transition-colors duration-200",
          isActive ? "text-text-strong" : "text-text-faded",
        )}
      >
        {dayLabel.charAt(0)}
      </div>

      {showTooltip && (
        <AvailabilityTooltip dayLabel={dayLabel} hoursText={hoursText} />
      )}
    </div>
  );
};

export default AvailabilityBar;
