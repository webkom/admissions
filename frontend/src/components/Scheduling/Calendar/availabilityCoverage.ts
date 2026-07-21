import type { Interviewer } from "../types";
import { decodeScheduleTime, makeSlotKey } from "../scheduleUtils";

export type CoverageStatus = "closed" | "empty" | "partial" | "complete";

export interface SlotCoverage {
  minute: number;
  availableCount: number;
}

export interface BlockCoverage {
  date: string;
  chunkIndex: number;
  minutes: number[];
  enabledMinutes: number[];
  slotCoverage: SlotCoverage[];
  availableCount: number;
  status: CoverageStatus;
}

export interface AvailabilityCoverageModel {
  blocks: BlockCoverage[];
  completeBlockCount: number;
  openBlockCount: number;
  completeSlotCount: number;
  openSlotCount: number;
}

interface BuildAvailabilityCoverageParams {
  interviewers: Interviewer[];
  availableSlots: ReadonlySet<string>;
  dates: string[];
  chunks: number[][];
  sessionDuration: number;
  panelSize: number;
  samePanelPerBlock: boolean;
}

const intersect = (sets: ReadonlySet<string>[]) => {
  const [first, ...rest] = sets;
  if (!first) return new Set<string>();
  return new Set(
    Array.from(first).filter((interviewerId) =>
      rest.every((set) => set.has(interviewerId)),
    ),
  );
};

export const buildAvailabilityCoverage = ({
  interviewers,
  availableSlots,
  dates,
  chunks,
  sessionDuration,
  panelSize,
  samePanelPerBlock,
}: BuildAvailabilityCoverageParams): AvailabilityCoverageModel => {
  const interviewerIdsBySlot = new Map<string, Set<string>>();

  interviewers.forEach((interviewer) => {
    new Set(interviewer.availability).forEach((time) => {
      const { dayIndex, minute } = decodeScheduleTime(time, sessionDuration);
      const date = dates[dayIndex];
      if (!date) return;
      const key = makeSlotKey(date, minute);
      const interviewerIds = interviewerIdsBySlot.get(key) ?? new Set<string>();
      interviewerIds.add(interviewer.id);
      interviewerIdsBySlot.set(key, interviewerIds);
    });
  });

  const blocks = dates.flatMap((date) =>
    chunks.map<BlockCoverage>((minutes, chunkIndex) => {
      const enabledMinutes = minutes.filter((minute) =>
        availableSlots.has(makeSlotKey(date, minute)),
      );
      const interviewerSets = enabledMinutes.map(
        (minute) =>
          interviewerIdsBySlot.get(makeSlotKey(date, minute)) ??
          new Set<string>(),
      );
      const slotCoverage = enabledMinutes.map((minute, index) => ({
        minute,
        availableCount: interviewerSets[index].size,
      }));
      const availableCount =
        interviewerSets.length === 0
          ? 0
          : samePanelPerBlock
            ? intersect(interviewerSets).size
            : Math.min(...interviewerSets.map((set) => set.size));
      const status: CoverageStatus =
        enabledMinutes.length === 0
          ? "closed"
          : availableCount >= panelSize
            ? "complete"
            : availableCount > 0
              ? "partial"
              : "empty";

      return {
        date,
        chunkIndex,
        minutes,
        enabledMinutes,
        slotCoverage,
        availableCount,
        status,
      };
    }),
  );

  const openBlocks = blocks.filter((block) => block.status !== "closed");
  const openSlotCount = blocks.reduce(
    (total, block) => total + block.enabledMinutes.length,
    0,
  );
  const completeSlotCount = blocks.reduce(
    (total, block) =>
      total +
      block.slotCoverage.filter((slot) => slot.availableCount >= panelSize)
        .length,
    0,
  );

  return {
    blocks,
    completeBlockCount: openBlocks.filter(
      (block) => block.status === "complete",
    ).length,
    openBlockCount: openBlocks.length,
    completeSlotCount,
    openSlotCount,
  };
};
