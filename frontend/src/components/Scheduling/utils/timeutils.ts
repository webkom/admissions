export const DAYS_MAP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const formatAvailabilityForDay = (
  allSlots: number[],
  dayIndex: number,
): string => {
  const daySlots = allSlots
    .filter((slot) => Math.floor(slot / 24) === dayIndex)
    .map((slot) => slot % 24)
    .sort((a, b) => a - b);

  if (daySlots.length === 0) {
    return "No availability";
  }

  const ranges: { start: number; end: number }[] = [];
  let rangeStart = daySlots[0];
  let rangeEnd = daySlots[0];

  for (let i = 1; i < daySlots.length; i++) {
    if (daySlots[i] === rangeEnd + 1) {
      rangeEnd = daySlots[i];
    } else {
      ranges.push({ start: rangeStart, end: rangeEnd });
      rangeStart = daySlots[i];
      rangeEnd = daySlots[i];
    }
  }
  ranges.push({ start: rangeStart, end: rangeEnd });

  // Format ranges as strings
  const formatHour = (hour: number): string => {
    const period = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 || 12;
    return `${displayHour}${period}`;
  };

  return ranges
    .map((range) => {
      if (range.start === range.end) {
        return formatHour(range.start);
      }
      return `${formatHour(range.start)}-${formatHour(range.end + 1)}`;
    })
    .join(", ");
};

/**
 * Convert a Set of slot strings (e.g., "1-14") to an array of slot numbers
 * @param slots - Set of slot strings in "day-hour" format
 * @returns Array of slot numbers (day * 24 + hour)
 */
export const slotsToAvailability = (slots: Set<string>): number[] => {
  return Array.from(slots).map((slot) => {
    const [day, hour] = slot.split("-").map(Number);
    return day * 24 + hour;
  });
};

/**
 * Convert an array of slot numbers to a Set of slot strings
 * @param availability - Array of slot numbers (day * 24 + hour)
 * @returns Set of slot strings in "day-hour" format
 */
export const availabilityToSlots = (availability: number[]): Set<string> => {
  return new Set(
    availability.map((slot) => {
      const day = Math.floor(slot / 24);
      const hour = slot % 24;
      return `${day}-${hour}`;
    }),
  );
};
