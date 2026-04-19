import { Candidate, Interviewer } from "../../types";

export const DEFAULT_MOCK_CANDIDATE_COUNT = 24;
export const DEFAULT_MOCK_INTERVIEWER_COUNT = 12;

const FEMALE_FIRST_NAMES = [
  "Anna", "Ingrid", "Sofie", "Emma", "Maja",
  "Nora", "Kari", "Maria", "Tuva", "Thea",
];

const MALE_FIRST_NAMES = [
  "Ola", "Erik", "Morten", "Lars", "Henrik",
  "Jonas", "Andreas", "Per", "Sander", "Even",
];

const LAST_NAMES = [
  "Hansen", "Johansen", "Olsen", "Larsen", "Andersen",
  "Nilsen", "Berg", "Dahl", "Kristiansen", "Moe",
];

const buildName = (index: number, gender: Candidate["gender"]) => {
  const firstNames = gender === "F" ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  const cycle = Math.floor(index / (firstNames.length * LAST_NAMES.length));
  const firstName = firstNames[index % firstNames.length];
  const lastName = LAST_NAMES[Math.floor(index / firstNames.length) % LAST_NAMES.length];
  const suffix = cycle > 0 ? ` ${cycle + 1}` : "";
  return `${firstName} ${lastName}${suffix}`;
};

const createSeededRandom = (seed: number) => {
  let state = (seed + 1) * 2654435761;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

export interface ScheduleConfig {
  numDays: number;
  dayStartHour: number;
  dayEndHour: number;
  chunkSize: number;
}

interface AvailabilityGroup {
  day: number;
  startHour: number;
  endHour: number;
}

const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  numDays: 5,
  dayStartHour: 8,
  dayEndHour: 17,
  chunkSize: 4,
};

const buildAvailabilityGroups = (
  index: number,
  config: ScheduleConfig,
): AvailabilityGroup[] => {
  const { numDays, dayStartHour, dayEndHour, chunkSize } = config;
  const random = createSeededRandom(index);
  const groups: AvailabilityGroup[] = [];

  const allHours: number[] = [];
  for (let h = dayStartHour; h < dayEndHour; h++) {
    allHours.push(h);
  }

  const chunks: number[][] = [];
  for (let i = 0; i < allHours.length; i += chunkSize) {
    chunks.push(allHours.slice(i, i + chunkSize));
  }

  if (chunks.length === 0 || numDays === 0) return [];

  for (let day = 0; day < numDays; day++) {
    const dayRoll = random();
    if (dayRoll < 0.15) continue;

    // Pick a contiguous chunk window so availability appears as grouped blocks.
    const windowSize = dayRoll < 0.6 ? 1 : Math.min(2, chunks.length);
    const maxStart = Math.max(0, chunks.length - windowSize);
    const startChunkIndex = Math.floor(random() * (maxStart + 1));

    for (let c = 0; c < windowSize; c++) {
      const chunk = chunks[startChunkIndex + c];
      if (!chunk || chunk.length === 0) continue;

      groups.push({
        day,
        startHour: chunk[0],
        endHour: chunk[chunk.length - 1] + 1,
      });
    }
  }

  const totalHours = groups.reduce(
    (sum, group) => sum + (group.endHour - group.startHour),
    0,
  );

  if (totalHours < 4) {
    const fallbackDay = Math.floor(random() * numDays);
    const fallbackChunk = chunks[0] ?? allHours.slice(0, chunkSize);
    if (fallbackChunk.length > 0) {
      groups.push({
        day: fallbackDay,
        startHour: fallbackChunk[0],
        endHour: fallbackChunk[fallbackChunk.length - 1] + 1,
      });
    }
  }

  return groups.sort((a, b) =>
    a.day === b.day ? a.startHour - b.startHour : a.day - b.day,
  );
};

const groupsToAvailability = (groups: AvailabilityGroup[]): number[] => {
  const availability = new Set<number>();

  groups.forEach((group) => {
    for (let hour = group.startHour; hour < group.endHour; hour++) {
      availability.add(group.day * 24 + hour);
    }
  });

  return Array.from(availability).sort((a, b) => a - b);
};

const buildAvailability = (index: number, config: ScheduleConfig): number[] => {
  return groupsToAvailability(buildAvailabilityGroups(index, config));
};

export const mergeAvailability = (
  primary: number[],
  secondary: number[],
): number[] =>
  Array.from(new Set([...primary, ...secondary])).sort((a, b) => a - b);

export const createMockCandidates = (count: number): Candidate[] =>
  Array.from({ length: count }, (_, index) => {
    const gender = index % 2 === 0 ? "M" : "F";
    return { id: `candidate-${index + 1}`, name: buildName(index, gender), gender };
  });

export const createMockInterviewers = (
  count: number,
  config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG,
): Interviewer[] =>
  Array.from({ length: count }, (_, index) => {
    const gender = index % 2 === 0 ? "F" : "M";
    return {
      id: `interviewer-${index + 1}`,
      name: buildName(index, gender),
      gender,
      availability: buildAvailability(index, config),
    };
  });
