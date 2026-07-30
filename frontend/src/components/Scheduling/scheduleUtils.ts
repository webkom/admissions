import type {
  Candidate,
  EnabledWindow,
  Interviewer,
  ManualScheduleBlock,
  ScheduleItem,
} from "../../types";

const MINUTES_PER_DAY = 24 * 60;

const normalizeDuration = (sessionDuration: number): number =>
  sessionDuration > 0 ? sessionDuration : 60;

const toDate = (value: string | Date): Date => {
  if (value instanceof Date) return new Date(value.getTime());
  // Parse YYYY-MM-DD as a local date (avoids UTC-induced off-by-one).
  const [y, m, d] = value.split("-").map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  return new Date(value);
};

const toIsoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const addDays = (date: string | Date, days: number): string => {
  const next = toDate(date);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
};

export const nextMonday = (from: Date = new Date()): string => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay();
  // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat. Distance to the next Monday (1..7).
  const offset = (1 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + offset);
  return toIsoDate(d);
};

export const dateRangeDates = (
  start: string | Date,
  end: string | Date | null | undefined,
  limit?: number,
): string[] => {
  if (!start) return [];
  const startDate = toDate(start);
  const endDate = end ? toDate(end) : startDate;
  if (endDate < startDate) return [];
  const out: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && (limit === undefined || out.length < limit)) {
    out.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

const WEEKDAYS_NB = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"];

export const formatDateHeader = (
  date: string | Date,
): { weekday: string; dayMonth: string } => {
  const d = toDate(date);
  const weekday = WEEKDAYS_NB[d.getDay()] ?? "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return { weekday, dayMonth: `${day}.${month}` };
};

export const buildBlockTimeChunks = ({
  dayStartMinute,
  dayEndMinute,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
}: {
  dayStartMinute: number;
  dayEndMinute: number;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
}): number[][] => {
  const duration = normalizeDuration(sessionDuration);
  const size = Math.max(1, Math.floor(chunkSize || 1));
  const breakMinutes = Math.max(0, chunkBreakMinutes || 0);
  const chunks: number[][] = [];
  let currentMinute = dayStartMinute;

  while (currentMinute + duration <= dayEndMinute) {
    const chunk: number[] = [];
    for (
      let slotInChunk = 0;
      slotInChunk < size && currentMinute + duration <= dayEndMinute;
      slotInChunk += 1
    ) {
      chunk.push(currentMinute);
      currentMinute += duration;
    }

    if (chunk.length > 0) chunks.push(chunk);
    currentMinute += breakMinutes;
  }

  return chunks;
};

export const buildContinuousTimeSlots = ({
  dayStartMinute,
  dayEndMinute,
  sessionDuration,
}: {
  dayStartMinute: number;
  dayEndMinute: number;
  sessionDuration: number;
}): number[] => {
  const duration = normalizeDuration(sessionDuration);
  const slots: number[] = [];
  for (
    let minute = dayStartMinute;
    minute + duration <= dayEndMinute;
    minute += duration
  ) {
    slots.push(minute);
  }
  return slots;
};

export const slotsToSolverAvailability = (
  slots: Set<string> | string[],
  dates: string[],
  sessionDuration: number,
): number[] => {
  const availability = new Set<number>();
  const slotsArray = Array.isArray(slots) ? slots : Array.from(slots);
  slotsArray.forEach((key) => {
    const { date, minute } = parseSlotKey(key);
    if (!Number.isFinite(minute)) return;
    const dayIndex = dates.indexOf(date);
    if (dayIndex === -1) return;
    availability.add(encodeScheduleTime(dayIndex, minute, sessionDuration));
  });
  return Array.from(availability).sort((a, b) => a - b);
};

export const manualBlocksToSolverBlocks = (
  blocks: ManualScheduleBlock[],
  dates: string[],
  sessionDuration: number,
): number[][] =>
  blocks.map((block) =>
    slotsToSolverAvailability(block.slots, dates, sessionDuration),
  );

export const encodeScheduleTime = (
  dayIndex: number,
  minute: number,
  sessionDuration: number,
): number => {
  void sessionDuration;
  return dayIndex * MINUTES_PER_DAY + minute;
};

export const decodeScheduleTime = (
  time: number,
  sessionDuration: number,
): { dayIndex: number; minute: number } => {
  void sessionDuration;
  const dayIndex = Math.floor(time / MINUTES_PER_DAY);
  return { dayIndex, minute: time - dayIndex * MINUTES_PER_DAY };
};

export const makeSlotKey = (date: string, minute: number): string =>
  `${date}|${minute}`;

export const parseSlotKey = (key: string): { date: string; minute: number } => {
  const separator = key.includes("|")
    ? key.lastIndexOf("|")
    : key.lastIndexOf(":");
  if (separator === -1) return { date: key, minute: NaN };
  return {
    date: key.slice(0, separator),
    minute: Number(key.slice(separator + 1)),
  };
};

export const normalizeEnabledWindows = (
  windows: EnabledWindow[] = [],
): EnabledWindow[] => {
  const byDate = new Map<string, Array<[number, number]>>();

  windows.forEach((window) => {
    const date = window.date;
    const start = Number(window.start_minute);
    const end = Number(window.end_minute);
    if (!date || !Number.isFinite(start) || !Number.isFinite(end)) return;
    if (start < 0 || end > MINUTES_PER_DAY || start >= end) return;

    const current = byDate.get(date) ?? [];
    current.push([start, end]);
    byDate.set(date, current);
  });

  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([date, intervals]) => {
      const merged: Array<[number, number]> = [];
      [...intervals]
        .sort(([a], [b]) => a - b)
        .forEach(([start, end]) => {
          const previous = merged[merged.length - 1];
          if (!previous || start > previous[1]) {
            merged.push([start, end]);
          } else {
            previous[1] = Math.max(previous[1], end);
          }
        });

      return merged.map(([start_minute, end_minute]) => ({
        date,
        start_minute,
        end_minute,
      }));
    });
};

export const slotsToEnabledWindows = (
  slots: Iterable<string>,
  sessionDuration: number,
): EnabledWindow[] => {
  const duration = normalizeDuration(sessionDuration);
  const windows: EnabledWindow[] = [];

  Array.from(slots).forEach((key) => {
    const { date, minute } = parseSlotKey(key);
    if (!date || !Number.isFinite(minute)) return;
    windows.push({
      date,
      start_minute: minute,
      end_minute: minute + duration,
    });
  });

  return normalizeEnabledWindows(windows);
};

export const enabledWindowsToSlots = (
  windows: EnabledWindow[],
  sessionDuration: number,
): string[] => {
  const duration = normalizeDuration(sessionDuration);
  const slots: string[] = [];

  normalizeEnabledWindows(windows).forEach((window) => {
    for (
      let minute = window.start_minute;
      minute + duration <= window.end_minute;
      minute += duration
    ) {
      slots.push(makeSlotKey(window.date, minute));
    }
  });

  return slots;
};

const pad = (value: number): string => String(value).padStart(2, "0");

export const formatMinutes = (minute: number): string =>
  `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;

export const formatSlotLabel = (
  time: number,
  dates: string[],
  sessionDuration: number,
): string => {
  const { dayIndex, minute } = decodeScheduleTime(time, sessionDuration);
  const timeLabel = formatMinutes(minute);
  const date = dates[dayIndex];
  if (!date) return `Dag ${dayIndex + 1} ${timeLabel}`;
  const { weekday, dayMonth } = formatDateHeader(date);
  return `${weekday} ${dayMonth} ${timeLabel}`;
};

export const buildSolveBlocks = ({
  dates,
  dayStartMinute,
  dayEndMinute,
  sessionDuration,
  chunkSize,
  chunkBreakMinutes,
}: {
  dates: string[];
  dayStartMinute: number;
  dayEndMinute: number;
  sessionDuration: number;
  chunkSize: number;
  chunkBreakMinutes: number;
}): number[][] => {
  const blockChunks = buildBlockTimeChunks({
    dayStartMinute,
    dayEndMinute,
    sessionDuration,
    chunkSize,
    chunkBreakMinutes,
  });
  return dates.flatMap((_, dayIndex) =>
    blockChunks.map((chunk) =>
      chunk.map((minute) =>
        encodeScheduleTime(dayIndex, minute, sessionDuration),
      ),
    ),
  );
};

export const buildLockedAssignments = (
  schedule: ScheduleItem[],
  candidates: Candidate[],
  interviewers: Interviewer[],
): Array<{
  candidate_id?: string;
  candidate: string;
  time: number;
  panel: Array<{ id?: string; name: string }>;
}> => {
  const uniqueIdByName = <T extends { id: string; name: string }>(
    items: T[],
  ) => {
    const grouped = new Map<string, string[]>();
    items.forEach((item) => {
      grouped.set(item.name, [...(grouped.get(item.name) ?? []), item.id]);
    });
    return new Map(
      Array.from(grouped.entries())
        .filter(([, ids]) => ids.length === 1)
        .map(([name, ids]) => [name, ids[0]]),
    );
  };
  const candidateIdByName = uniqueIdByName(candidates);
  const interviewerIdByName = uniqueIdByName(interviewers);
  return schedule
    .filter((item) => item.locked)
    .map((item) => ({
      candidate_id: item.candidate_id ?? candidateIdByName.get(item.candidate),
      candidate: item.candidate,
      time: item.time,
      panel: item.panel.map((member) => ({
        id: member.id ?? interviewerIdByName.get(member.name),
        name: member.name,
      })),
    }));
};

const formatIcsLocal = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}00`;

const escapeIcsText = (text: string): string =>
  text
    .replace(/\r/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");

const slugifyIcs = (text: string): string => {
  const slug = text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "intervjuplan";
};

const ICS_LINE_OCTETS = 75;
const icsEncoder = new TextEncoder();

const foldIcsLine = (line: string): string => {
  const folded: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const charOctets = icsEncoder.encode(char).length;
    if (octets + charOctets > ICS_LINE_OCTETS) {
      folded.push(current);
      current = " ";
      octets = 1;
    }
    current += char;
    octets += charOctets;
  }
  folded.push(current);
  return folded.join("\r\n");
};

const OSLO_VTIMEZONE: readonly string[] = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Oslo",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const stableIcsItemIdentifier = (item: ScheduleItem) => {
  if (item.export_uid) return item.export_uid;
  const source =
    item.candidate_id ??
    `${item.candidate}|${item.time}|${item.panel
      .map((member) => member.id ?? member.name)
      .join("|")}`;
  let hash = 0x811c9dc5;
  for (const char of source) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

export const generateIcs = (
  schedule: ScheduleItem[],
  dates: string[],
  sessionDuration: number,
  title: string,
  opts?: { uidSeed?: string },
): string => {
  const duration = normalizeDuration(sessionDuration);
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate(),
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds(),
  )}Z`;
  const uidBase = slugifyIcs(opts?.uidSeed || title);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//webkom//admissions//NO`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(title)}`,
    "X-WR-TIMEZONE:Europe/Oslo",
    ...OSLO_VTIMEZONE,
  ];

  schedule.forEach((item) => {
    const { dayIndex, minute } = decodeScheduleTime(item.time, duration);
    const dateStr = dates[dayIndex];
    if (!dateStr) return;
    const start = toDate(dateStr);
    start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const summary = `Intervju: ${item.candidate}`;
    const panel = item.panel.map((member) => member.name).join(", ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidBase}-${stableIcsItemIdentifier(item)}@admissions`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Europe/Oslo:${formatIcsLocal(start)}`,
      `DTEND;TZID=Europe/Oslo:${formatIcsLocal(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(`Panel: ${panel}`)}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
};
