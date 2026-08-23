import { CHUNK_SIZE_LIMITS } from "../../frontend/src/components/Scheduling/Calendar/adminScheduleConfigModel";
import { buildStandardBlockPreviewLayout } from "../../frontend/src/components/Scheduling/Calendar/standardBlockPreviewModel";

describe("standard block preview model", () => {
  it("calculates block, interview, pause, and next-block boundaries", () => {
    const layout = buildStandardBlockPreviewLayout({
      startMinute: 8 * 60,
      interviewDuration: 60,
      interviewCount: 4,
      pauseMinutes: 30,
    });

    expect(layout.blockEndMinute).to.equal(12 * 60);
    expect(layout.nextBlockStartMinute).to.equal(12 * 60 + 30);
    expect(layout.totalPatternDuration).to.equal(270);
    expect(
      layout.interviews.map(({ startMinute, endMinute }) => [
        startMinute,
        endMinute,
      ]),
    ).to.deep.equal([
      [480, 540],
      [540, 600],
      [600, 660],
      [660, 720],
    ]);
  });

  it("supports custom duration and custom pause proportions", () => {
    const layout = buildStandardBlockPreviewLayout({
      startMinute: 8 * 60,
      interviewDuration: 45,
      interviewCount: 4,
      pauseMinutes: 15,
    });

    expect(layout.blockDuration).to.equal(180);
    expect(layout.blockEndMinute).to.equal(11 * 60);
    expect(layout.nextBlockStartMinute).to.equal(11 * 60 + 15);
    expect(layout.pauseMinutes / layout.interviewDuration).to.equal(1 / 3);
  });

  it("omits pause duration without changing the repeated-block boundary", () => {
    const layout = buildStandardBlockPreviewLayout({
      startMinute: 8 * 60,
      interviewDuration: 30,
      interviewCount: 4,
      pauseMinutes: 0,
    });

    expect(layout.blockEndMinute).to.equal(10 * 60);
    expect(layout.nextBlockStartMinute).to.equal(layout.blockEndMinute);
    expect(layout.accessibleDescription).to.contain(
      "Det er ingen pause mellom blokkene",
    );
  });

  [CHUNK_SIZE_LIMITS.min, CHUNK_SIZE_LIMITS.max].forEach((interviewCount) => {
    it(`supports ${interviewCount} interviews per block`, () => {
      const layout = buildStandardBlockPreviewLayout({
        startMinute: 8 * 60,
        interviewDuration: 15,
        interviewCount,
        pauseMinutes: 30,
      });

      expect(layout.interviews).to.have.length(interviewCount);
      expect(layout.interviews[0].id).to.equal("interview-1");
      expect(layout.interviews[layout.interviews.length - 1]?.id).to.equal(
        `interview-${interviewCount}`,
      );
      expect(layout.blockEndMinute).to.equal(8 * 60 + interviewCount * 15);
    });
  });

  it("generates the complete accessible description", () => {
    const layout = buildStandardBlockPreviewLayout({
      startMinute: 8 * 60,
      interviewDuration: 60,
      interviewCount: 4,
      pauseMinutes: 30,
    });

    expect(layout.accessibleDescription)
      .to.contain("Intervjublokk fra 08:00 til 12:00")
      .and.contain("intervju 1 går fra 08:00 til 09:00")
      .and.contain("intervju 4 går fra 11:00 til 12:00")
      .and.contain("pause på 30 minutter")
      .and.contain("Neste blokk starter 12:30");
  });
});
