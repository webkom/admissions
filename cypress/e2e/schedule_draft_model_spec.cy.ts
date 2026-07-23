import { toggleScheduleDraftLock } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraft";
import {
  buildRepairPreviewOptions,
  buildRepairScenario,
} from "../../frontend/src/components/Scheduling/Solver/repairScenarios";
import type { ScheduleItem } from "../../frontend/src/types";

const scheduleItem = (overrides: Partial<ScheduleItem> = {}): ScheduleItem => ({
  candidate: "Kandidat",
  panel: [],
  time: 0,
  ...overrides,
});

describe("schedule draft model", () => {
  it("returns a manual row to solver ownership when it is unlocked", () => {
    expect(
      toggleScheduleDraftLock(
        scheduleItem({ locked: true, booking_source: "manual" }),
      ),
    ).to.include({ locked: false, booking_source: "solver" });
  });

  it("keeps solver ownership when a row is locked", () => {
    expect(
      toggleScheduleDraftLock(
        scheduleItem({ locked: false, booking_source: "solver" }),
      ),
    ).to.include({ locked: true, booking_source: "solver" });
  });

  it("always calculates repair scenarios as previews", () => {
    expect(buildRepairPreviewOptions("minimum_change")).to.deep.equal({
      mode: "repair",
      repairStrategy: "minimum_change",
      previewOnly: true,
    });
  });

  it("marks a partial repair that drops a candidate as unusable", () => {
    const baseline = [
      scheduleItem({
        candidate_id: "candidate-1",
        candidate: "Kandidat 1",
        time: 480,
      }),
      scheduleItem({
        candidate_id: "candidate-2",
        candidate: "Kandidat 2",
        time: 510,
      }),
    ];
    const scenario = buildRepairScenario({
      baselineKey: "baseline",
      strategy: "minimum_change",
      baseline,
      result: {
        status: "PARTIAL",
        schedule: [baseline[0]],
        unplaceable: [
          {
            candidate_id: "candidate-2",
            candidate: "Kandidat 2",
          },
        ],
      },
      blocks: [[480, 510]],
      interviewers: [],
      sessionDuration: 30,
    });

    expect(scenario).to.include({ applicable: false });
    expect(scenario.unplacedCandidates).to.deep.equal(["Kandidat 2"]);
  });

  it("also rejects a nominally successful repair that omits a baseline row", () => {
    const baseline = [
      scheduleItem({
        candidate_id: "candidate-1",
        candidate: "Kandidat 1",
        time: 480,
      }),
      scheduleItem({
        candidate_id: "candidate-2",
        candidate: "Kandidat 2",
        time: 510,
      }),
    ];
    const scenario = buildRepairScenario({
      baselineKey: "baseline",
      strategy: "balanced",
      baseline,
      result: {
        status: "SUCCESS",
        schedule: [baseline[0]],
        unplaceable: [],
      },
      blocks: [[480, 510]],
      interviewers: [],
      sessionDuration: 30,
    });

    expect(scenario).to.include({ applicable: false });
    expect(scenario.unplacedCandidates).to.deep.equal(["Kandidat 2"]);
  });

  it("matches legacy name-only baseline rows to repaired rows with ids", () => {
    const baseline = [
      scheduleItem({
        candidate: "Kandidat 1",
        time: 480,
      }),
    ];
    const scenario = buildRepairScenario({
      baselineKey: "baseline",
      strategy: "balanced",
      baseline,
      result: {
        status: "SUCCESS",
        schedule: [
          scheduleItem({
            candidate_id: "candidate-1",
            candidate: "Kandidat 1",
            time: 510,
          }),
        ],
        unplaceable: [],
      },
      blocks: [[480, 510]],
      interviewers: [],
      sessionDuration: 30,
    });

    expect(scenario).to.include({ applicable: true });
    expect(scenario.unplacedCandidates).to.deep.equal([]);
    expect(scenario.metrics).to.include({
      changedInterviews: 1,
      changedTimes: 1,
    });
  });

  it("does not use a matching name to replace a different candidate id", () => {
    const baseline = [
      scheduleItem({
        candidate_id: "candidate-1",
        candidate: "Samme Navn",
        time: 480,
      }),
    ];
    const scenario = buildRepairScenario({
      baselineKey: "baseline",
      strategy: "balanced",
      baseline,
      result: {
        status: "SUCCESS",
        schedule: [
          scheduleItem({
            candidate_id: "candidate-2",
            candidate: "Samme Navn",
            time: 510,
          }),
        ],
        unplaceable: [],
      },
      blocks: [[480, 510]],
      interviewers: [],
      sessionDuration: 30,
    });

    expect(scenario).to.include({ applicable: false });
    expect(scenario.unplacedCandidates).to.deep.equal(["Samme Navn"]);
  });

  it("rejects an ambiguous legacy name match", () => {
    const baseline = [
      scheduleItem({
        candidate: "Samme Navn",
        time: 480,
      }),
    ];
    const scenario = buildRepairScenario({
      baselineKey: "baseline",
      strategy: "balanced",
      baseline,
      result: {
        status: "SUCCESS",
        schedule: [
          scheduleItem({
            candidate_id: "candidate-1",
            candidate: "Samme Navn",
            time: 510,
          }),
          scheduleItem({
            candidate_id: "candidate-2",
            candidate: "Samme Navn",
            time: 540,
          }),
        ],
        unplaceable: [],
      },
      blocks: [[480, 510, 540]],
      interviewers: [],
      sessionDuration: 30,
    });

    expect(scenario).to.include({ applicable: false });
    expect(scenario.unplacedCandidates).to.deep.equal(["Samme Navn"]);
  });
});
