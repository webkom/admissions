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

export const exportVisibleScheduleCsv = ({
  entries,
  candidateNamesVisible,
  formatTimeLabel,
  applicationTextById,
}: {
  entries: DistributedScheduleEntry[];
  candidateNamesVisible: boolean;
  formatTimeLabel: (time: number) => string;
  applicationTextById?: ReadonlyMap<string, string>;
}) => {
  const csv = buildVisibleScheduleCsv({
    entries,
    candidateNamesVisible,
    formatTimeLabel,
    applicationTextById,
  });
  download(
    ["\ufeff" + csv],
    "text/csv;charset=utf-8",
    applicationTextById
      ? "intervjuplan-med-soknadstekst.csv"
      : "intervjuplan.csv",
  );
};

export const buildVisibleScheduleCsv = ({
  entries,
  candidateNamesVisible,
  formatTimeLabel,
  applicationTextById,
}: {
  entries: DistributedScheduleEntry[];
  candidateNamesVisible: boolean;
  formatTimeLabel: (time: number) => string;
  /** Søknadstekst per candidate id. Present only for the with-text export;
   *  passing it adds the column. */
  applicationTextById?: ReadonlyMap<string, string>;
}) => {
  const withText = applicationTextById !== undefined;
  const rows: string[][] = [
    [
      "Tidspunkt",
      "Kandidat",
      "Panel",
      "Intervjustatus",
      ...(withText ? ["Søknadstekst"] : []),
    ],
  ];
  entries.forEach(({ item }) => {
    rows.push([
      formatTimeLabel(item.time),
      candidateNamesVisible ? item.candidate : "—",
      item.panel.map((member) => member.name).join("; "),
      item.interview_status
        ? getInterviewStatusLabel(item.interview_status)
        : "Ikke registrert",
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
