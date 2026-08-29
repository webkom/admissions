import type {
  Candidate,
  Interviewer,
  ScheduleItem,
  SchedulePanelMember,
} from "../types";

export interface ScheduleEntryRef {
  scheduleIndex: number;
  item: ScheduleItem;
}

export interface HealthExceptionMember {
  id?: string;
  name: string;
}

export interface AvailabilityException {
  scheduleIndex: number;
  time: number;
  candidateId?: string;
  candidateName: string;
  offenders: HealthExceptionMember[];
}

export interface ConflictException {
  scheduleIndex: number;
  time: number;
  candidateId?: string;
  candidateName: string;
  offenders: HealthExceptionMember[];
}

export interface RestException {
  scheduleIndex: number;
  time: number;
  candidateId?: string;
  candidateName: string;
  offenders: HealthExceptionMember[];
  /** The adjacent worked blocks without a pause: index into the blocks
   *  argument and the first slot of each block. */
  blockIndexes: number[];
  blockStartTimes: number[];
}

export interface PanelSubstitutionSuggestion {
  replacementId: string;
  replacementName: string;
}

const memberKey = (member: HealthExceptionMember) => member.id ?? member.name;

const blockDay = (block: number[]) =>
  block.length > 0 ? Math.floor(block[0] / (24 * 60)) : -1;

const buildBlockIndexByTime = (blocks: number[][]) => {
  const index = new Map<number, number>();
  blocks.forEach((block, blockIndex) => {
    block.forEach((time) => index.set(time, blockIndex));
  });
  return index;
};

const buildWorkedBlocks = (
  entries: ScheduleEntryRef[],
  blocks: number[][],
): Map<string, Set<number>> => {
  const indexByTime = buildBlockIndexByTime(blocks);
  const worked = new Map<string, Set<number>>();
  entries.forEach(({ item }) => {
    const blockIndex = indexByTime.get(item.time);
    if (blockIndex === undefined) return;
    item.panel.forEach((member) => {
      const key = memberKey(member);
      const set = worked.get(key) ?? new Set<number>();
      set.add(blockIndex);
      worked.set(key, set);
    });
  });
  return worked;
};

/** Interviews where a panel member works outside their submitted
 *  availability. Every offending member of the row is listed, so the health
 *  modal can offer a fix per row. */
export const collectAvailabilityExceptions = (
  entries: ScheduleEntryRef[],
  isOutsideAvailability: (
    item: ScheduleItem,
    member: SchedulePanelMember,
  ) => boolean,
): AvailabilityException[] =>
  entries
    .map(({ scheduleIndex, item }) => ({
      scheduleIndex,
      time: item.time,
      candidateId: item.candidate_id,
      candidateName: item.candidate,
      offenders: item.panel
        .filter((member) => isOutsideAvailability(item, member))
        .map((member) => ({ id: member.id, name: member.name })),
    }))
    .filter((exception) => exception.offenders.length > 0);

/** Interviews whose panel member is biased against the candidate. */
export const collectConflictExceptions = (
  entries: ScheduleEntryRef[],
  interviewers: Interviewer[],
): ConflictException[] => {
  const biasedIdsByInterviewer = new Map(
    interviewers.map((interviewer) => [interviewer.id, interviewer.biased]),
  );
  return entries
    .map(({ scheduleIndex, item }) => ({
      scheduleIndex,
      time: item.time,
      candidateId: item.candidate_id,
      candidateName: item.candidate,
      offenders: item.panel
        .filter((member) => {
          const biased = member.id
            ? biasedIdsByInterviewer.get(member.id)
            : undefined;
          return Boolean(
            item.candidate_id && biased?.includes(item.candidate_id),
          );
        })
        .map((member) => ({ id: member.id, name: member.name })),
    }))
    .filter((exception) => exception.offenders.length > 0);
};

/** Rest violations: a panel member working two adjacent blocks on the same
 *  day gets no pause between them. The fix target is one interview in the
 *  later block — substituting the member there restores the break. */
export const findRestViolations = (
  entries: ScheduleEntryRef[],
  blocks: number[][],
): RestException[] => {
  const indexByTime = buildBlockIndexByTime(blocks);
  const worked = buildWorkedBlocks(entries, blocks);
  const violations: RestException[] = [];
  worked.forEach((workedBlocks, key) => {
    const sortedBlocks = Array.from(workedBlocks).sort((a, b) => a - b);
    sortedBlocks.forEach((blockIndex) => {
      const nextIndex = blockIndex + 1;
      if (!workedBlocks.has(nextIndex)) return;
      if (nextIndex >= blocks.length) return;
      if (blockDay(blocks[blockIndex]) !== blockDay(blocks[nextIndex])) return;
      const target = entries.find(({ item }) => {
        if (indexByTime.get(item.time) !== nextIndex) return false;
        return item.panel.some((member) => memberKey(member) === key);
      });
      if (!target) return;
      const offender = target.item.panel.find(
        (member) => memberKey(member) === key,
      );
      if (!offender) return;
      violations.push({
        scheduleIndex: target.scheduleIndex,
        time: target.item.time,
        candidateId: target.item.candidate_id,
        candidateName: target.item.candidate,
        offenders: [{ id: offender.id, name: offender.name }],
        blockIndexes: [blockIndex, nextIndex],
        blockStartTimes: [blocks[blockIndex][0], blocks[nextIndex][0]].filter(
          (start) => Number.isFinite(start),
        ),
      });
    });
  });
  // One interview can appear once per overlapping member; keep the row
  // order stable and drop duplicate (row, member) pairs.
  const seen = new Set<string>();
  return violations.filter((violation) => {
    const key = `${violation.scheduleIndex}:${memberKey(
      violation.offenders[0],
    )}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export interface PanelSubstitutionParams {
  /** The row whose panel is being fixed. */
  item: ScheduleItem;
  /** All rows, used for load and double-booking checks. */
  entries: ScheduleEntryRef[];
  interviewers: Interviewer[];
  candidates: Candidate[];
  /** Substitute must be available at the row's time (availability fixes).
   *  When false, overtime substitutes are allowed too. */
  requireAvailable?: boolean;
  /** Slot times the substitute must not already work (rest fixes). */
  avoidTimes?: Set<number>;
}

/** Suggest a replacement panel member: not already in the panel, not
 *  double-booked at the time, not biased against the candidate, not the
 *  candidate themself, and — for availability fixes — actually available.
 *  Least-loaded interviewer wins; name breaks ties deterministically. */
export const suggestPanelSubstitution = ({
  item,
  entries,
  interviewers,
  candidates,
  requireAvailable = true,
  avoidTimes,
}: PanelSubstitutionParams): PanelSubstitutionSuggestion | null => {
  const panelIds = new Set(
    item.panel.map((member) => member.id ?? member.name),
  );
  const busyAtTime = new Set<string>();
  entries.forEach(({ item: other }) => {
    if (other.time !== item.time) return;
    other.panel.forEach((member) => {
      if (member.id) busyAtTime.add(member.id);
    });
  });
  const candidate = item.candidate_id
    ? candidates.find((entry) => entry.id === item.candidate_id)
    : undefined;
  const loadByName = new Map<string, number>();
  entries.forEach(({ item: other }) => {
    other.panel.forEach((member) => {
      const key = member.id ?? member.name;
      loadByName.set(key, (loadByName.get(key) ?? 0) + 1);
    });
  });
  const workedInBlocks = new Set<string>();
  if (avoidTimes && avoidTimes.size > 0) {
    entries.forEach(({ item: other }) => {
      if (!avoidTimes.has(other.time)) return;
      other.panel.forEach((member) => {
        if (member.id) workedInBlocks.add(member.id);
      });
    });
  }
  const eligible = interviewers.filter((interviewer) => {
    if (!interviewer.id) return false;
    if (panelIds.has(interviewer.id)) return false;
    if (busyAtTime.has(interviewer.id)) return false;
    if (workedInBlocks.has(interviewer.id)) return false;
    if (item.candidate_id && interviewer.biased.includes(item.candidate_id)) {
      return false;
    }
    if (candidate?.user_id && interviewer.id === candidate.user_id) {
      return false;
    }
    if (requireAvailable && !interviewer.availability.includes(item.time)) {
      return false;
    }
    return true;
  });
  const ranked = eligible
    .map((interviewer) => ({
      interviewer,
      load: loadByName.get(interviewer.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        a.load - b.load ||
        a.interviewer.name.localeCompare(b.interviewer.name, "nb"),
    );
  const best = ranked[0]?.interviewer;
  if (!best?.id) return null;
  return { replacementId: best.id, replacementName: best.name };
};
