import React from "react";
import { Check, Minus } from "lucide-react";
import cn from "src/utils/cn";
import { iconSizes, iconStrokeWidths } from "src/styles/designTokens";
import { makeSlotKey } from "../scheduleUtils";
import { ScheduleBlockCell, ScheduleSlotSegments } from "./ScheduleGridFrame";
import ScheduleCalendarGrid from "./ScheduleCalendarGrid";

type UnselectedPresentation = "available" | "closed";

export interface SelectableScheduleGridLabels {
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
  unselectedPresentation: UnselectedPresentation;
  renderDayHeader?: (date: string) => React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}

type ToggleMode = "add" | "remove";

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
  unselectedPresentation,
  renderDayHeader,
  emptyState,
  className,
}) => {
  const isDraggingRef = React.useRef(false);
  const dragModeRef = React.useRef<ToggleMode>("add");
  const activeSlotsRef = React.useRef(activeSlots);

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

  const applyToggle = React.useCallback(
    (date: string, chunk: number[], mode: ToggleMode) => {
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
    (date: string, chunk: number[]): ToggleMode =>
      selectableMinutes(date, chunk).some((minute) =>
        activeSlotsRef.current.has(makeSlotKey(date, minute)),
      )
        ? "remove"
        : "add",
    [selectableMinutes],
  );

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (selectableMinutes(date, chunk).length === 0) return;

    // Touch pointers capture implicitly. Releasing lets the cells under a
    // moving finger receive pointerenter while the drag continues.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const nextMode = blockToggleMode(date, chunk);
    dragModeRef.current = nextMode;
    isDraggingRef.current = true;
    applyToggle(date, chunk, nextMode);
  };

  const handlePointerEnter = (date: string, chunk: number[]) => {
    if (isDraggingRef.current) applyToggle(date, chunk, dragModeRef.current);
  };

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (selectableMinutes(date, chunk).length === 0) return;
    applyToggle(date, chunk, blockToggleMode(date, chunk));
  };

  const finishDrag = React.useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  React.useEffect(() => {
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [finishDrag]);

  return (
    <ScheduleCalendarGrid
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
        const isVisuallyClosed =
          !isSelectable ||
          (unselectedPresentation === "closed" && !isActive && !isPartial);
        const cellLabel = labels.cell({
          date,
          startMinute: chunk[0],
          endMinute: chunk[chunk.length - 1] + sessionDuration,
        });

        return (
          <ScheduleBlockCell
            key={`${date}-${chunkIndex}`}
            role="button"
            tabIndex={isSelectable ? 0 : -1}
            aria-pressed={isPartial ? "mixed" : isActive}
            aria-disabled={!isSelectable}
            aria-label={
              isSelectable
                ? `${cellLabel}, ${activeCount} av ${availableMinutes.length}`
                : labels.unavailableCell
            }
            onPointerDown={(event) => handlePointerDown(event, date, chunk)}
            onPointerEnter={() => handlePointerEnter(date, chunk)}
            onKeyDown={(event) => handleCellKeyDown(event, date, chunk)}
            className={cn(
              "transition-[background-color,border-color,box-shadow,color] duration-200 ease-out motion-reduce:transition-none",
              isSelectable ? "cursor-pointer" : "cursor-default",
              (isActive || isPartial) &&
                "border-brand-activeBorder bg-brand-tint text-brand ring-1 ring-inset ring-brand-border hover:bg-brand-fill",
              isSelectable &&
                !isActive &&
                unselectedPresentation === "available" &&
                "border-border bg-surface-base hover:border-brand-strongBorder hover:bg-brand-soft",
              isVisuallyClosed &&
                "border-border-soft bg-surface-neutral text-text-disabled",
              isSelectable && isVisuallyClosed && "hover:border-brand-border",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 transition-[opacity,background-position] duration-300 ease-out motion-reduce:transition-none",
                "[background-image:var(--pattern-unavailable)]",
                isVisuallyClosed
                  ? "opacity-70 [background-position:0_0] group-hover:opacity-100"
                  : "opacity-0 [background-position:8px_8px]",
              )}
            />
            <ScheduleSlotSegments
              className="relative z-10 h-schedule-progress"
              closed={isVisuallyClosed}
              fills={chunk.map((minute) =>
                isSlotSelectable(date, minute) &&
                activeSlots.has(makeSlotKey(date, minute))
                  ? 1
                  : 0,
              )}
            />
            {isPartial ? (
              <Minus
                size={iconSizes.compact}
                strokeWidth={iconStrokeWidths.strong}
                aria-hidden="true"
                className="relative z-10 text-brand-dark"
              />
            ) : (
              <Check
                size={iconSizes.compact}
                strokeWidth={iconStrokeWidths.strong}
                aria-hidden="true"
                className={cn(
                  "relative z-10 text-brand-dark transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                  isActive ? "scale-100 opacity-100" : "scale-75 opacity-0",
                )}
              />
            )}
          </ScheduleBlockCell>
        );
      }}
    />
  );
};

export default SelectableScheduleGrid;
