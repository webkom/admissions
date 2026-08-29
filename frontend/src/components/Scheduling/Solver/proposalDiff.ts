import type { Interviewer, ScheduleItem } from "../types";
import type { SolveResponse } from "./solverHelpers";

/** How one candidate's interview changed between two schedule versions. */
export type ProposalDiffChangeKind = "moved" | "panel" | "added" | "removed";

export interface ProposalDiffChange {
  kind: ProposalDiffChangeKind;
  candidate: string;
  beforeTime?: number;
  afterTime?: number;
  removedInterviewers: string[];
  addedInterviewers: string[];
}

export interface ProposalDiffSummary {
  changes: ProposalDiffChange[];
  movedCount: number;
  panelChangedCount: number;
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  /** Every row whose time differs between the versions — moved rows plus
   *  placements gained or lost, matching the repair metrics' definition. */
  timeChangedCount: number;
  affectedInterviewerCount: number;
  /** Candidates with a placement in neither, either, or both versions that
   *  the solver could not place in the new result. */
  unplacedCandidates: string[];
}

const candidateKey = (item: ScheduleItem) =>
  item.candidate_id ? `id:${item.candidate_id}` : `name:${item.candidate}`;

const memberKey = (member: ScheduleItem["panel"][number]) =>
  member.id ? `id:${member.id}` : `name:${member.name}`;

const panelKeys = (item: ScheduleItem | undefined) =>
  new Set((item?.panel ?? []).map(memberKey));

const symmetricDifference = (left: Set<string>, right: Set<string>) =>
  new Set(
    [...left, ...right].filter((value) => left.has(value) !== right.has(value)),
  );

/**
 * Diff a solve result against the schedule it proposes to replace.
 *
 * Rows are paired by candidate id (with a name fallback for legacy rows
 * saved before ids existed), so a "change" is always about the same person:
 * a moved interview, a reshuffled panel, a placement gained, or one lost.
 * Unchanged placements are counted, not listed — the point of the diff is
 * that reviewing a re-solve means reviewing what changed, not the whole
 * plan again.
 */
export const buildProposalDiff = ({
  baseline,
  result,
  interviewers,
}: {
  baseline: ScheduleItem[];
  result: SolveResponse;
  interviewers: Interviewer[];
}): ProposalDiffSummary => {
  const interviewerNameByKey = new Map<string, string>(
    interviewers.flatMap((interviewer) => [
      [`id:${interviewer.id}`, interviewer.name] as const,
      [`name:${interviewer.name}`, interviewer.name] as const,
    ]),
  );
  const memberName = (member: string) =>
    interviewerNameByKey.get(member) ?? member.replace(/^name:/, "");

  const matchedResultIndexByBaselineIndex = new Map<number, number>();
  const usedResultIndexes = new Set<number>();

  baseline.forEach((item, baselineIndex) => {
    if (!item.candidate_id) return;
    const matchingIndexes = result.schedule.flatMap((candidate, resultIndex) =>
      candidate.candidate_id === item.candidate_id ? [resultIndex] : [],
    );
    if (matchingIndexes.length !== 1) return;
    matchedResultIndexByBaselineIndex.set(baselineIndex, matchingIndexes[0]);
    usedResultIndexes.add(matchingIndexes[0]);
  });

  const legacyBaselineIndexesByName = new Map<string, number[]>();
  baseline.forEach((item, baselineIndex) => {
    if (item.candidate_id) return;
    const indexes = legacyBaselineIndexesByName.get(item.candidate) ?? [];
    indexes.push(baselineIndex);
    legacyBaselineIndexesByName.set(item.candidate, indexes);
  });
  legacyBaselineIndexesByName.forEach((baselineIndexes, name) => {
    const matchingResultIndexes = result.schedule.flatMap(
      (candidate, resultIndex) =>
        !usedResultIndexes.has(resultIndex) && candidate.candidate === name
          ? [resultIndex]
          : [],
    );
    if (baselineIndexes.length !== 1 || matchingResultIndexes.length !== 1) {
      return;
    }
    matchedResultIndexByBaselineIndex.set(
      baselineIndexes[0],
      matchingResultIndexes[0],
    );
    usedResultIndexes.add(matchingResultIndexes[0]);
  });

  const unplacedCandidateByKey = new Map<string, string>();
  baseline.forEach((item, baselineIndex) => {
    if (!matchedResultIndexByBaselineIndex.has(baselineIndex)) {
      unplacedCandidateByKey.set(
        `${candidateKey(item)}:${baselineIndex}`,
        item.candidate,
      );
    }
  });
  (result.unplaceable ?? []).forEach((candidate) => {
    const key = candidate.candidate_id
      ? `id:${candidate.candidate_id}`
      : `name:${candidate.candidate}`;
    unplacedCandidateByKey.set(key, candidate.candidate);
  });

  const candidatePairs = [
    ...baseline.map((before, baselineIndex) => {
      const resultIndex =
        matchedResultIndexByBaselineIndex.get(baselineIndex) ?? -1;
      return {
        before,
        after: resultIndex >= 0 ? result.schedule[resultIndex] : undefined,
      };
    }),
    ...result.schedule.flatMap((after, resultIndex) =>
      usedResultIndexes.has(resultIndex) ? [] : [{ before: undefined, after }],
    ),
  ];

  const affectedInterviewerKeys = new Set<string>();
  const changes: ProposalDiffChange[] = [];
  let movedCount = 0;
  let panelChangedCount = 0;
  let unchangedCount = 0;
  let timeChangedCount = 0;

  candidatePairs.forEach(({ before, after }) => {
    const beforePanel = panelKeys(before);
    const afterPanel = panelKeys(after);
    const panelDifference = symmetricDifference(beforePanel, afterPanel);
    const timeChanged = before?.time !== after?.time;

    if (!timeChanged && panelDifference.size === 0) {
      unchangedCount += 1;
      return;
    }
    if (timeChanged) timeChangedCount += 1;

    if (timeChanged) {
      beforePanel.forEach((member) => affectedInterviewerKeys.add(member));
      afterPanel.forEach((member) => affectedInterviewerKeys.add(member));
    } else {
      panelDifference.forEach((member) => affectedInterviewerKeys.add(member));
    }

    const removed = [...beforePanel]
      .filter((member) => !afterPanel.has(member))
      .map(memberName);
    const added = [...afterPanel]
      .filter((member) => !beforePanel.has(member))
      .map(memberName);

    const kind: ProposalDiffChangeKind =
      before === undefined
        ? "added"
        : after === undefined
          ? "removed"
          : timeChanged
            ? "moved"
            : "panel";
    if (kind === "moved") movedCount += 1;
    if (kind === "panel") panelChangedCount += 1;

    changes.push({
      kind,
      candidate: after?.candidate ?? before?.candidate ?? "Ukjent kandidat",
      beforeTime: before?.time,
      afterTime: after?.time,
      removedInterviewers: removed,
      addedInterviewers: added,
    });
  });

  return {
    changes,
    movedCount,
    panelChangedCount,
    addedCount: changes.filter((change) => change.kind === "added").length,
    removedCount: changes.filter((change) => change.kind === "removed").length,
    unchangedCount,
    timeChangedCount,
    affectedInterviewerCount: affectedInterviewerKeys.size,
    unplacedCandidates: [...new Set(unplacedCandidateByKey.values())].sort(
      (left, right) => left.localeCompare(right, "nb"),
    ),
  };
};
