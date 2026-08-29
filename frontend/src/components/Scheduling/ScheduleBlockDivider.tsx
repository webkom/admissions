import React from "react";
import cn from "src/utils/cn";
import {
  scheduleDividerRow,
  scheduleTimeRangePill,
} from "./scheduleTableStyles";

interface ScheduleBlockDividerProps {
  /** Total column count of the table this row sits in. */
  colSpan: number;
  /** "Lør 5 sep, Blokk 1" / "Tor 3 sep" / "Utenfor blokk". */
  title: string;
  /** "09:00 – 10:30". */
  timeRange?: string | null;
  /** Right-of-title note - interview count, session length, etc. */
  meta?: React.ReactNode;
  /** The block's panel, rendered as chips beneath the title. Draft passes
   *  editable chips, published passes static ones. */
  panel?: React.ReactNode;
  /** Tints the row while its block is the selected swap target. */
  highlighted?: boolean;
}

/**
 * The day / block divider row shared by the draft and published schedule
 * tables: a bold title, an optional time-range pill and meta note, and the
 * block panel as chips on a second line.
 */
export const ScheduleBlockDivider: React.FC<ScheduleBlockDividerProps> = ({
  colSpan,
  title,
  timeRange,
  meta,
  panel,
  highlighted = false,
}) => (
  <tr
    className={cn(
      scheduleDividerRow,
      "transition-colors",
      highlighted && "bg-brand-soft/40",
    )}
  >
    <td colSpan={colSpan} className="px-4 py-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-bold text-text-primary">{title}</span>
          {timeRange && (
            <span className={scheduleTimeRangePill} title="Blokkens tidsrom">
              {timeRange}
            </span>
          )}
          {meta && (
            <span className="text-xs font-medium text-text-muted">{meta}</span>
          )}
        </div>
        {panel && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-text-muted">
              Panel:
            </span>
            {panel}
          </div>
        )}
      </div>
    </td>
  </tr>
);

export default ScheduleBlockDivider;
