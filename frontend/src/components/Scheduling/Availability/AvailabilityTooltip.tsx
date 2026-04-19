import React from "react";

interface AvailabilityTooltipProps {
  dayLabel: string;
  hoursText: string;
}

const AvailabilityTooltip = ({
  dayLabel,
  hoursText,
}: AvailabilityTooltipProps) => {
  return (
    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-[var(--spacing-sm)] w-max max-w-[150px] -translate-x-1/2">
      <div className="rounded-[var(--border-radius-sm)] bg-[#111827] px-3 py-1.5 text-center text-[var(--color-white)] shadow-[var(--shadow-md)]">
        <div className="mb-1 border-b border-[var(--color-gray-7)] pb-1 text-[10px] font-bold uppercase text-[var(--color-gray-3)]">
          {dayLabel}
        </div>
        <div className="font-mono text-[10px] text-[var(--color-white)]">
          {hoursText}
        </div>
      </div>
      <div className="absolute bottom-[-4px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#111827]" />
    </div>
  );
};

export default AvailabilityTooltip;
