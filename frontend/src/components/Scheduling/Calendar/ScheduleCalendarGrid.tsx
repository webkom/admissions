import React from "react";
import ScheduleGridFrame, {
  ScheduleDayHeader,
  ScheduleTimeLabel,
} from "./ScheduleGridFrame";

export interface ScheduleCalendarGridCellInput {
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
}) => (
  <ScheduleGridFrame dates={dates} className={className}>
    <div />
    {dates.map((date) =>
      renderDayHeader ? (
        <React.Fragment key={date}>{renderDayHeader(date)}</React.Fragment>
      ) : (
        <ScheduleDayHeader key={date} date={date} />
      ),
    )}

    {chunks.length === 0 && emptyState
      ? emptyState
      : chunks.map((chunk, chunkIndex) => (
          <React.Fragment key={chunkIndex}>
            {renderTimeLabel?.({ chunk, chunkIndex }) ?? (
              <ScheduleTimeLabel
                startMinute={chunk[0]}
                endMinute={chunk[chunk.length - 1] + sessionDuration}
                showEnd={chunk.length > 1}
              />
            )}
            {dates.map((date) => renderCell({ date, chunk, chunkIndex }))}
          </React.Fragment>
        ))}
  </ScheduleGridFrame>
);

export default ScheduleCalendarGrid;
