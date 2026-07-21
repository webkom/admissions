import { useCallback, useEffect, useState } from "react";
import { makeSlotKey, parseSlotKey } from "../scheduleUtils";

type ToggleMode = "add" | "remove";

interface AvailabilityGridInteractionParams {
  dates: string[];
  selectedSlots: ReadonlySet<string>;
  timeSlots: number[];
  onChangeSlots: (slots: Set<string>) => void;
}

export const useAvailabilityGridInteractions = ({
  dates,
  selectedSlots,
  timeSlots,
  onChangeSlots,
}: AvailabilityGridInteractionParams) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<ToggleMode>("add");

  const applyToggle = useCallback(
    (
      date: string,
      chunk: number[],
      mode: ToggleMode,
      currentSlots: ReadonlySet<string>,
    ) => {
      const newSlots = new Set(currentSlots);
      chunk.forEach((minute) => {
        const key = makeSlotKey(date, minute);
        if (mode === "add") newSlots.add(key);
        else newSlots.delete(key);
      });
      onChangeSlots(newSlots);
    },
    [onChangeSlots],
  );

  const blockToggleMode = (date: string, chunk: number[]): ToggleMode =>
    chunk.some((minute) => selectedSlots.has(makeSlotKey(date, minute)))
      ? "remove"
      : "add";

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    // Touch pointers capture implicitly on pointerdown; release so cells
    // under the moving finger receive pointerenter during the drag.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const nextMode = blockToggleMode(date, chunk);
    setDragMode(nextMode);
    setIsDragging(true);
    applyToggle(date, chunk, nextMode, selectedSlots);
  };

  const handlePointerEnter = (date: string, chunk: number[]) => {
    if (isDragging) applyToggle(date, chunk, dragMode, selectedSlots);
  };

  const handleCellKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    date: string,
    chunk: number[],
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    applyToggle(date, chunk, blockToggleMode(date, chunk), selectedSlots);
  };

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerUp]);

  const selectAllForDay = (date: string) => {
    const newSlots = new Set(selectedSlots);
    Array.from(newSlots).forEach((key) => {
      if (parseSlotKey(key).date === date) newSlots.delete(key);
    });
    timeSlots.forEach((minute) => newSlots.add(makeSlotKey(date, minute)));
    onChangeSlots(newSlots);
  };

  const clearAllForDay = (date: string) => {
    const newSlots = new Set(selectedSlots);
    Array.from(newSlots).forEach((key) => {
      if (parseSlotKey(key).date === date) newSlots.delete(key);
    });
    onChangeSlots(newSlots);
  };

  const selectAll = () => {
    const newSlots = new Set<string>();
    dates.forEach((date) => {
      timeSlots.forEach((minute) => newSlots.add(makeSlotKey(date, minute)));
    });
    onChangeSlots(newSlots);
  };

  const clearAll = () => onChangeSlots(new Set());

  return {
    clearAll,
    clearAllForDay,
    handleCellKeyDown,
    handlePointerDown,
    handlePointerEnter,
    selectAll,
    selectAllForDay,
  };
};
