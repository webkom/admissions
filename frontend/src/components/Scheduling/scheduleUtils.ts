import type { ScheduleItem } from "../../types";

const MINUTES_PER_DAY = 24 * 60;

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
): string[] => {
  if (!start) return [];
  const startDate = toDate(start);
  const endDate = end ? toDate(end) : startDate;
  if (endDate < startDate) return [];
  const out: string[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
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

const slotsPerDay = (sessionDuration: number): number => {
  const duration = sessionDuration > 0 ? sessionDuration : 60;
  return Math.max(1, Math.floor(MINUTES_PER_DAY / duration));
};

export const encodeScheduleTime = (
  dayIndex: number,
  minute: number,
  sessionDuration: number,
): number => {
  const duration = sessionDuration > 0 ? sessionDuration : 60;
  const slotIndex = Math.floor(minute / duration);
  return dayIndex * slotsPerDay(duration) + slotIndex;
};

export const decodeScheduleTime = (
  time: number,
  sessionDuration: number,
): { dayIndex: number; minute: number } => {
  const duration = sessionDuration > 0 ? sessionDuration : 60;
  const spd = slotsPerDay(duration);
  const dayIndex = Math.floor(time / spd);
  const slotIndex = time - dayIndex * spd;
  return { dayIndex, minute: slotIndex * duration };
};

export const makeSlotKey = (date: string, minute: number): string =>
  `${date}|${minute}`;

export const parseSlotKey = (key: string): { date: string; minute: number } => {
  const separator = key.indexOf("|");
  if (separator === -1) return { date: key, minute: NaN };
  return {
    date: key.slice(0, separator),
    minute: Number(key.slice(separator + 1)),
  };
};

const pad = (value: number): string => String(value).padStart(2, "0");

const formatIcsLocal = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}00`;

const escapeIcsText = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");

export const generateIcs = (
  schedule: ScheduleItem[],
  dates: string[],
  sessionDuration: number,
  title: string,
): string => {
  const duration = sessionDuration > 0 ? sessionDuration : 60;
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(
    now.getUTCDate(),
  )}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(
    now.getUTCSeconds(),
  )}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//webkom//admissions//NO`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(title)}`,
  ];

  schedule.forEach((item, index) => {
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
      `UID:${dtstamp}-${index}@admissions`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcsLocal(start)}`,
      `DTEND:${formatIcsLocal(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(`Panel: ${panel}`)}`,
      "END:VEVENT",
    );
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
};
