import React from "react";
import { calendarGrid } from "src/styles/designTokens";
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
  <ScheduleGridFrame dates={dates} className={className} layout="table">
    <table
      aria-label={ariaLabel}
      className="w-full table-fixed border-separate border-spacing-2 [&_td]:!bg-transparent [&_td]:!p-0 [&_th]:!rounded-none [&_th]:!bg-transparent [&_th]:!p-0 [&_tr]:!bg-transparent"
    >
      <colgroup>
        <col style={{ width: calendarGrid.timeColumnWidth }} />
        {dates.map((date) => (
          <col
            key={date}
            style={{ minWidth: calendarGrid.dayColumnMinWidth }}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th aria-hidden="true" />
          {dates.map((date) => (
            <th key={date} scope="col" className="p-0 font-normal">
              {renderDayHeader ? (
                renderDayHeader(date)
              ) : (
                <ScheduleDayHeader date={date} />
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {chunks.length === 0 && emptyState ? (
          <tr>
            <td colSpan={dates.length + 1}>{emptyState}</td>
          </tr>
        ) : (
          chunks.map((chunk, chunkIndex) => (
            <tr key={chunkIndex}>
              <th scope="row" className="p-0 font-normal">
                {renderTimeLabel?.({ chunk, chunkIndex }) ?? (
                  <ScheduleTimeLabel
                    startMinute={chunk[0]}
                    endMinute={chunk[chunk.length - 1] + sessionDuration}
                    showEnd={chunk.length > 1}
                  />
                )}
              </th>
              {dates.map((date) => (
                <td key={`${date}-${chunkIndex}`} className="p-0 align-middle">
                  {renderCell({ date, chunk, chunkIndex })}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </ScheduleGridFrame>
);

export default ScheduleCalendarGrid;
