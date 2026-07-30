import { DateTime } from "luxon";
import { CALENDAR_TIME_ZONE } from "src/components/ui/Calendar/calendarDateUtils";

export interface AdmissionLifecycleDates {
  open_from: string;
  public_deadline: string;
  closed_from: string;
}

export const ADMISSION_TIME_ZONE = CALENDAR_TIME_ZONE;

export type AdmissionDateTimeIssue = "invalid" | "ambiguous";

export const getAdmissionDateTimeIssue = (
  value: string,
): AdmissionDateTimeIssue | null => {
  const parsed = DateTime.fromISO(value, { zone: ADMISSION_TIME_ZONE });
  if (!parsed.isValid || parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== value) {
    return "invalid";
  }
  return parsed.getPossibleOffsets().length > 1 ? "ambiguous" : null;
};

const formatDate = (date: DateTime): string =>
  date.toFormat("yyyy-MM-dd'T'HH:mm:ss");

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
    open_from: formatDate(opening),
    public_deadline: formatDate(deadline),
    closed_from: formatDate(closing),
  };
};
