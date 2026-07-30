import React, { useEffect, useState } from "react";

import cn from "src/utils/cn";

export interface TimeValue {
  h: number;
  m: number;
}

interface TimeSegmentInputProps {
  id?: string;
  className?: string;
  value: TimeValue;
  onChange: (next: TimeValue) => void;
  allowEndOfDay?: boolean;
  bare?: boolean;
  "aria-label": string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

const padSegment = (segment: number) => String(segment).padStart(2, "0");

interface TimeSegmentFieldProps {
  max: number;
  committed: number;
  onCommit: (next: number) => void;
  "aria-label": string;
}

const TimeSegmentField: React.FC<TimeSegmentFieldProps> = ({
  max,
  committed,
  onCommit,
  "aria-label": ariaLabel,
}) => {
  const [text, setText] = useState(padSegment(committed));

  // Sync local text with the committed value unless they already represent
  // the same number (keeps in-progress typing like "9" from snapping to "09").
  useEffect(() => {
    setText((current) => {
      const parsed = Number(current);
      const matchesCommitted =
        current.trim() !== "" &&
        Number.isFinite(parsed) &&
        Math.floor(parsed) === committed;
      return matchesCommitted ? current : padSegment(committed);
    });
  }, [committed]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    // An emptied segment stays empty until blur instead of collapsing to 0.
    if (next.trim() === "") return;
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) return;
    const floored = Math.floor(parsed);
    if (floored >= 0 && floored <= max && floored !== committed) {
      onCommit(floored);
    }
  };

  const handleBlur = () => {
    const parsed = Number(text);
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(padSegment(committed));
      return;
    }
    const clamped = Math.min(max, Math.max(0, Math.floor(parsed)));
    setText(padSegment(clamped));
    if (clamped !== committed) onCommit(clamped);
  };

  return (
    <input
      type="number"
      min={0}
      max={max}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className="w-8 border-none bg-transparent p-0 text-center text-sm font-bold tabular-nums text-text-primary [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      aria-label={ariaLabel}
    />
  );
};

export const TimeSegmentInput: React.FC<TimeSegmentInputProps> = ({
  id,
  className,
  value,
  onChange,
  allowEndOfDay = false,
  bare = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}) => {
  const isEndOfDay = allowEndOfDay && value.h === 24;

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      className={cn(
        bare
          ? "inline-flex items-center gap-0.5"
          : "inline-flex h-control-md items-center gap-0.5 rounded-md border border-border-soft bg-surface-base px-2 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-ringSoft",
        className,
      )}
    >
      <TimeSegmentField
        max={allowEndOfDay ? 24 : 23}
        committed={value.h}
        onCommit={(h) => onChange({ h, m: h === 24 ? 0 : value.m })}
        aria-label={`${ariaLabel}, time`}
      />
      <span className="select-none text-sm font-bold text-text-subtle">:</span>
      <TimeSegmentField
        max={isEndOfDay ? 0 : 59}
        committed={value.m}
        onCommit={(m) => onChange({ h: value.h, m: isEndOfDay ? 0 : m })}
        aria-label={`${ariaLabel}, minutt`}
      />
    </div>
  );
};
