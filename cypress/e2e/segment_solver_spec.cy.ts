import {
  collectAvailabilityExceptions,
  findRestViolations,
  suggestPanelSubstitution,
} from "../../frontend/src/components/Scheduling/Solver/planHealthFixes";
import { derivePlanDraftWorkflowState } from "../../frontend/src/components/Scheduling/Solver/planDraftWorkflow";
import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SchedulePanelMember,
} from "../../frontend/src/types";

const panel = (...names: string[]): SchedulePanelMember[] =>
  names.map((name) => ({ name, is_overtime: false, id: `id-${name}` }));

const interviewers = (
  definitions: Array<{
    name: string;
    availability?: number[];
    biased?: string[];
  }>,
): Interviewer[] =>
  definitions.map((definition) => ({
    id: `id-${definition.name}`,
    name: definition.name,
    availability: definition.availability ?? [],
    discouraged: [],
    biased: definition.biased ?? [],
    experience_level: "unknown" as const,
    gender: "",
    has_submitted: true,
  }));

const candidates: Candidate[] = [
  { id: "candidate-1", name: "Kandidat 1" },
  { id: "candidate-2", name: "Kandidat 2" },
];

const row = (
  candidateId: string,
  time: number,
  memberNames: string[],
): ScheduleItem => ({
  candidate_id: candidateId,
  candidate: candidateId === "candidate-1" ? "Kandidat 1" : "Kandidat 2",
  time,
  panel: panel(...memberNames),
});

describe("segmented solving status", () => {
  const state = (
    overrides: Partial<Parameters<typeof derivePlanDraftWorkflowState>[0]> = {},
  ) =>
    derivePlanDraftWorkflowState({
      saveState: "saved",
      hasSaveConflict: false,
      saveError: "",
      solverError: "",
      unplaceableCount: 0,
      currentReviewRequired: false,
      currentReviewComplete: true,
      completeReviewerCount: 1,
      requiredReviewerCount: 1,
      pendingReviewerCount: 0,
      missingReviewerNames: [],
      assignmentConflictCount: 0,
      publicationReady: true,
      ...overrides,
    });

  it("reports the filled-day prefix while candidates remain unplaced", () => {
    const extendable = state({
      unplaceableCount: 12,
      filledDayCount: 2,
      extendDayAvailable: true,
    });
    expect(extendable.kind).to.equal("placements_missing");
    expect(extendable.description).to.include("2 hele dager er planlagt");
    expect(extendable.description).to.include(
      "planlegg neste dag for å plassere resten",
    );
  });

  it("switches to manual placement copy when the day scope is exhausted", () => {
    const exhausted = state({
      unplaceableCount: 2,
      filledDayCount: 3,
      extendDayAvailable: false,
    });
    expect(exhausted.kind).to.equal("placements_missing");
    expect(exhausted.description).to.include("plasser de siste manuelt");
    // Without a filled-day count the copy omits the prefix entirely.
    expect(state({ unplaceableCount: 2 }).description).to.not.include(
      "er planlagt",
    );
  });

  it("announces the automatic re-solve while reviews are outstanding", () => {
    const waiting = state({
      completeReviewerCount: 1,
      requiredReviewerCount: 3,
      pendingReviewerCount: 2,
      missingReviewerNames: ["Ada", "Eirik"],
    });
    expect(waiting.kind).to.equal("waiting_for_reviews");
    expect(waiting.description).to.include(
      "Planen lages på nytt automatisk når alle har svart",
    );
  });
});

describe("segmented solving quick fixes", () => {
  it("collects every interview with a member outside availability", () => {
    const entries = [
      { scheduleIndex: 0, item: row("candidate-1", 0, ["Ola", "Ida"]) },
      { scheduleIndex: 1, item: row("candidate-2", 1, ["Per"]) },
    ];
    const exceptions = collectAvailabilityExceptions(entries, (item, member) =>
      item.time === 0 && member.name === "Ida"
        ? true
        : item.time === 1 && member.name === "Per",
    );
    expect(exceptions).to.have.length(2);
    expect(
      exceptions[0].offenders.map((offender) => offender.name),
    ).to.deep.equal(["Ida"]);
    expect(exceptions[1].scheduleIndex).to.equal(1);
  });

  it("suggests the least-loaded available replacement and none when blocked", () => {
    const entries = [
      { scheduleIndex: 0, item: row("candidate-1", 0, ["Ola"]) },
      { scheduleIndex: 1, item: row("candidate-2", 1, ["Ola", "Per"]) },
    ];
    const roster = interviewers([
      { name: "Ola", availability: [0, 1] },
      { name: "Per", availability: [0, 1] },
      { name: "Ida", availability: [0, 1] },
      {
        name: "Bias",
        availability: [0, 1],
        biased: ["candidate-1"],
      },
      { name: "Borte", availability: [1] },
    ]);

    const suggestion = suggestPanelSubstitution({
      item: entries[0].item,
      entries,
      interviewers: roster,
      candidates,
    });
    // Ida is the only interviewer free of other work at time 0 that is
    // available, not biased, and not already on the panel.
    expect(suggestion).to.include({ replacementId: "id-Ida" });

    const blocked = suggestPanelSubstitution({
      item: row("candidate-1", 0, ["Ola"]),
      entries,
      interviewers: interviewers([{ name: "Ola", availability: [0] }]),
      candidates,
    });
    expect(blocked).to.equal(null);
  });

  it("avoids substitutes who already work the adjacent blocks", () => {
    // Blocks are per-day: [0] and [1] are adjacent on day 0.
    const blocks = [[0], [1], [1440]];
    const entries = [
      { scheduleIndex: 0, item: row("candidate-1", 0, ["Ola"]) },
      { scheduleIndex: 1, item: row("candidate-2", 1, ["Ola"]) },
    ];
    const roster = interviewers([
      { name: "Ola", availability: [0, 1] },
      { name: "Per", availability: [0, 1] },
    ]);

    const violations = findRestViolations(entries, blocks);
    expect(violations).to.have.length(1);
    expect(violations[0].offenders[0].name).to.equal("Ola");
    expect(violations[0].blockIndexes).to.deep.equal([0, 1]);

    // Per is free of both blocks, so the suggestion swaps Ola out of the
    // second block; when Per already works block 0 there is nobody left.
    const avoidTimes = new Set([
      ...blocks[violations[0].blockIndexes[0]],
      ...blocks[violations[0].blockIndexes[1]],
    ]);
    const busyEntries = [
      { scheduleIndex: 0, item: row("candidate-1", 0, ["Ola", "Per"]) },
      { scheduleIndex: 1, item: row("candidate-2", 1, ["Ola"]) },
    ];
    const free = suggestPanelSubstitution({
      item: entries[1].item,
      entries,
      interviewers: roster,
      candidates,
      avoidTimes,
    });
    expect(free).to.include({ replacementId: "id-Per" });
    const busy = suggestPanelSubstitution({
      item: busyEntries[1].item,
      entries: busyEntries,
      interviewers: roster,
      candidates,
      avoidTimes,
    });
    expect(busy).to.equal(null);
  });

  it("does not treat the last block of one day and the first of the next as adjacent", () => {
    const blocks = [[0], [1440]];
    const entries = [
      { scheduleIndex: 0, item: row("candidate-1", 0, ["Ola"]) },
      { scheduleIndex: 1, item: row("candidate-2", 1440, ["Ola"]) },
    ];
    expect(findRestViolations(entries, blocks)).to.have.length(0);
  });
});
