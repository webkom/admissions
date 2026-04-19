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
            ? "bg-[var(--lego-red-color)] hover:bg-[#8e0e06]"
            : "bg-[#e5e7eb] hover:bg-[#d1d5db]",
        )}
      />

      <div
        className={cn(
          "mt-1.5 text-center text-[0.688rem] font-bold uppercase tracking-[0.09em] transition-colors duration-200",
          isActive ? "text-[#111827]" : "text-[#9ca3af]",
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
