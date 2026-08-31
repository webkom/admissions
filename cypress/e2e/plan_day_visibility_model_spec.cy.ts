import {
  countUnplannedDays,
  visibleBlocks,
} from "../../frontend/src/components/Scheduling/Solver/DraftBlockCardTable";

/** Only the two fields the day filters read. */
const block = (dayIndex: number, interviewCount: number) => ({
  dayIndex,
  entries: Array.from({ length: interviewCount }, () => ({})) as never[],
});

// Day 0 is fully planned, day 1 is half planned (one filled block, one empty),
// day 2 has nothing at all.
const blocks = [
  block(0, 3),
  block(1, 2),
  block(1, 0),
  block(2, 0),
  block(2, 0),
];

describe("which days the plan table shows", () => {
  it("shows every block in the framework by default", () => {
    // Including wholly empty ones - that is the point of the change: an
    // unplanned day was previously invisible, so there was nothing to click.
    expect(visibleBlocks(blocks, null, false)).to.have.length(5);
  });

  it("narrows to one day when a day filter is set", () => {
    expect(visibleBlocks(blocks, 1, false)).to.have.length(2);
  });

  it("hides only days with nothing planned when the toggle is on", () => {
    const shown = visibleBlocks(blocks, null, true);

    expect(shown).to.have.length(3);
    expect(shown.map((entry) => entry.dayIndex)).to.deep.equal([0, 1, 1]);
  });

  it("keeps an empty block on a day that has interviews", () => {
    // Those are the slots you would fill next, so hiding them would defeat
    // the toggle's purpose on exactly the day you are working on.
    const shown = visibleBlocks(blocks, null, true);

    expect(shown.filter((entry) => entry.entries.length === 0)).to.have.length(
      1,
    );
  });

  it("applies the day filter and the toggle independently", () => {
    expect(visibleBlocks(blocks, 2, true)).to.have.length(0);
    expect(visibleBlocks(blocks, 2, false)).to.have.length(2);
  });

  it("counts an unplanned day once however many blocks it has", () => {
    expect(countUnplannedDays(blocks)).to.equal(1);
  });

  it("counts nothing when every day has an interview", () => {
    expect(countUnplannedDays([block(0, 1), block(1, 1)])).to.equal(0);
  });

  it("counts every day when the plan is empty", () => {
    expect(countUnplannedDays([block(0, 0), block(1, 0)])).to.equal(2);
  });
});
