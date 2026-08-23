import React from "react";
import ScheduleGridFrame, {
  ScheduleDayHeader,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";

interface ScheduleCalendarGridCellInput {
  date: string;
  chunk: number[];
  chunkIndex: number;
}

interface ScheduleCalendarGridProps {
  dates: string[];
  chunks: number[][];
  sessionDuration: number;
  renderCell: (input: ScheduleCalendarGridCellInput) => React.ReactNode;
  renderDayHeader?: (date: string) => React.ReactNode;
  renderTimeLabel?: (
    input: Omit<ScheduleCalendarGridCellInput, "date">,
  ) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
  ariaLabel: string;
}

/**
 * The structural calendar shared by Rammer, personal availability, and the
 * coverage overview. Each surface supplies only its header and cell-specific
 * state, so column sizing, time labels, and block ordering stay identical.
 */
const ScheduleCalendarGrid: React.FC<ScheduleCalendarGridProps> = ({
  dates,
  chunks,
  sessionDuration,
  renderCell,
  renderDayHeader,
  renderTimeLabel,
  emptyState,
  className,
  ariaLabel,
}) => (
  <ScheduleGridFrame
    dates={dates}
    className={className}
    gridAriaLabel={ariaLabel}
    gridClassName="items-stretch"
  >
    <div aria-hidden="true" className="min-h-16" />
    {dates.map((date) => (
      <div key={date} role="columnheader" className="min-w-0">
        {renderDayHeader ? (
          renderDayHeader(date)
        ) : (
          <ScheduleDayHeader date={date} />
        )}
      </div>
    ))}
    {chunks.length === 0 && emptyState ? (
      <div style={{ gridColumn: `span ${dates.length + 1}` }}>{emptyState}</div>
    ) : (
      chunks.map((chunk, chunkIndex) => (
        <React.Fragment key={chunkIndex}>
          <div role="rowheader">
            {renderTimeLabel?.({ chunk, chunkIndex }) ?? (
              <ScheduleTimeLabel
                startMinute={chunk[0]}
                endMinute={chunk[chunk.length - 1] + sessionDuration}
                showEnd={chunk.length > 1}
              />
            )}
          </div>
          {dates.map((date) => (
            <div
              key={`${date}-${chunkIndex}`}
              role="gridcell"
              className="min-w-0"
            >
              {renderCell({ date, chunk, chunkIndex })}
            </div>
          ))}
        </React.Fragment>
      ))
    )}
  </ScheduleGridFrame>
);

export default ScheduleCalendarGrid;
