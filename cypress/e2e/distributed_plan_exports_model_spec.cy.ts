import {
  buildAnonymizedScheduleIcs,
  buildVisibleScheduleCsv,
} from "../../frontend/src/routes/SchedulePage/distributedPlanExports";
import { createDistributedPlanLookups } from "../../frontend/src/routes/SchedulePage/distributedPlanSelectors";
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

  it("keeps calendar UIDs stable when the plan is reordered or rescheduled", () => {
    const secondCandidate: ScheduleItem = {
      ...privateSchedule[0],
      candidate_id: "candidate-second-id",
      candidate: "Også Hemmelig",
      time: 600,
    };
    const initial = buildAnonymizedScheduleIcs({
      schedule: [privateSchedule[0], secondCandidate],
      dates: ["2026-07-20"],
      sessionDuration: 30,
    });
    const movedAndReordered = buildAnonymizedScheduleIcs({
      schedule: [
        { ...secondCandidate, time: 660 },
        { ...privateSchedule[0], time: 720 },
      ],
      dates: ["2026-07-20"],
      sessionDuration: 30,
    });
    const uids = (ics: string) =>
      ics
        .split("\r\n")
        .filter((line) => line.startsWith("UID:"))
        .sort();

    expect(uids(movedAndReordered)).to.deep.equal(uids(initial));
    expect(movedAndReordered).not.to.contain("candidate-second-id");
  });

  it("keeps redacted calendar UIDs unique and stable without exposing identity", () => {
    const hiddenSchedule: ScheduleItem[] = [
      {
        export_uid:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        candidate: "Skjult kandidat",
        candidate_visible: false,
        time: 540,
        panel: [{ id: "interviewer-1", name: "Ada Intervjuer" }],
      },
      {
        export_uid:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        candidate: "Skjult kandidat",
        candidate_visible: false,
        time: 600,
        panel: [{ id: "interviewer-1", name: "Ada Intervjuer" }],
      },
    ];
    const initial = buildAnonymizedScheduleIcs({
      schedule: hiddenSchedule,
      dates: ["2026-07-20"],
      sessionDuration: 30,
    });
    const movedAndReordered = buildAnonymizedScheduleIcs({
      schedule: [
        { ...hiddenSchedule[1], time: 660 },
        { ...hiddenSchedule[0], time: 720 },
      ],
      dates: ["2026-07-20"],
      sessionDuration: 30,
    });
    const uids = (ics: string) =>
      ics
        .split("\r\n")
        .filter((line) => line.startsWith("UID:"))
        .sort();

    expect(new Set(uids(initial)).size).to.equal(2);
    expect(uids(movedAndReordered)).to.deep.equal(uids(initial));
    expect(initial).not.to.contain("Skjult kandidat");
  });

  it("does not resolve a redacted candidate through its placeholder name", () => {
    const lookups = createDistributedPlanLookups(
      [{ id: "candidate-secret-id", name: "Skjult kandidat" }],
      [],
      "Intervjuer",
    );

    expect(
      lookups.candidateIdFor({
        candidate: "Skjult kandidat",
        candidate_visible: false,
        time: 540,
        panel: [],
      }),
    ).to.equal(undefined);
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

    expect(hidden).to.contain('"Mandag 09:00","Skjult"');
    expect(hidden).not.to.contain("Svært Hemmelig");
    expect(visible).to.contain("Svært Hemmelig");
  });
});
