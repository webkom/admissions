import {
  blockPanelAt,
  eligibleInterviewersFor,
  panelConflictsWithCandidate,
  toggleScheduleDraftLock,
  unassignCandidateFromResult,
} from "../../frontend/src/components/Scheduling/Solver/useScheduleDraft";
import {
  buildRepairSolveRequest,
  buildRepairPreviewOptions,
  buildRepairScenario,
} from "../../frontend/src/components/Scheduling/Solver/repairScenarios";
import {
  solveFailureMessage,
  unplaceableSuggestion,
  UNASSIGNED_REASON,
  type SolveResponse,
} from "../../frontend/src/components/Scheduling/Solver/solverHelpers";
import type { Interviewer, ScheduleItem } from "../../frontend/src/types";

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

  it("preserves every manual lock when a repair is requested", () => {
    const lockedAssignments = [
      {
        candidate_id: "candidate-1",
        candidate: "Kandidat 1",
        time: 480,
        panel: [{ id: "interviewer-1", name: "Ada" }],
      },
    ];

    expect(
      buildRepairSolveRequest(lockedAssignments, "minimum_change"),
    ).to.deep.equal({
      lockedAssignments,
      options: {
        mode: "repair",
        repairStrategy: "minimum_change",
        previewOnly: true,
      },
    });
  });

  it("tells the administrator to unlock explicitly after a locked conflict", () => {
    expect(
      solveFailureMessage({
        status: "LOCKED_CONFLICT",
        schedule: [],
      }),
    )
      .to.contain("Forrige plan er beholdt")
      .and.contain("Lås opp det berørte intervjuet");
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

describe("cancelling an interview from the plan", () => {
  const success = (): SolveResponse => ({
    status: "SUCCESS",
    schedule: [
      scheduleItem({ candidate: "Ola", candidate_id: "c-1", time: 480 }),
      scheduleItem({ candidate: "Kari", candidate_id: "c-2", time: 510 }),
    ],
  });

  it("frees the slot and queues the candidate for placement", () => {
    const next = unassignCandidateFromResult(success(), 0);

    expect(next.schedule.map((item) => item.candidate)).to.deep.equal(["Kari"]);
    expect(next.unplaceable).to.deep.equal([
      {
        candidate_id: "c-1",
        candidate: "Ola",
        reason: UNASSIGNED_REASON,
      },
    ]);
  });

  it("drops the plan to PARTIAL so the queued candidate stays visible", () => {
    // unplaceableCandidates is only read on PARTIAL - a SUCCESS status here
    // would hide the candidate the admin just freed.
    expect(unassignCandidateFromResult(success(), 0).status).to.equal(
      "PARTIAL",
    );
  });

  it("carries a suggestion the admin can act on", () => {
    expect(unplaceableSuggestion(UNASSIGNED_REASON)).to.contain("ledig luke");
  });

  it("leaves the plan alone when the index points at nothing", () => {
    const result = success();

    expect(unassignCandidateFromResult(result, 7)).to.equal(result);
  });

  it("does not queue the same candidate twice", () => {
    const once = unassignCandidateFromResult(success(), 0);
    const twice = unassignCandidateFromResult(
      { ...once, schedule: [...once.schedule, success().schedule[0]] },
      1,
    );

    expect(twice.unplaceable).to.have.length(1);
  });

  it("keeps an unplaceable candidate the solver had already reported", () => {
    const partial: SolveResponse = {
      ...success(),
      status: "PARTIAL",
      unplaceable: [
        {
          candidate_id: "c-9",
          candidate: "Nina",
          reason: "Ingen ledige tidsluker igjen.",
        },
      ],
    };

    expect(
      unassignCandidateFromResult(partial, 0).unplaceable?.map(
        (entry) => entry.candidate,
      ),
    ).to.deep.equal(["Nina", "Ola"]);
  });
});

describe("eligibleInterviewersFor", () => {
  const inv = (id: string, biased: string[] = []): Interviewer => ({
    id,
    name: id,
    availability: [480],
    biased,
    has_submitted: true,
  });

  it("drops interviewers who declared inhabilitet", () => {
    expect(
      eligibleInterviewersFor([inv("i1", ["c-1"]), inv("i2")], "c-1").map(
        (interviewer) => interviewer.id,
      ),
    ).to.deep.equal(["i2"]);
  });

  it("never lets a candidate sit on their own panel", () => {
    // The server rejects a self-interview outright, so a panel built with
    // one turns into a 400 at save time.
    expect(
      eligibleInterviewersFor([inv("u-1"), inv("i2")], "c-1", "u-1").map(
        (interviewer) => interviewer.id,
      ),
    ).to.deep.equal(["i2"]);
  });

  it("keeps everyone when the candidate is not on the committee", () => {
    expect(
      eligibleInterviewersFor([inv("i1"), inv("i2")], "c-1"),
    ).to.have.length(2);
  });
});

describe("joining a block's existing panel", () => {
  const panel = [
    { id: "i1", name: "Ada" },
    { id: "i2", name: "Linus" },
  ];
  const schedule = [
    scheduleItem({ candidate: "Ola", candidate_id: "c-1", time: 480, panel }),
  ];
  // One block covering both slots; 510 is still open.
  const blocks = [[480, 510]];

  it("finds the panel already seated in the slot's block", () => {
    expect(blockPanelAt(schedule, blocks, 510)).to.deep.equal(panel);
  });

  it("returns null for a slot outside every block", () => {
    expect(blockPanelAt(schedule, blocks, 999)).to.equal(null);
  });

  it("returns null while the block has no interview yet", () => {
    expect(blockPanelAt([], blocks, 510)).to.equal(null);
  });

  const inv = (id: string, biased: string[] = []): Interviewer => ({
    id,
    name: id,
    availability: [480, 510],
    biased,
    has_submitted: true,
  });

  it("rejects a block panel holding someone inhabil for the candidate", () => {
    expect(
      panelConflictsWithCandidate(
        panel,
        [inv("i1", ["c-2"]), inv("i2")],
        "c-2",
      ),
    ).to.equal(true);
  });

  it("rejects a block panel that seats the candidate themselves", () => {
    expect(
      panelConflictsWithCandidate(panel, [inv("i1"), inv("i2")], "c-2", "i2"),
    ).to.equal(true);
  });

  it("accepts a block panel with no conflict", () => {
    expect(
      panelConflictsWithCandidate(panel, [inv("i1"), inv("i2")], "c-2"),
    ).to.equal(false);
  });

  it("ignores a seat it cannot identify instead of blocking on it", () => {
    // A legacy row without an id, or a retired member no longer on the
    // roster, must not make an otherwise valid placement impossible.
    expect(
      panelConflictsWithCandidate(
        [{ id: "", name: "Ukjent" }, ...panel],
        [inv("i1"), inv("i2")],
        "c-2",
      ),
    ).to.equal(false);
  });
});
