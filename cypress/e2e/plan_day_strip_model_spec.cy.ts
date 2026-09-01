import { derivePlanDayStrip } from "../../frontend/src/components/Scheduling/Solver/planDayStripModel";

// Five framework days. Friday has no open slots, so nothing can be planned
// there - it is in the period but not plannable.
const DATES = [
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
  "2026-09-11",
];
const PLANNABLE = DATES.slice(0, 4);

const strip = (
  overrides: Partial<Parameters<typeof derivePlanDayStrip>[0]> = {},
) =>
  derivePlanDayStrip({
    dates: DATES,
    plannableDates: PLANNABLE,
    filledDates: new Set<string>(),
    distributedThrough: null,
    canPlan: true,
    canPublish: true,
    ...overrides,
  });

const states = (model: ReturnType<typeof derivePlanDayStrip>) =>
  model.cells.map((cell) => cell.state);

describe("the plan day strip", () => {
  it("draws an untouched period as all-unplanned, with closed days apart", () => {
    const model = strip();

    expect(states(model)).to.deep.equal([
      "unplanned",
      "unplanned",
      "unplanned",
      "unplanned",
      "closed",
    ]);
    expect(model.publishedThroughIndex).to.equal(-1);
    expect(model.plannedThroughIndex).to.equal(-1);
  });

  it("separates published, planned and still-open days", () => {
    const model = strip({
      filledDates: new Set(DATES.slice(0, 3)),
      distributedThrough: "2026-09-08",
    });

    expect(states(model)).to.deep.equal([
      "published",
      "published",
      "planned",
      "unplanned",
      "closed",
    ]);
    expect(model.publishedCount).to.equal(2);
    // One planned day the committee has not been shown yet.
    expect(model.publishableCount).to.equal(1);
  });

  it("offers publishing only over days that already hold interviews", () => {
    const model = strip({ filledDates: new Set(DATES.slice(0, 2)) });
    const publishable = model.cells
      .filter((cell) => cell.canPublishThrough)
      .map((cell) => cell.date);

    // Releasing an empty day tells the committee nothing and spends a
    // boundary that can never be moved back.
    expect(publishable).to.deep.equal(DATES.slice(0, 2));
  });

  it("never offers to publish or plan a day that is already published", () => {
    const model = strip({
      filledDates: new Set(DATES.slice(0, 3)),
      distributedThrough: "2026-09-09",
    });

    model.cells
      .filter((cell) => cell.state === "published")
      .forEach((cell) => {
        expect(cell.canPublishThrough, cell.date).to.equal(false);
        expect(cell.canPlanThrough, cell.date).to.equal(false);
      });
  });

  it("offers planning into open days but never into a closed one", () => {
    const model = strip({ filledDates: new Set([DATES[0]]) });
    const plannable = model.cells
      .filter((cell) => cell.canPlanThrough)
      .map((cell) => cell.date);

    expect(plannable).to.deep.equal(PLANNABLE);
  });

  it("hands out no actions to a viewer who may not manage the schedule", () => {
    // A member must not be able to infer how much is still unpublished.
    const model = strip({
      canPlan: false,
      canPublish: false,
      filledDates: new Set(DATES.slice(0, 3)),
      distributedThrough: "2026-09-08",
    });

    expect(model.cells.some((cell) => cell.canPlanThrough)).to.equal(false);
    expect(model.cells.some((cell) => cell.canPublishThrough)).to.equal(false);
  });

  it("reports nothing publishable once the plan is fully released", () => {
    const model = strip({
      filledDates: new Set(DATES.slice(0, 3)),
      distributedThrough: "2026-09-11",
    });

    expect(model.publishableCount).to.equal(0);
    expect(model.cells.every((cell) => cell.state === "published")).to.equal(
      true,
    );
  });

  it("keeps a previewed boundary revisable rather than settled", () => {
    // In the publish gate the chosen date is a proposal, not a commitment:
    // treating it as published would make it impossible to pick an earlier
    // day without leaving the screen.
    const model = strip({
      filledDates: new Set(DATES.slice(0, 3)),
      previewThrough: "2026-09-08",
    });

    expect(model.previewThroughIndex).to.equal(1);
    expect(model.publishedThroughIndex).to.equal(-1);
    expect(model.cells[0].state).to.equal("planned");
    expect(model.cells[0].canPublishThrough).to.equal(true);
  });

  it("still refuses to publish an empty day inside a preview", () => {
    const model = strip({
      filledDates: new Set([DATES[0]]),
      previewThrough: "2026-09-10",
    });

    expect(
      model.cells.filter((cell) => cell.canPublishThrough).map((c) => c.date),
    ).to.deep.equal([DATES[0]]);
  });

  it("exposes the last framework day, for clamping a padded publish boundary", () => {
    // A full publish stores distributed_through one day past the last
    // scheduled interview (see the field's own docstring), so every framework
    // day counts as published even when nothing was placed on the very last
    // one. `lastDate` is how a caller displaying the boundary as a calendar
    // date avoids showing that padding literally - e.g. Saturday for a plan
    // that only ever ran Monday through Friday.
    const model = strip({
      filledDates: new Set(DATES),
      distributedThrough: "2026-09-12", // one day past DATES[4] (2026-09-11)
    });

    expect(model.lastDate).to.equal("2026-09-11");
    expect(model.publishedCount).to.equal(5);
  });

  it("survives a period with no days at all", () => {
    const model = derivePlanDayStrip({
      dates: [],
      plannableDates: [],
      filledDates: new Set<string>(),
      distributedThrough: null,
    });

    expect(model.cells).to.have.length(0);
    expect(model.publishableCount).to.equal(0);
    expect(model.lastDate).to.equal(null);
  });
});
