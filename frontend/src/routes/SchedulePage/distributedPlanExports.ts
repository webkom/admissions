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
  const anonymizedSchedule = schedule.map((item, index) => ({
    ...item,
    candidate: `Kandidat ${index + 1}`,
    candidate_id: undefined,
  }));
  const icsContent = generateIcs(
    anonymizedSchedule,
    dates,
    sessionDuration,
    "Intervjuplan",
    { uidSeed: "intervjuplan" },
  );
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

export const exportVisibleScheduleCsv = ({
  entries,
  candidateNamesVisible,
  formatTimeLabel,
}: {
  entries: DistributedScheduleEntry[];
  candidateNamesVisible: boolean;
  formatTimeLabel: (time: number) => string;
}) => {
  const rows: string[][] = [
    ["Tidspunkt", "Kandidat", "Panel", "Intervjustatus", "Bookingtype"],
  ];
  entries.forEach(({ item }) => {
    rows.push([
      formatTimeLabel(item.time),
      candidateNamesVisible ? item.candidate : "—",
      item.panel.map((member) => member.name).join("; "),
      item.interview_status
        ? getInterviewStatusLabel(item.interview_status)
        : "Ikke registrert",
      item.booking_source === "manual" ? "Manuell" : "Solver",
    ]);
  });
  const csv = rows
    .map((row) => row.map((cell) => `"${escapeCsvCell(cell)}"`).join(","))
    .join("\n");
  download(["\ufeff" + csv], "text/csv;charset=utf-8", "intervjuplan.csv");
};
