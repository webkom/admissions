import React from "react";
import { makeSlotKey } from "../scheduleUtils";
import { ScheduleSelectableBlockCell } from "./ScheduleGridFrame";
import ScheduleCalendarGrid from "./ScheduleCalendarGrid";
import {
  isScheduleGridToggleKey,
  useScheduleGridDragToggle,
  type ScheduleGridToggleMode,
} from "./useScheduleGridDragToggle";

interface SelectableScheduleGridLabels {
  grid: string;
  cell: (input: {
    date: string;
    startMinute: number;
    endMinute: number;
  }) => string;
  unavailableCell: string;
}

interface SelectableScheduleGridProps {
  dates: string[];
  chunks: number[][];
  sessionDuration: number;
  selectableSlots?: ReadonlySet<string>;
  activeSlots: ReadonlySet<string>;
  onChangeActiveSlots: (slots: Set<string>) => void;
  labels: SelectableScheduleGridLabels;
  renderDayHeader?: (date: string) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}

/**
 * Controlled interaction and rendering core shared by personal availability
 * and schedule setup. The wrappers own persistence, bulk actions and copy.
 */
const SelectableScheduleGrid: React.FC<SelectableScheduleGridProps> = ({
  dates,
  chunks,
  sessionDuration,
  selectableSlots,
  activeSlots,
  onChangeActiveSlots,
  labels,
  renderDayHeader,
  emptyState,
  className,
}) => {
  const activeSlotsRef = React.useRef(activeSlots);
  const cellRefs = React.useRef(new Map<string, HTMLDivElement>());

  React.useEffect(() => {
    activeSlotsRef.current = activeSlots;
  }, [activeSlots]);

  const isSlotSelectable = React.useCallback(
    (date: string, minute: number) =>
      !selectableSlots || selectableSlots.has(makeSlotKey(date, minute)),
    [selectableSlots],
  );

  const selectableMinutes = React.useCallback(
    (date: string, chunk: number[]) =>
      chunk.filter((minute) => isSlotSelectable(date, minute)),
    [isSlotSelectable],
  );

  const selectableCellKeys = React.useMemo(
    () =>
      chunks.flatMap((chunk, chunkIndex) =>
        dates
          .filter((date) => selectableMinutes(date, chunk).length > 0)
          .map((date) => `${date}::${chunkIndex}`),
      ),
    [chunks, dates, selectableMinutes],
  );
  const [activeCellKey, setActiveCellKey] = React.useState(
    () => selectableCellKeys[0] ?? "",
  );
  const rovingCellKey = selectableCellKeys.includes(activeCellKey)
    ? activeCellKey
    : (selectableCellKeys[0] ?? "");

  React.useEffect(() => {
    if (activeCellKey !== rovingCellKey) {
      setActiveCellKey(rovingCellKey);
    }
  }, [activeCellKey, rovingCellKey]);

  const applyToggle = React.useCallback(
    (date: string, chunk: number[], mode: ScheduleGridToggleMode) => {
      const minutes = selectableMinutes(date, chunk);
      if (minutes.length === 0) return;

      const nextSlots = new Set(activeSlotsRef.current);
      minutes.forEach((minute) => {
        const key = makeSlotKey(date, minute);
        if (mode === "add") nextSlots.add(key);
        else nextSlots.delete(key);
      });
      activeSlotsRef.current = nextSlots;
      onChangeActiveSlots(nextSlots);
    },
    [onChangeActiveSlots, selectableMinutes],
  );

  const blockToggleMode = React.useCallback(
    (date: string, chunk: number[]): ScheduleGridToggleMode =>
      selectableMinutes(date, chunk).some((minute) =>
        activeSlotsRef.current.has(makeSlotKey(date, minute)),
      )
        ? "remove"
        : "add",
    [selectableMinutes],
  );

  const { onPointerDown, onPointerEnter } = useScheduleGridDragToggle({
    getMode: ({ date, chunk }: { date: string; chunk: number[] }) =>
      blockToggleMode(date, chunk),
    apply: ({ date, chunk }, mode) => applyToggle(date, chunk, mode),
  });

  const focusCell = React.useCallback((cellKey: string) => {
    setActiveCellKey(cellKey);
    cellRefs.current.get(cellKey)?.focus();
  }, []);

  const findNavigationTarget = React.useCallback(
    (key: string, date: string, chunkIndex: number): string | undefined => {
      const currentDateIndex = dates.indexOf(date);
      const rowKeys = dates
        .map((candidateDate) => `${candidateDate}::${chunkIndex}`)
        .filter((candidateKey) => selectableCellKeys.includes(candidateKey));

      if (key === "Home") {
        return rowKeys[0];
      }
      if (key === "End") {
        return rowKeys[rowKeys.length - 1];
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        const currentRowIndex = rowKeys.indexOf(`${date}::${chunkIndex}`);
        const offset = key === "ArrowLeft" ? -1 : 1;
        return rowKeys[currentRowIndex + offset];
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const offset = key === "ArrowUp" ? -1 : 1;
        for (
          let nextChunkIndex = chunkIndex + offset;
          nextChunkIndex >= 0 && nextChunkIndex < chunks.length;
          nextChunkIndex += offset
        ) {
          const sameColumnKey = `${dates[currentDateIndex]}::${nextChunkIndex}`;
          if (selectableCellKeys.includes(sameColumnKey)) {
            return sameColumnKey;
          }
        }
      }
      return undefined;
    },
    [chunks.length, dates, selectableCellKeys],
  );

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
    chunkIndex: number,
  ) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      const target =
        (event.ctrlKey || event.metaKey) && event.key === "Home"
          ? selectableCellKeys[0]
          : (event.ctrlKey || event.metaKey) && event.key === "End"
            ? selectableCellKeys[selectableCellKeys.length - 1]
            : findNavigationTarget(event.key, date, chunkIndex);
      if (target) {
        event.preventDefault();
        focusCell(target);
      }
      return;
    }
    if (!isScheduleGridToggleKey(event.key)) return;
    event.preventDefault();
    if (selectableMinutes(date, chunk).length === 0) return;
    applyToggle(date, chunk, blockToggleMode(date, chunk));
  };

  return (
    <ScheduleCalendarGrid
      ariaLabel={labels.grid}
      dates={dates}
      chunks={chunks}
      sessionDuration={sessionDuration}
      className={className}
      renderDayHeader={renderDayHeader}
      emptyState={emptyState}
      renderCell={({ date, chunk, chunkIndex }) => {
        const availableMinutes = selectableMinutes(date, chunk);
        const isSelectable = availableMinutes.length > 0;
        const activeCount = availableMinutes.filter((minute) =>
          activeSlots.has(makeSlotKey(date, minute)),
        ).length;
        const isActive =
          isSelectable && activeCount === availableMinutes.length;
        const isPartial = activeCount > 0 && !isActive;
        const cellKey = `${date}::${chunkIndex}`;
        const cellLabel = labels.cell({
          date,
          startMinute: chunk[0],
          endMinute: chunk[chunk.length - 1] + sessionDuration,
        });

        return (
          <ScheduleSelectableBlockCell
            key={`${date}-${chunkIndex}`}
            ref={(element) => {
              if (element) cellRefs.current.set(cellKey, element);
              else cellRefs.current.delete(cellKey);
            }}
            activeCount={activeCount}
            totalCount={availableMinutes.length}
            selectable={isSelectable}
            distinguishUnavailable
            hideTrackWhenUnavailable
            fills={chunk.map((minute) =>
              isSlotSelectable(date, minute) &&
              activeSlots.has(makeSlotKey(date, minute))
                ? 1
                : 0,
            )}
            role="button"
            tabIndex={isSelectable && cellKey === rovingCellKey ? 0 : -1}
            aria-pressed={isPartial ? "mixed" : isActive}
            aria-disabled={!isSelectable}
            aria-label={
              isSelectable
                ? `${cellLabel}, ${activeCount} av ${availableMinutes.length}`
                : labels.unavailableCell
            }
            onPointerDown={(event) => {
              if (isSelectable) onPointerDown(event, { date, chunk });
            }}
            onPointerEnter={() => {
              if (isSelectable) onPointerEnter({ date, chunk });
            }}
            onClick={(event) => {
              if (event.detail === 0 && isSelectable) {
                applyToggle(date, chunk, blockToggleMode(date, chunk));
              }
            }}
            onFocus={() => {
              if (isSelectable) setActiveCellKey(cellKey);
            }}
            onKeyDown={(event) =>
              handleCellKeyDown(event, date, chunk, chunkIndex)
            }
          />
        );
      }}
    />
  );
};

export default SelectableScheduleGrid;
