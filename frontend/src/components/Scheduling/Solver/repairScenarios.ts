import type { Interviewer, RepairStrategy, ScheduleItem } from "../types";
import type { SolveResponse } from "./solverHelpers";

export interface RepairScenarioMetrics {
  changedInterviews: number;
  changedTimes: number;
  affectedInterviewers: number;
  brokenPanelBlocks: number;
  overtimeDeltaMinutes: number;
  workloadSpread: number;
}

export interface RepairScenarioChange {
  candidate: string;
  beforeTime?: number;
  afterTime?: number;
  removedInterviewers: string[];
  addedInterviewers: string[];
}

export interface RepairScenario {
  baselineKey: string;
  strategy: RepairStrategy;
  result: SolveResponse;
  metrics: RepairScenarioMetrics;
  changes: RepairScenarioChange[];
}

const candidateKey = (item: ScheduleItem) =>
  item.candidate_id ? `id:${item.candidate_id}` : `name:${item.candidate}`;

const memberKey = (member: ScheduleItem["panel"][number]) =>
  member.id ? `id:${member.id}` : `name:${member.name}`;

const panelKeys = (item: ScheduleItem | undefined) =>
  new Set((item?.panel ?? []).map(memberKey));

const panelFingerprint = (item: ScheduleItem) =>
  Array.from(panelKeys(item)).sort().join("|");

const symmetricDifference = (left: Set<string>, right: Set<string>) =>
  new Set(
    [...left, ...right].filter((value) => left.has(value) !== right.has(value)),
  );

const countBrokenPanelBlocks = (
  schedule: ScheduleItem[],
  blocks: number[][],
) => {
  const rowByTime = new Map(schedule.map((item) => [item.time, item]));
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
  const baselineByCandidate = new Map(
    baseline.map((item) => [candidateKey(item), item]),
  );
  const resultByCandidate = new Map(
    result.schedule.map((item) => [candidateKey(item), item]),
  );
  const interviewerNameByKey = new Map<string, string>(
    interviewers.flatMap((interviewer) => [
      [`id:${interviewer.id}`, interviewer.name] as const,
      [`name:${interviewer.name}`, interviewer.name] as const,
    ]),
  );
  const allCandidateKeys = new Set([
    ...baselineByCandidate.keys(),
    ...resultByCandidate.keys(),
  ]);
  const affectedInterviewerKeys = new Set<string>();
  const changes: RepairScenarioChange[] = [];
  let changedTimes = 0;

  allCandidateKeys.forEach((key) => {
    const before = baselineByCandidate.get(key);
    const after = resultByCandidate.get(key);
    const beforePanel = panelKeys(before);
    const afterPanel = panelKeys(after);
    const panelDifference = symmetricDifference(beforePanel, afterPanel);
    const timeChanged = before?.time !== after?.time;
    if (!timeChanged && panelDifference.size === 0) return;

    if (timeChanged) {
      changedTimes += 1;
      beforePanel.forEach((member) => affectedInterviewerKeys.add(member));
      afterPanel.forEach((member) => affectedInterviewerKeys.add(member));
    } else {
      panelDifference.forEach((member) => affectedInterviewerKeys.add(member));
    }

    const removed = [...beforePanel].filter(
      (member) => !afterPanel.has(member),
    );
    const added = [...afterPanel].filter((member) => !beforePanel.has(member));
    changes.push({
      candidate: after?.candidate ?? before?.candidate ?? "Ukjent kandidat",
      beforeTime: before?.time,
      afterTime: after?.time,
      removedInterviewers: removed.map(
        (member) =>
          interviewerNameByKey.get(member) ?? member.replace(/^name:/, ""),
      ),
      addedInterviewers: added.map(
        (member) =>
          interviewerNameByKey.get(member) ?? member.replace(/^name:/, ""),
      ),
    });
  });

  return {
    baselineKey,
    strategy,
    result,
    changes,
    metrics: {
      changedInterviews: changes.length,
      changedTimes,
      affectedInterviewers: affectedInterviewerKeys.size,
      brokenPanelBlocks: countBrokenPanelBlocks(result.schedule, blocks),
      overtimeDeltaMinutes:
        overtimeMinutes(result.schedule, sessionDuration) -
        overtimeMinutes(baseline, sessionDuration),
      workloadSpread: workloadSpread(result.schedule, interviewers),
    },
  };
};
