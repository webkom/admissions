import {
  buildManualBlocksByDay,
  manualBlocksRequireReset,
} from "../../frontend/src/components/Scheduling/Calendar/adminScheduleConfigModel";

describe("manual schedule block model", () => {
  it("covers every schedule slot with an editable block for each day", () => {
    expect(
      buildManualBlocksByDay({
        dates: ["2026-08-03", "2026-08-04"],
        dayStartMinute: 540,
        dayEndMinute: 630,
        sessionDuration: 30,
      }),
    ).to.deep.equal([
      {
        slots: ["2026-08-03|540", "2026-08-03|570", "2026-08-03|600"],
      },
      {
        slots: ["2026-08-04|540", "2026-08-04|570", "2026-08-04|600"],
      },
    ]);
  });

  it("preserves manual splits when only the standard block pattern changes", () => {
    const coordinates = {
      dates: ["2026-08-03"],
      dayStartMinute: 540,
      dayEndMinute: 630,
      sessionDuration: 30,
    };

    expect(manualBlocksRequireReset(coordinates, coordinates)).to.equal(false);
    expect(
      manualBlocksRequireReset(coordinates, {
        ...coordinates,
        dayEndMinute: 660,
      }),
    ).to.equal(true);
    expect(
      manualBlocksRequireReset(coordinates, {
        ...coordinates,
        sessionDuration: 45,
      }),
    ).to.equal(true);
  });
});
