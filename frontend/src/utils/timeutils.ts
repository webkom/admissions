export const DAYS_MAP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const formatAvailabilityForDay = (
  allSlots: number[],
  dayIndex: number,
): string => {
  const daySlots = allSlots
    .filter((slot) => Math.floor(slot / 24) === dayIndex)
    .map((slot) => slot % 24)
    .sort((a, b) => a - b);

  if (daySlots.length === 0) return "Unavailable";

  // 2. Group consecutive hours into ranges (e.g., 9, 10, 11 -> "09:00-12:00")
  const ranges: string[] = [];
  let start = daySlots[0];
  let prev = daySlots[0];

  for (let i = 1; i < daySlots.length; i++) {
    if (daySlots[i] !== prev + 1) {
      ranges.push(formatRange(start, prev));
      start = daySlots[i];
    }
    prev = daySlots[i];
  }
  ranges.push(formatRange(start, prev));

  return ranges.join(", ");
};

const formatRange = (start: number, end: number): string => {
  const startTime = `${start.toString().padStart(2, "0")}:00`;
  const endTime = `${(end + 1).toString().padStart(2, "0")}:00`;
  return `${startTime}-${endTime}`;
};
