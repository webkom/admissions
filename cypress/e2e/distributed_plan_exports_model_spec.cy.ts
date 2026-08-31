import {
  buildAnonymizedScheduleIcs,
  buildVisibleScheduleCsv,
  type ScheduleCsvFields,
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

const fields = (
  overrides: Partial<ScheduleCsvFields> = {},
): ScheduleCsvFields => ({
  showNames: true,
  panel: true,
  status: true,
  applicationText: false,
  ...overrides,
});

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

  it("includes candidate names in CSV only when the name column is picked", () => {
    const entries = [{ item: privateSchedule[0], scheduleIndex: 0 }];
    const hidden = buildVisibleScheduleCsv({
      entries,
      fields: fields({ showNames: false }),
      formatTimeLabel: () => "Mandag 09:00",
    });
    const visible = buildVisibleScheduleCsv({
      entries,
      fields: fields({ showNames: true }),
      formatTimeLabel: () => "Mandag 09:00",
    });

    expect(hidden).to.contain('"Mandag 09:00","Kandidat 1"');
    expect(hidden).not.to.contain("Svært Hemmelig");
    expect(visible).to.contain("Svært Hemmelig");
  });

  it("gives one anonymised label per person, not per row", () => {
    const twice = [
      { item: privateSchedule[0], scheduleIndex: 0 },
      {
        item: { ...privateSchedule[0], time: 600 },
        scheduleIndex: 1,
      },
    ];

    const csv = buildVisibleScheduleCsv({
      entries: twice,
      fields: fields({ showNames: false }),
      formatTimeLabel: (time) => `Mandag ${time}`,
    });

    // The same candidate on two rows is one "Kandidat 1" both times - a
    // per-row counter would invent a second person in the scrubbed plan.
    expect(csv).to.contain('"Mandag 540","Kandidat 1"');
    expect(csv).to.contain('"Mandag 600","Kandidat 1"');
    expect(csv).not.to.contain("Kandidat 2");
  });

  it("drops the panel and status columns when they are not picked", () => {
    const csv = buildVisibleScheduleCsv({
      entries: [{ item: privateSchedule[0], scheduleIndex: 0 }],
      fields: fields({ panel: false, status: false }),
      formatTimeLabel: () => "Mandag 09:00",
    });

    expect(csv.split("\n")[0]).to.equal('"Tidspunkt","Kandidat"');
    expect(csv).not.to.contain("Ada Intervjuer");
  });

  it("adds søknadstekst only when the column is picked and a map is supplied", () => {
    const entries = [{ item: privateSchedule[0], scheduleIndex: 0 }];
    const plain = buildVisibleScheduleCsv({
      entries,
      fields: fields(),
      formatTimeLabel: () => "Mandag 09:00",
    });
    const withText = buildVisibleScheduleCsv({
      entries,
      fields: fields({ applicationText: true }),
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
      fields: fields({ applicationText: true }),
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
      fields: fields({ applicationText: true }),
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
      fields: fields(),
      formatTimeLabel: () => "Mandag 09:00",
    });

    expect(csv).not.to.contain("Bookingtype");
    expect(csv).not.to.contain("Manuell");
  });
});
