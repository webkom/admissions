import { makeSlotKey, parseSlotKey } from "../scheduleUtils";

interface AvailabilityGridBulkSelectionParams {
  dates: string[];
  selectedSlots: ReadonlySet<string>;
  timeSlots: number[];
  onChangeSlots: (slots: Set<string>) => void;
}

export const useAvailabilityGridBulkSelection = ({
  dates,
  selectedSlots,
  timeSlots,
  onChangeSlots,
}: AvailabilityGridBulkSelectionParams) => {
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
    selectAll,
    selectAllForDay,
  };
};
