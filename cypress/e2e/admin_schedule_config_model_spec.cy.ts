import {
  buildBlockTimeChunks,
  buildContinuousTimeSlots,
  makeSlotKey,
} from "../../frontend/src/components/Scheduling/scheduleUtils";
import {
  buildFineTuneTimeSlots,
  buildSchedulePatternRows,
  closeAllScheduleCapacity,
  closeDayScheduleCapacity,
  deriveScheduleDraftSummary,
  deriveSlotOverrides,
  deriveResolvedLayout,
  getScheduleConfigChangeState,
  getInclusiveDateRangeDayCount,
  getTotalInterviewSlotCount,
  isDurationPreset,
  isPausePreset,
  parseIntegerInRange,
  PAUSE_PRESETS,
  openAllStandardBlocks,
  preserveManualDraftSlots,
  DURATION_PRESETS,
  setDayStandardBlocksOpen,
  setStandardBlockOpen,
  shapeDraftSlots,
  rebuildBaseForBlockPattern,
  toggleFineTuneSlot,
} from "../../frontend/src/components/Scheduling/Calendar/adminScheduleConfigModel";

describe("admin schedule configuration model", () => {
  it("matches the Python persistence golden fixtures", () => {
    cy.fixture("schedule-layout-golden.json").then((cases) => {
      for (const fixture of cases) {
        expect(
          deriveResolvedLayout({
            dates: fixture.dates,
            chunks: fixture.chunks,
            enabledSlots: new Set(fixture.enabled_slots),
            slotOverrides: fixture.slot_overrides,
            sessionDuration: fixture.session_duration,
          }),
          fixture.name,
        ).to.deep.equal(fixture.expected);
      }
    });
  });
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

  it("uses the compact numeric duration presets", () => {
    expect(DURATION_PRESETS).to.deep.equal([15, 20, 30]);
    expect(PAUSE_PRESETS).to.deep.equal([0, 30, 60]);
    expect(isDurationPreset(30)).to.equal(true);
    expect(isDurationPreset(45)).to.equal(false);
    expect(isPausePreset(45)).to.equal(false);
    expect(isDurationPreset(60)).to.equal(false);
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

  it("offers standard slots and complete interview slots inside pauses", () => {
    const chunks = buildBlockTimeChunks({
      dayStartMinute: 8 * 60,
      dayEndMinute: 10 * 60,
      sessionDuration: 20,
      chunkSize: 2,
      chunkBreakMinutes: 30,
    });
    expect(buildFineTuneTimeSlots(chunks, 20)).to.deep.equal([
      8 * 60,
      8 * 60 + 20,
      8 * 60 + 40,
      9 * 60 + 10,
      9 * 60 + 30,
    ]);
  });

  it("keeps block rows stable and derives only complete pause slots", () => {
    expect(
      buildSchedulePatternRows(
        [
          [480, 510],
          [540, 570],
        ],
        30,
        2,
      ).map((row) => ({ kind: row.kind, minutes: row.minutes })),
    ).to.deep.equal([
      { kind: "block", minutes: [480, 510] },
      { kind: "block", minutes: [540, 570] },
    ]);

    expect(
      buildSchedulePatternRows(
        [
          [480, 510],
          [600, 630],
        ],
        30,
        2,
      ).map((row) => ({ kind: row.kind, minutes: row.minutes })),
    ).to.deep.equal([
      { kind: "block", minutes: [480, 510] },
      { kind: "pause", minutes: [540, 570] },
      { kind: "block", minutes: [600, 630] },
    ]);

    expect(
      buildSchedulePatternRows(
        [
          [480, 510],
          [590, 620],
        ],
        30,
        2,
      ).map((row) => ({ kind: row.kind, minutes: row.minutes })),
    ).to.deep.equal([
      { kind: "block", minutes: [480, 510] },
      { kind: "pause", minutes: [540] },
      { kind: "block", minutes: [590, 620] },
    ]);
  });

  it("summarizes whole, short, partial and manual deviation states", () => {
    const date = "2026-07-20";
    const enabledSlots = new Set(
      [480, 510, 570, 600, 660, 690].map((minute) => makeSlotKey(date, minute)),
    );

    expect(
      deriveScheduleDraftSummary({
        dates: [date],
        chunks: [
          [480, 510, 540, 570],
          [660, 690],
        ],
        blockSize: 4,
        enabledSlots,
        slotOverrides: [
          { slot: makeSlotKey(date, 540), open: false },
          { slot: makeSlotKey(date, 690), open: true },
          { slot: makeSlotKey(date, 600), open: true },
        ],
      }),
    ).to.deep.equal({
      wholeBlockCount: 0,
      shortBlockCount: 1,
      partialBlockCount: 1,
      openSlotCount: 6,
      closedStandardSlotCount: 1,
      openedStandardSlotCount: 1,
      openedPauseSlotCount: 1,
      manualChangeCount: 3,
    });
  });

  it("applies bulk actions with explicit standard and all-capacity scopes", () => {
    const date = "2026-07-20";
    const chunks = [[480, 510]];
    const pauseExtra = makeSlotKey(date, 540);
    const initial = {
      enabledSlots: new Set([makeSlotKey(date, 480), pauseExtra]),
      slotOverrides: [
        { slot: makeSlotKey(date, 510), open: false },
        { slot: pauseExtra, open: true },
      ],
    };

    const opened = openAllStandardBlocks({ dates: [date], chunks, ...initial });
    expect(opened.enabledSlots).to.deep.equal(
      new Set([makeSlotKey(date, 480), makeSlotKey(date, 510), pauseExtra]),
    );
    expect(opened.slotOverrides).to.deep.equal([
      { slot: pauseExtra, open: true },
    ]);

    const standardClosed = setDayStandardBlocksOpen({
      date,
      chunks,
      open: false,
      ...opened,
    });
    expect(standardClosed.enabledSlots).to.deep.equal(new Set([pauseExtra]));
    expect(standardClosed.slotOverrides).to.deep.equal([
      { slot: pauseExtra, open: true },
    ]);

    expect(closeDayScheduleCapacity({ date, ...standardClosed })).to.deep.equal(
      { enabledSlots: new Set(), slotOverrides: [] },
    );
    expect(closeAllScheduleCapacity()).to.deep.equal({
      enabledSlots: new Set(),
      slotOverrides: [],
    });
  });

  it("rebases whole-block choices and keeps fine-tuning reversible", () => {
    const date = "2026-07-20";
    const minutes = [480, 510, 540, 570];
    const baseline = {
      enabledSlots: new Set(minutes.map((minute) => makeSlotKey(date, minute))),
      slotOverrides: [],
    };
    const partial = toggleFineTuneSlot({
      slot: makeSlotKey(date, 510),
      ...baseline,
    });
    expect(partial.slotOverrides).to.deep.equal([
      { slot: makeSlotKey(date, 510), open: false },
    ]);

    const resetToggle = toggleFineTuneSlot({
      slot: makeSlotKey(date, 510),
      ...partial,
    });
    expect(resetToggle).to.deep.equal(baseline);

    const closed = setStandardBlockOpen({
      date,
      minutes,
      open: false,
      ...partial,
    });
    expect(closed).to.deep.equal({
      enabledSlots: new Set(),
      slotOverrides: [],
    });
  });

  it("preserves individual manual slots when the standard block shape changes", () => {
    const date = "2026-07-20";
    const manualGapSlot = makeSlotKey(date, 9 * 60 + 30);
    const outOfRangeSlot = makeSlotKey(date, 18 * 60);

    expect(
      preserveManualDraftSlots(
        [date],
        buildContinuousTimeSlots({
          dayStartMinute: 8 * 60,
          dayEndMinute: 18 * 60,
          sessionDuration: 30,
        }),
        new Set([manualGapSlot, outOfRangeSlot]),
      ),
    ).to.deep.equal(new Set([manualGapSlot]));
  });

  it("derives durable overrides from one effective draft", () => {
    const date = "2026-07-20";
    const timeSlots = [8 * 60, 8 * 60 + 30, 9 * 60, 9 * 60 + 30];
    const enabledSlots = new Set([
      makeSlotKey(date, 8 * 60),
      makeSlotKey(date, 8 * 60 + 30),
      makeSlotKey(date, 9 * 60 + 30),
    ]);

    const baseSlots = new Set(
      timeSlots.map((minute) => makeSlotKey(date, minute)),
    );
    expect(deriveSlotOverrides(enabledSlots, baseSlots)).to.deep.equal([
      { slot: makeSlotKey(date, 9 * 60), open: false },
    ]);
  });

  it("selects a rebuilt chunk only when every time was in the old base", () => {
    const date = "2026-07-20";
    expect(
      rebuildBaseForBlockPattern(
        [date],
        [
          [480, 510],
          [540, 570],
        ],
        new Set([
          makeSlotKey(date, 480),
          makeSlotKey(date, 510),
          makeSlotKey(date, 540),
        ]),
      ),
    ).to.deep.equal(new Set([makeSlotKey(date, 480), makeSlotKey(date, 510)]));
  });

  it("marks block settings as a structural change", () => {
    const baseline = {
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      dayStartMinute: 480,
      dayEndMinute: 600,
      chunkSize: 3,
      chunkBreakMinutes: 30,
      slotOverrides: [],
      enabledWindows: [],
      sessionDuration: 30,
    };

    expect(
      getScheduleConfigChangeState({
        baseline,
        startDate: baseline.startDate,
        endDate: baseline.endDate,
        startMinute: baseline.dayStartMinute,
        endMinute: baseline.dayEndMinute,
        sessionDuration: baseline.sessionDuration,
        chunkSize: 4,
        chunkBreakMinutes: 60,
        slotOverrides: [],
        enabledWindows: [],
        hasInvalidNumericInput: false,
      }),
    ).to.include({
      hasPendingChanges: true,
      gridDefiningChange: false,
      blockStructureChange: true,
      proposalInvalidatingChange: true,
    });
  });

  it("distinguishes proposal-invalidating edits from pure additions", () => {
    const baseline = {
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      dayStartMinute: 480,
      dayEndMinute: 600,
      chunkSize: 3,
      chunkBreakMinutes: 30,
      slotOverrides: [],
      enabledWindows: [
        { date: "2026-07-20", start_minute: 480, end_minute: 540 },
      ],
      sessionDuration: 30,
    };
    const changeState = (overrides: {
      startDate?: string;
      enabledWindows?: typeof baseline.enabledWindows;
    }) =>
      getScheduleConfigChangeState({
        baseline,
        startDate: overrides.startDate ?? baseline.startDate,
        endDate: baseline.endDate,
        startMinute: baseline.dayStartMinute,
        endMinute: baseline.dayEndMinute,
        sessionDuration: baseline.sessionDuration,
        chunkSize: baseline.chunkSize,
        chunkBreakMinutes: baseline.chunkBreakMinutes,
        slotOverrides: [],
        enabledWindows: overrides.enabledWindows ?? baseline.enabledWindows,
        hasInvalidNumericInput: false,
      });

    expect(changeState({ startDate: "2026-07-21" })).to.include({
      proposalInvalidatingChange: true,
    });
    expect(changeState({ enabledWindows: [] })).to.include({
      availabilityRemoval: true,
      proposalInvalidatingChange: true,
    });
    expect(
      changeState({
        enabledWindows: [
          ...baseline.enabledWindows,
          { date: "2026-07-20", start_minute: 570, end_minute: 600 },
        ],
      }),
    ).to.include({
      availabilityAddition: true,
      availabilityRemoval: false,
      proposalInvalidatingChange: false,
    });
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
