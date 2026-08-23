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
});
