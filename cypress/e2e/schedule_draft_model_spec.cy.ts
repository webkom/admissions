import { toggleScheduleDraftLock } from "../../frontend/src/components/Scheduling/Solver/useScheduleDraft";
import { buildRepairPreviewOptions } from "../../frontend/src/components/Scheduling/Solver/repairScenarios";
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
});
