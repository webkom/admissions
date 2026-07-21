import {
  buildBlockTimeChunks,
  makeSlotKey,
} from "../../frontend/src/components/Scheduling/scheduleUtils";
import {
  getInclusiveDateRangeDayCount,
  getTotalInterviewSlotCount,
  isDurationPreset,
  isPausePreset,
  parseIntegerInRange,
  PAUSE_PRESETS,
  DURATION_PRESETS,
  shapeDraftSlots,
} from "../../frontend/src/components/Scheduling/Calendar/adminScheduleConfigModel";

describe("admin schedule configuration model", () => {
  it("counts interview-period dates inclusively", () => {
    expect(getInclusiveDateRangeDayCount("2026-07-20", "2026-07-24")).to.equal(
      5,
    );
    expect(getInclusiveDateRangeDayCount("2026-07-20", "2026-07-20")).to.equal(
      1,
    );
    expect(getInclusiveDateRangeDayCount("2026-07-24", "2026-07-20")).to.equal(
      0,
    );
  });

  it("does not expose capacity for an invalid configuration", () => {
    expect(getTotalInterviewSlotCount(false, 21, 28)).to.equal(0);
    expect(getTotalInterviewSlotCount(true, 5, 28)).to.equal(140);
  });

  it("supports an explicit zero-pause preset and validates custom minutes", () => {
    expect(PAUSE_PRESETS).to.include(0);
    expect(isPausePreset(0)).to.equal(true);
    expect(parseIntegerInRange("45", 0, 240)).to.equal(45);
    expect(parseIntegerInRange("", 0, 240)).to.equal(null);
    expect(parseIntegerInRange("1.5", 0, 240)).to.equal(null);
    expect(parseIntegerInRange("241", 0, 240)).to.equal(null);
  });

  it("uses numeric 30 and 60 minute duration presets", () => {
    expect(DURATION_PRESETS).to.deep.equal([30, 60]);
    expect(isDurationPreset(30)).to.equal(true);
    expect(isDurationPreset(60)).to.equal(true);
    expect(isDurationPreset(45)).to.equal(false);
  });

  it("counts the final block without requiring a trailing pause", () => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute: 8 * 60,
      dayEndMinute: 18 * 60,
      sessionDuration: 15,
      chunkSize: 4,
      chunkBreakMinutes: 30,
    });

    expect(chunks).to.have.length(7);
    expect(chunks.flat()).to.have.length(28);
  });

  it("keeps a shorter final block when it still contains interviews", () => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute: 8 * 60,
      dayEndMinute: 10 * 60 + 15,
      sessionDuration: 15,
      chunkSize: 4,
      chunkBreakMinutes: 30,
    });

    expect(chunks).to.have.length(2);
    expect(chunks[1]).to.have.length(3);
  });

  it("carries selected time into blocks shifted by a pause change", () => {
    const date = "2026-07-20";
    const sessionDuration = 20;
    const oldChunks = buildBlockTimeChunks({
      dayStartMinute: 8 * 60,
      dayEndMinute: 18 * 60,
      sessionDuration,
      chunkSize: 4,
      chunkBreakMinutes: 30,
    });
    const shiftedChunks = buildBlockTimeChunks({
      dayStartMinute: 8 * 60,
      dayEndMinute: 18 * 60,
      sessionDuration,
      chunkSize: 4,
      chunkBreakMinutes: 60,
    });
    const selectedSlots = new Set(
      oldChunks[1].map((minute) => makeSlotKey(date, minute)),
    );

    const shapedSlots = shapeDraftSlots(
      [date],
      shiftedChunks,
      selectedSlots,
      sessionDuration,
    );

    expect(
      shiftedChunks[1].every((minute) =>
        shapedSlots.has(makeSlotKey(date, minute)),
      ),
    ).to.equal(true);
  });
});
