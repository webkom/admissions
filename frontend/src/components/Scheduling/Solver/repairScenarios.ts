import type { Interviewer, RepairStrategy, ScheduleItem } from "../types";
import type { SolveResponse } from "./solverHelpers";
import { buildProposalDiff, type ProposalDiffChange } from "./proposalDiff";

export const buildRepairPreviewOptions = (strategy: RepairStrategy) => ({
  mode: "repair" as const,
  repairStrategy: strategy,
  previewOnly: true,
});

export const buildRepairSolveRequest = <T>(
  lockedAssignments: T[],
  strategy: RepairStrategy,
) => ({
  lockedAssignments,
  options: buildRepairPreviewOptions(strategy),
});

export interface RepairScenarioMetrics {
  changedInterviews: number;
  changedTimes: number;
  affectedInterviewers: number;
  brokenPanelBlocks: number;
  overtimeDeltaMinutes: number;
  workloadSpread: number;
}

export interface RepairScenario {
  baselineKey: string;
  strategy: RepairStrategy;
  result: SolveResponse;
  applicable: boolean;
  unplacedCandidates: string[];
  metrics: RepairScenarioMetrics;
  changes: ProposalDiffChange[];
}

const countBrokenPanelBlocks = (
  schedule: ScheduleItem[],
  blocks: number[][],
) => {
  const rowByTime = new Map(schedule.map((item) => [item.time, item]));
  const panelFingerprint = (item: ScheduleItem | undefined) =>
    (item?.panel ?? [])
      .map((member) => (member.id ? `id:${member.id}` : `name:${member.name}`))
      .sort()
      .join("|");
  return blocks.filter((block) => {
    const panels = new Set(
      block
        .map((time) => rowByTime.get(time))
        .filter((item): item is ScheduleItem => Boolean(item))
        .map(panelFingerprint),
    );
    return panels.size > 1;
  }).length;
};

const overtimeMinutes = (schedule: ScheduleItem[], sessionDuration: number) =>
  schedule.reduce(
    (total, item) =>
      total +
      item.panel.filter((member) => member.is_overtime).length *
        sessionDuration,
    0,
  );

const workloadSpread = (
  schedule: ScheduleItem[],
  interviewers: Interviewer[],
) => {
  if (interviewers.length < 2) return 0;
  const loads = new Map(interviewers.map((interviewer) => [interviewer.id, 0]));
  schedule.forEach((item) => {
    item.panel.forEach((member) => {
      if (!member.id || !loads.has(member.id)) return;
      loads.set(member.id, (loads.get(member.id) ?? 0) + 1);
    });
  });
  const values = Array.from(loads.values());
  return Math.max(...values) - Math.min(...values);
};

export const buildRepairScenario = ({
  baselineKey,
  strategy,
  baseline,
  result,
  blocks,
  interviewers,
  sessionDuration,
}: {
  baselineKey: string;
  strategy: RepairStrategy;
  baseline: ScheduleItem[];
  result: SolveResponse;
  blocks: number[][];
  interviewers: Interviewer[];
  sessionDuration: number;
}): RepairScenario => {
  const diff = buildProposalDiff({ baseline, result, interviewers });
  return {
    baselineKey,
    strategy,
    result,
    applicable:
      result.status === "SUCCESS" && diff.unplacedCandidates.length === 0,
    unplacedCandidates: diff.unplacedCandidates,
    changes: diff.changes,
    metrics: {
      changedInterviews: diff.changes.length,
      changedTimes: diff.timeChangedCount,
      affectedInterviewers: diff.affectedInterviewerCount,
      brokenPanelBlocks: countBrokenPanelBlocks(result.schedule, blocks),
      overtimeDeltaMinutes:
        overtimeMinutes(result.schedule, sessionDuration) -
        overtimeMinutes(baseline, sessionDuration),
      workloadSpread: workloadSpread(result.schedule, interviewers),
    },
  };
};
