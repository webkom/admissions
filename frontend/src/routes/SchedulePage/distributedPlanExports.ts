import { ScheduleItem } from "../../types";
import { generateIcs } from "src/components/Scheduling/scheduleUtils";
import { escapeCsvCell } from "src/utils/methods";
import { DistributedScheduleEntry } from "./distributedPlanSelectors";
import { getInterviewStatusLabel } from "src/utils/interviewStatus";

type CalendarTarget = "apple" | "google";

const download = (contents: BlobPart[], type: string, filename: string) => {
  const blob = new Blob(contents, { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const exportAnonymizedScheduleIcs = ({
  schedule,
  dates,
  sessionDuration,
  target,
  myInterviewsOnly,
}: {
  schedule: ScheduleItem[];
  dates: string[];
  sessionDuration: number;
  target: CalendarTarget;
  myInterviewsOnly: boolean;
}) => {
  const icsContent = buildAnonymizedScheduleIcs({
    schedule,
    dates,
    sessionDuration,
  });
  const filename =
    target === "google"
      ? myInterviewsOnly
        ? "mine-intervjuer-google.ics"
        : "intervjuplan-google.ics"
      : myInterviewsOnly
        ? "mine-intervjuer-apple.ics"
        : "intervjuplan-apple.ics";
  download([icsContent], "text/calendar;charset=utf-8", filename);

  if (target === "google") {
    window.open(
      "https://calendar.google.com/calendar/u/0/r/settings/importexport",
      "_blank",
      "noopener,noreferrer",
    );
  }
};

export const buildAnonymizedScheduleIcs = ({
  schedule,
  dates,
  sessionDuration,
}: {
  schedule: ScheduleItem[];
  dates: string[];
  sessionDuration: number;
}) => {
  const anonymizedSchedule = schedule.map((item, index) => ({
    ...item,
    candidate: `Kandidat ${index + 1}`,
    candidate_id: undefined,
    candidate_phone: undefined,
  }));
  return generateIcs(
    anonymizedSchedule,
    dates,
    sessionDuration,
    "Intervjuplan",
    { uidSeed: "intervjuplan" },
  );
};

/** Which optional columns a schedule CSV export should carry. `Tidspunkt` and
 *  `Kandidat` are always present; `showNames` decides whether the candidate
 *  column holds real names or anonymised "Kandidat N" labels. */
export interface ScheduleCsvFields {
  showNames: boolean;
  panel: boolean;
  status: boolean;
  applicationText: boolean;
}

export const exportVisibleScheduleCsv = ({
  entries,
  fields,
  formatTimeLabel,
  applicationTextById,
}: {
  entries: DistributedScheduleEntry[];
  fields: ScheduleCsvFields;
  formatTimeLabel: (time: number) => string;
  applicationTextById?: ReadonlyMap<string, string>;
}) => {
  const csv = buildVisibleScheduleCsv({
    entries,
    fields,
    formatTimeLabel,
    applicationTextById,
  });
  download(
    ["\ufeff" + csv],
    "text/csv;charset=utf-8",
    fields.applicationText
      ? "intervjuplan-med-soknadstekst.csv"
      : "intervjuplan.csv",
  );
};

export const buildVisibleScheduleCsv = ({
  entries,
  fields,
  formatTimeLabel,
  applicationTextById,
}: {
  entries: DistributedScheduleEntry[];
  fields: ScheduleCsvFields;
  formatTimeLabel: (time: number) => string;
  /** Søknadstekst per candidate id, for the `applicationText` column. */
  applicationTextById?: ReadonlyMap<string, string>;
}) => {
  const withText = fields.applicationText && applicationTextById !== undefined;
  const rows: string[][] = [
    [
      "Tidspunkt",
      "Kandidat",
      ...(fields.panel ? ["Panel"] : []),
      ...(fields.status ? ["Intervjustatus"] : []),
      ...(withText ? ["Søknadstekst"] : []),
    ],
  ];
  entries.forEach(({ item }, index) => {
    rows.push([
      formatTimeLabel(item.time),
      fields.showNames ? item.candidate : `Kandidat ${index + 1}`,
      ...(fields.panel
        ? [item.panel.map((member) => member.name).join("; ")]
        : []),
      ...(fields.status
        ? [
            item.interview_status
              ? getInterviewStatusLabel(item.interview_status)
              : "Ikke registrert",
          ]
        : []),
      ...(withText
        ? [
            (item.candidate_id &&
              applicationTextById?.get(item.candidate_id)) ||
              "",
          ]
        : []),
    ]);
  });
  return rows
    .map((row) => row.map((cell) => `"${escapeCsvCell(cell)}"`).join(","))
    .join("\n");
};
