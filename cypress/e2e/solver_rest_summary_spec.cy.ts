import { deriveSchedulePresentation } from "../../frontend/src/components/Scheduling/Solver/solverSelectors";
import type { Interviewer, ScheduleItem } from "../../frontend/src/types";

const interviewer = (id: string): Interviewer => ({
  id,
  name: id,
  availability: [],
  biased: [],
  has_submitted: true,
});

const assignment = (
  candidate: string,
  time: number,
  interviewerIds: string[],
): ScheduleItem => ({
  candidate,
  time,
  panel: interviewerIds.map((id) => ({
    id,
    name: id,
    is_overtime: false,
  })),
});

describe("interviewer block-rest presentation", () => {
  const canonicalBlocks = [
    [480, 510],
    [540, 570],
    [600, 630],
    [24 * 60 + 480, 24 * 60 + 510],
  ];

  it("counts each adjacent worked pair and resets across rest and day boundaries", () => {
    const presentation = deriveSchedulePresentation(
      {
        status: "SUCCESS",
        optimal: true,
        schedule: [
          assignment("1", 480, ["Tre på rad", "Hvile mellom"]),
          assignment("2", 510, ["Tre på rad"]),
          assignment("3", 540, ["Tre på rad"]),
          assignment("4", 600, ["Tre på rad", "Hvile mellom", "Ny dag"]),
          assignment("5", 24 * 60 + 480, ["Ny dag"]),
        ],
      },
      [
        interviewer("Tre på rad"),
        interviewer("Hvile mellom"),
        interviewer("Ny dag"),
      ],
      canonicalBlocks,
    );

    const threeBlockRun = presentation.interviewerDistribution.find(
      ({ id }) => id === "Tre på rad",
    );
    const separatedByRest = presentation.interviewerDistribution.find(
      ({ id }) => id === "Hvile mellom",
    );
    const separatedByDay = presentation.interviewerDistribution.find(
      ({ id }) => id === "Ny dag",
    );

    expect(threeBlockRun?.blockCount).to.equal(3);
    expect(threeBlockRun?.adjacentBlockExceptions).to.equal(2);
    expect(
      threeBlockRun?.blockStates.map(({ status }) => status),
    ).to.deep.equal(["work", "work", "work", "rest"]);
    expect(separatedByRest?.adjacentBlockExceptions).to.equal(0);
    expect(separatedByRest?.blockStates[1].status).to.equal("rest");
    expect(separatedByDay?.adjacentBlockExceptions).to.equal(0);
    expect(presentation.blockRestSummary).to.deep.include({
      exceptionCount: 2,
      affectedInterviewerCount: 1,
      honored: false,
      isNonOptimal: false,
    });
  });

  it("treats partial block occupancy as work and exposes non-optimal results", () => {
    const presentation = deriveSchedulePresentation(
      {
        status: "SUCCESS",
        optimal: false,
        schedule: [
          assignment("1", 510, ["Ada"]),
          assignment("2", 570, ["Ada"]),
        ],
      },
      [interviewer("Ada")],
      canonicalBlocks,
    );

    expect(presentation.interviewerDistribution[0].blockCount).to.equal(2);
    expect(
      presentation.interviewerDistribution[0].adjacentBlockExceptions,
    ).to.equal(1);
    expect(presentation.blockRestSummary.isNonOptimal).to.equal(true);
  });

  it("resolves legacy ID-less panel members to one unique roster row", () => {
    const presentation = deriveSchedulePresentation(
      {
        status: "SUCCESS",
        optimal: true,
        schedule: [
          {
            candidate: "1",
            time: 480,
            panel: [{ name: "Ada", is_overtime: false }],
          },
          {
            candidate: "2",
            time: 540,
            panel: [{ name: "Ada", is_overtime: false }],
          },
        ],
      },
      [{ ...interviewer("u1"), name: "Ada" }],
      canonicalBlocks,
    );

    expect(presentation.interviewerDistribution).to.have.length(1);
    expect(presentation.interviewerDistribution[0]).to.deep.include({
      id: "u1",
      count: 2,
      blockCount: 2,
      adjacentBlockExceptions: 1,
    });
    expect(presentation.blockRestSummary).to.deep.include({
      exceptionCount: 1,
      affectedInterviewerCount: 1,
    });
  });
});
