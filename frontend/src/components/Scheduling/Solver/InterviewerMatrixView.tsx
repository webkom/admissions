import React, { useMemo } from "react";
import type { ScheduleItem, SchedulePanelMember } from "../types";
import {
  decodeScheduleTime,
  formatDateHeader,
  formatMinutes,
} from "../scheduleUtils";
import cn from "../../../utils/cn";
import { Lock } from "lucide-react";
import { iconSizes } from "../../../styles/designTokens";

interface MatrixEntry {
  item: ScheduleItem;
  scheduleIndex: number;
}

interface InterviewerMatrixViewProps {
  entries: MatrixEntry[];
  dates: string[];
  sessionDuration: number;
  dayIndex: number | null;
  canonicalBlocks: number[][];
  panelSize: number;
  hasConflictFor: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
  highlightedScheduleIndex: number | null;
  onSelectSlot: (scheduleIndex: number) => void;
}

interface TimeColumn {
  time: number;
  blockIndex: number;
  blockNumber: number | null;
}

interface InterviewerRow {
  key: string;
  name: string;
}

const memberKey = (member: SchedulePanelMember) =>
  member.id ? `id-${member.id}` : `name-${member.name}`;

const FIRST_COL_WIDTH = 180;
const COL_WIDTH = 84;
const ROW_HEIGHT = 44;

const SingleDayMatrix: React.FC<{
  entries: MatrixEntry[];
  sessionDuration: number;
  dayIndex: number;
  canonicalBlocks: number[][];
  hasConflictFor: (
    scheduleIndex: number,
    member: SchedulePanelMember,
  ) => boolean;
  highlightedScheduleIndex: number | null;
  onSelectSlot: (scheduleIndex: number) => void;
}> = ({
  entries,
  sessionDuration,
  dayIndex,
  canonicalBlocks,
  hasConflictFor,
  highlightedScheduleIndex,
  onSelectSlot,
}) => {
  const dayEntries = useMemo(() => {
    return entries.filter(({ item }) => {
      const decoded = decodeScheduleTime(item.time, sessionDuration);
      return decoded.dayIndex === dayIndex;
    });
  }, [dayIndex, entries, sessionDuration]);

  const scheduleIndexByTime = useMemo(() => {
    const map = new Map<number, number>();
    dayEntries.forEach(({ item, scheduleIndex }) => {
      // Joint interviews share a time; the first row drives the click target
      // and the (shared) panel, the cell lists every candidate below.
      if (!map.has(item.time)) map.set(item.time, scheduleIndex);
    });
    return map;
  }, [dayEntries]);

  const candidatesByTime = useMemo(() => {
    const map = new Map<number, string[]>();
    dayEntries.forEach(({ item }) => {
      const names = map.get(item.time);
      if (names) names.push(item.candidate);
      else map.set(item.time, [item.candidate]);
    });
    return map;
  }, [dayEntries]);

  const panelByScheduleIndex = useMemo(() => {
    const map = new Map<number, SchedulePanelMember[]>();
    dayEntries.forEach(({ item, scheduleIndex }) => {
      map.set(scheduleIndex, item.panel);
    });
    return map;
  }, [dayEntries]);

  const timeColumns = useMemo<TimeColumn[]>(() => {
    const timesInDay = new Set<number>();
    canonicalBlocks.forEach((block) => {
      block.forEach((time) => {
        if (decodeScheduleTime(time, sessionDuration).dayIndex === dayIndex) {
          timesInDay.add(time);
        }
      });
    });
    dayEntries.forEach(({ item }) => timesInDay.add(item.time));

    const sortedTimes = Array.from(timesInDay).sort((a, b) => a - b);

    const dayBlocks = canonicalBlocks
      .filter((block) =>
        block.some(
          (time) =>
            decodeScheduleTime(time, sessionDuration).dayIndex === dayIndex,
        ),
      )
      .map((block) => [...block].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);

    return sortedTimes.map((time) => {
      const bIndex = dayBlocks.findIndex((b) => b.includes(time));
      return {
        time,
        blockIndex: bIndex,
        blockNumber: bIndex >= 0 ? bIndex + 1 : null,
      };
    });
  }, [canonicalBlocks, dayEntries, dayIndex, sessionDuration]);

  const blockBoundaryAfter = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < timeColumns.length - 1; i += 1) {
      if (timeColumns[i].blockIndex !== timeColumns[i + 1].blockIndex) {
        set.add(i);
      }
    }
    return set;
  }, [timeColumns]);

  const interviewerList = useMemo<InterviewerRow[]>(() => {
    const map = new Map<string, string>();
    dayEntries.forEach(({ item }) => {
      item.panel.forEach((member) => {
        map.set(memberKey(member), member.name);
      });
    });
    return Array.from(map.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [dayEntries]);

  if (timeColumns.length === 0) {
    return (
      <div className="rounded-lg border border-border-soft bg-surface-base p-6 text-center text-detail text-text-muted">
        Ingen intervjuer på denne dagen.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft bg-surface-base shadow-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              className="sticky left-0 top-0 z-30 border-b border-r border-border-soft bg-surface-neutral px-4 py-3 text-left text-label font-semibold tracking-label text-text-muted"
              style={{ width: FIRST_COL_WIDTH, minWidth: FIRST_COL_WIDTH }}
            >
              Intervjuer
            </th>
            {timeColumns.map((col, index) => {
              const startsNewBlock =
                index > 0 && blockBoundaryAfter.has(index - 1);
              return (
                <th
                  key={`h-${col.time}`}
                  className={cn(
                    "sticky top-0 z-20 border-b border-border-soft bg-surface-neutral py-3 text-center align-middle font-normal",
                    startsNewBlock && "border-l-2 border-border-strong",
                  )}
                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                >
                  <span className="text-detail font-semibold tabular-nums text-text-primary">
                    {formatMinutes(
                      decodeScheduleTime(col.time, sessionDuration).minute,
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {interviewerList.length === 0 ? (
            <tr>
              <td
                colSpan={timeColumns.length + 1}
                className="px-4 py-6 text-center text-detail text-text-muted"
              >
                Ingen intervjuere tildelt denne dagen.
              </td>
            </tr>
          ) : (
            interviewerList.map((row) => {
              return (
                <tr key={row.key} className="group/row">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-border-soft bg-surface-base px-4 py-2 text-left font-semibold text-text-primary align-middle"
                    style={{
                      width: FIRST_COL_WIDTH,
                      minWidth: FIRST_COL_WIDTH,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <span className="block truncate text-ui">{row.name}</span>
                  </th>
                  {timeColumns.map((col, colIndex) => {
                    const scheduleIndex = scheduleIndexByTime.get(col.time);
                    const item =
                      scheduleIndex !== undefined
                        ? dayEntries.find(
                            (entry) => entry.scheduleIndex === scheduleIndex,
                          )?.item
                        : undefined;
                    const panel = scheduleIndex
                      ? panelByScheduleIndex.get(scheduleIndex)
                      : undefined;
                    const isOnPanel =
                      panel?.some((member) => memberKey(member) === row.key) ??
                      false;
                    const isHighlighted =
                      highlightedScheduleIndex === scheduleIndex;
                    const startsNewBlock =
                      colIndex > 0 && blockBoundaryAfter.has(colIndex - 1);
                    const borderClass = startsNewBlock
                      ? "border-l-2 border-border-strong"
                      : "";

                    if (!item || !panel) {
                      return (
                        <td
                          key={`${row.key}-${col.time}`}
                          className={cn("p-0 align-middle", borderClass)}
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                        />
                      );
                    }

                    if (!isOnPanel) {
                      return (
                        <td
                          key={`${row.key}-${col.time}`}
                          className={cn(
                            "p-0 text-center text-detail text-text-faded align-middle",
                            borderClass,
                          )}
                          style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                          aria-label="Ledig"
                        >
                          <span aria-hidden="true">—</span>
                        </td>
                      );
                    }

                    const memberInPanel = panel.find(
                      (m) => memberKey(m) === row.key,
                    );
                    const hasConflict =
                      memberInPanel && scheduleIndex !== undefined
                        ? hasConflictFor(scheduleIndex, memberInPanel)
                        : false;
                    const candidateLabel = (
                      candidatesByTime.get(col.time) ?? [item.candidate]
                    ).join(", ");
                    const ariaLabel = `${row.name} – ${candidateLabel} kl. ${formatMinutes(
                      decodeScheduleTime(item.time, sessionDuration).minute,
                    )}${item.locked ? " (låst)" : ""}`;

                    return (
                      <td
                        key={`${row.key}-${col.time}`}
                        className={cn("p-0 align-middle", borderClass)}
                        style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            scheduleIndex !== undefined &&
                            onSelectSlot(scheduleIndex)
                          }
                          data-cy="matrix-cell"
                          data-schedule-index={scheduleIndex}
                          title={`${candidateLabel}${item.locked ? " (låst)" : ""}`}
                          aria-label={ariaLabel}
                          className={cn(
                            "flex h-full w-full items-center justify-between gap-1 bg-transparent px-2 text-left text-nano font-semibold text-text-primary transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
                            hasConflict &&
                              "text-text-muted line-through decoration-danger decoration-1",
                            isHighlighted && "ring-2 ring-inset ring-brand",
                          )}
                        >
                          <span className="truncate">{candidateLabel}</span>
                          {item.locked && (
                            <Lock
                              size={iconSizes.tiny}
                              className="flex-none opacity-60"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const InterviewerMatrixView: React.FC<InterviewerMatrixViewProps> = ({
  entries,
  dates,
  sessionDuration,
  dayIndex,
  canonicalBlocks,
  hasConflictFor,
  highlightedScheduleIndex,
  onSelectSlot,
}) => {
  const daysToRender = useMemo(() => {
    if (dayIndex !== null) {
      return [dayIndex];
    }
    return dates.map((_, index) => index);
  }, [dates, dayIndex]);

  if (daysToRender.length === 0) {
    return (
      <div
        data-cy="interviewer-matrix"
        className="rounded-lg border border-border-soft bg-surface-base p-6 text-center text-detail text-text-muted"
      >
        Ingen intervjudager konfigurert.
      </div>
    );
  }

  return (
    <div data-cy="interviewer-matrix" className="flex flex-col gap-6">
      {daysToRender.map((dIndex) => {
        const date = dates[dIndex];
        const dateHeader = date ? formatDateHeader(date) : null;
        const dateLabel = dateHeader
          ? `${dateHeader.weekday} ${dateHeader.dayMonth}`
          : `Dag ${dIndex + 1}`;

        return (
          <div key={dIndex} className="flex flex-col gap-2">
            {dayIndex === null && (
              <div className="flex items-center gap-2 px-1">
                <h4 className="m-0 text-sm font-bold text-text-primary">
                  {dateLabel}
                </h4>
              </div>
            )}
            <SingleDayMatrix
              entries={entries}
              sessionDuration={sessionDuration}
              dayIndex={dIndex}
              canonicalBlocks={canonicalBlocks}
              hasConflictFor={hasConflictFor}
              highlightedScheduleIndex={highlightedScheduleIndex}
              onSelectSlot={onSelectSlot}
            />
          </div>
        );
      })}
    </div>
  );
};

export default InterviewerMatrixView;
