import { deriveDayScopeBounds } from "../../frontend/src/components/Scheduling/Solver/solverSelectors";
import { encodeScheduleTime } from "../../frontend/src/components/Scheduling/scheduleUtils";
import type { ScheduleItem } from "../../frontend/src/types";

// Five framework days; every one has open slots.
const SCHEDULE_DATES = [
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
  "2026-09-10",
];

const row = (dayIndex: number): ScheduleItem => ({
  candidate: `c-${dayIndex}`,
  candidate_id: `c-${dayIndex}`,
  time: encodeScheduleTime(dayIndex, 8 * 60, 30),
  panel: [],
});

const bounds = (overrides: {
  schedule?: ScheduleItem[];
  plannableDates?: string[];
  distributedThrough?: string | null;
}) =>
  deriveDayScopeBounds({
    schedule: overrides.schedule ?? [],
    scheduleDates: SCHEDULE_DATES,
    plannableDates: overrides.plannableDates ?? SCHEDULE_DATES,
    distributedThrough: overrides.distributedThrough ?? null,
    sessionDuration: 30,
  });

describe("day scope bounds model", () => {
  it("lets a fresh plan scope down to a single day", () => {
    expect(bounds({}).minDayCount).to.equal(1);
    expect(bounds({}).draftDayExtent).to.equal(0);
  });

  it("keeps an unpublished multi-day draft fully rescopable", () => {
    // The regression: a draft covering days 1-4 used to pin the floor at 4,
    // so staged planning became impossible the moment a draft existed.
    const result = bounds({ schedule: [row(0), row(1), row(2), row(3)] });
    expect(result.minDayCount).to.equal(1);
    expect(result.draftDayExtent).to.equal(4);
  });

  it("floors the scope at the published prefix", () => {
    expect(bounds({ distributedThrough: "2026-09-07" }).minDayCount).to.equal(
      2,
    );
    expect(bounds({ distributedThrough: "2026-09-10" }).minDayCount).to.equal(
      5,
    );
  });

  it("lets the published floor exceed the current draft extent", () => {
    // Published through day 3, but interviews only exist on days 1-2: the
    // floor still covers every published day so a re-solve cannot drop them.
    const result = bounds({
      schedule: [row(0), row(1)],
      distributedThrough: "2026-09-08",
    });
    expect(result.minDayCount).to.equal(3);
    expect(result.draftDayExtent).to.equal(2);
  });

  it("clamps a boundary past the last plannable day", () => {
    expect(bounds({ distributedThrough: "2027-01-01" }).minDayCount).to.equal(
      5,
    );
  });

  it("counts only plannable days inside the published range", () => {
    // Day 2 (2026-09-07) has no open slots, so publishing through it still
    // only locks the one plannable day before it.
    const plannableDates = ["2026-09-06", "2026-09-08", "2026-09-09"];
    expect(
      bounds({ plannableDates, distributedThrough: "2026-09-07" }).minDayCount,
    ).to.equal(1);
    expect(
      bounds({ plannableDates, distributedThrough: "2026-09-08" }).minDayCount,
    ).to.equal(2);
  });

  it("ignores draft rows that fall outside the plannable days", () => {
    const plannableDates = ["2026-09-06", "2026-09-07"];
    // A leftover row on day 4 (framework shrank under the draft) must not
    // push the extent past the two days the solver can actually plan; the
    // day-1 row still counts.
    const result = bounds({ schedule: [row(0), row(3)], plannableDates });
    expect(result.draftDayExtent).to.equal(1);
  });

  it("never returns a floor below one", () => {
    expect(bounds({ distributedThrough: "1999-01-01" }).minDayCount).to.equal(
      1,
    );
  });
});
