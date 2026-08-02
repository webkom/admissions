import { DateTime } from "luxon";
import { CALENDAR_TIME_ZONE } from "src/components/ui/Calendar/calendarDateUtils";

export interface AdmissionLifecycleDates {
  open_from: string;
  public_deadline: string;
  closed_from: string;
}

export const ADMISSION_TIME_ZONE = CALENDAR_TIME_ZONE;

export type AdmissionDateTimeIssue = "invalid" | "ambiguous";

const formatDateTime = (date: DateTime): string =>
  date.toFormat("yyyy-MM-dd'T'HH:mm:ss");

const hasExplicitOffset = (value: string): boolean =>
  /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

export const getAdmissionDateTimeIssue = (
  value: string,
): AdmissionDateTimeIssue | null => {
  const parsed = DateTime.fromISO(value, { zone: ADMISSION_TIME_ZONE });
  if (!parsed.isValid || formatDateTime(parsed) !== value) {
    return "invalid";
  }
  return parsed.getPossibleOffsets().length > 1 ? "ambiguous" : null;
};

export const toAdmissionLocalDateTime = (value?: string): string => {
  const parsed = DateTime.fromISO(value ?? "", {
    zone: ADMISSION_TIME_ZONE,
    setZone: true,
  }).setZone(ADMISSION_TIME_ZONE);
  return parsed.isValid ? formatDateTime(parsed) : "";
};

export const resolveAdmissionDateTime = (
  value: string,
  preservedValue?: string,
): DateTime | null => {
  const issue = getAdmissionDateTimeIssue(value);
  if (issue === "invalid") return null;

  if (issue === "ambiguous") {
    if (!preservedValue || !hasExplicitOffset(preservedValue)) return null;
    const preserved = DateTime.fromISO(preservedValue, {
      setZone: true,
    }).setZone(ADMISSION_TIME_ZONE);
    return preserved.isValid && formatDateTime(preserved) === value
      ? preserved
      : null;
  }

  const parsed = DateTime.fromISO(value, { zone: ADMISSION_TIME_ZONE });
  return parsed.isValid ? parsed : null;
};

export const serializeAdmissionDateTime = (
  value: string,
  preservedValue?: string,
): string | null =>
  resolveAdmissionDateTime(value, preservedValue)?.toISO({
    includeOffset: true,
  }) ?? null;

export const createDefaultAdmissionDates = (): AdmissionLifecycleDates => {
  const now = DateTime.now().setZone(ADMISSION_TIME_ZONE);
  const daysUntilMonday = (1 - now.weekday + 7) % 7 || 7;
  const opening = now.plus({ days: daysUntilMonday }).set({
    hour: 12,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const deadline = opening.plus({ days: 6 }).set({ hour: 23, minute: 59 });
  const closing = opening.plus({ days: 13 }).set({ hour: 23, minute: 59 });
  return {
    open_from: formatDateTime(opening),
    public_deadline: formatDateTime(deadline),
    closed_from: formatDateTime(closing),
  };
};
