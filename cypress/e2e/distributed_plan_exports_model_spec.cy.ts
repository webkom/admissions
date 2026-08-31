import {
  buildAnonymizedScheduleIcs,
  buildVisibleScheduleCsv,
} from "../../frontend/src/routes/SchedulePage/distributedPlanExports";
import type { ScheduleItem } from "../../frontend/src/types";

const privateSchedule: ScheduleItem[] = [
  {
    candidate_id: "candidate-secret-id",
    candidate: "Svært Hemmelig",
    candidate_phone: "+47 400 00 000",
    time: 540,
    panel: [{ id: "interviewer-1", name: "Ada Intervjuer" }],
    interview_status: "invited",
    booking_source: "manual",
  },
];

describe("distributed plan export disclosure", () => {
  it("keeps candidate identity and contact data out of calendar exports", () => {
    const ics = buildAnonymizedScheduleIcs({
      schedule: privateSchedule,
      dates: ["2026-07-20"],
      sessionDuration: 30,
    });

    expect(ics).to.contain("SUMMARY:Intervju: Kandidat 1");
    expect(ics).not.to.contain("Svært Hemmelig");
    expect(ics).not.to.contain("candidate-secret-id");
    expect(ics).not.to.contain("+47 400 00 000");
  });

  it("includes candidate names in CSV only when disclosure is enabled", () => {
    const entries = [{ item: privateSchedule[0], scheduleIndex: 0 }];
    const hidden = buildVisibleScheduleCsv({
      entries,
      candidateNamesVisible: false,
      formatTimeLabel: () => "Mandag 09:00",
    });
    const visible = buildVisibleScheduleCsv({
      entries,
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
    });

    expect(hidden).to.contain('"Mandag 09:00","—"');
    expect(hidden).not.to.contain("Svært Hemmelig");
    expect(visible).to.contain("Svært Hemmelig");
  });

  it("adds søknadstekst only when the with-text export asks for it", () => {
    const entries = [{ item: privateSchedule[0], scheduleIndex: 0 }];
    const plain = buildVisibleScheduleCsv({
      entries,
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
    });
    const withText = buildVisibleScheduleCsv({
      entries,
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
      applicationTextById: new Map([
        ["candidate-secret-id", "Jeg vil gjerne bli med fordi…"],
      ]),
    });

    // The ordinary export is unchanged - no empty column, no header.
    expect(plain).not.to.contain("Søknadstekst");
    expect(plain).not.to.contain("Jeg vil gjerne bli med");

    expect(withText).to.contain("Søknadstekst");
    expect(withText).to.contain("Jeg vil gjerne bli med fordi…");
  });

  it("leaves the text cell empty for a candidate whose text is missing", () => {
    // A withheld or absent text must not shift the columns underneath it.
    const csv = buildVisibleScheduleCsv({
      entries: [{ item: privateSchedule[0], scheduleIndex: 0 }],
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
      applicationTextById: new Map(),
    });

    expect(csv.trim().split("\n")).to.have.length(2);
    expect(csv).to.contain(',""');
  });

  it("neutralises a søknadstekst that would be read as a formula", () => {
    // The text is written by the applicant, so it reaches Excel as untrusted
    // input: a leading = or + must not execute on open.
    const csv = buildVisibleScheduleCsv({
      entries: [{ item: privateSchedule[0], scheduleIndex: 0 }],
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
      applicationTextById: new Map([
        ["candidate-secret-id", '=HYPERLINK("http://evil","click")'],
      ]),
    });

    expect(csv).to.contain("\"'=HYPERLINK");
  });

  it("omits the internal booking type from the CSV", () => {
    const csv = buildVisibleScheduleCsv({
      entries: [{ item: privateSchedule[0], scheduleIndex: 0 }],
      candidateNamesVisible: true,
      formatTimeLabel: () => "Mandag 09:00",
    });

    expect(csv).not.to.contain("Bookingtype");
    expect(csv).not.to.contain("Manuell");
  });
});
