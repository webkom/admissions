import { Candidate, Interviewer } from "../../types";

export const DEFAULT_MOCK_CANDIDATE_COUNT = 24;
export const DEFAULT_MOCK_INTERVIEWER_COUNT = 12;

const FEMALE_FIRST_NAMES = [
  "Anna",
  "Ingrid",
  "Sofie",
  "Emma",
  "Maja",
  "Nora",
  "Kari",
  "Maria",
  "Tuva",
  "Thea",
];

const MALE_FIRST_NAMES = [
  "Ola",
  "Erik",
  "Morten",
  "Lars",
  "Henrik",
  "Jonas",
  "Andreas",
  "Per",
  "Sander",
  "Even",
];

const LAST_NAMES = [
  "Hansen",
  "Johansen",
  "Olsen",
  "Larsen",
  "Andersen",
  "Nilsen",
  "Berg",
  "Dahl",
  "Kristiansen",
  "Moe",
];

const buildName = (index: number, gender: Candidate["gender"]) => {
  const firstNames = gender === "F" ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES;
  const cycle = Math.floor(index / (firstNames.length * LAST_NAMES.length));
  const firstName = firstNames[index % firstNames.length];
  const lastName =
    LAST_NAMES[Math.floor(index / firstNames.length) % LAST_NAMES.length];
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

const clampHour = (hour: number) => Math.max(8, Math.min(16, hour));

const addAvailabilityBlock = (
  availability: Set<number>,
  day: number,
  startHour: number,
  length: number,
) => {
  for (let offset = 0; offset < length; offset += 1) {
    const hour = startHour + offset;

    if (hour >= 8 && hour < 17) {
      availability.add(day * 24 + hour);
    }
  }
};

const buildAvailability = (index: number) => {
  const random = createSeededRandom(index);
  const availability = new Set<number>();
  const preferredStart = 8 + Math.floor(random() * 5);
  const preferredLength = 3 + Math.floor(random() * 3);

  for (let day = 0; day < 5; day += 1) {
    const dayRoll = random();
    const dayBias = Math.floor(random() * 3) - 1;
    const startHour = clampHour(preferredStart + dayBias);

    if (dayRoll < 0.18) {
      continue;
    }

    if (dayRoll < 0.5) {
      addAvailabilityBlock(
        availability,
        day,
        startHour,
        Math.max(2, preferredLength - 1),
      );
      continue;
    }

    if (dayRoll < 0.82) {
      addAvailabilityBlock(availability, day, startHour, preferredLength);
      continue;
    }

    const firstBlockLength = 2 + Math.floor(random() * 2);
    const gap = 2 + Math.floor(random() * 2);
    const secondStart = clampHour(startHour + firstBlockLength + gap);
    const secondLength = 2 + Math.floor(random() * 2);

    addAvailabilityBlock(availability, day, startHour, firstBlockLength);
    addAvailabilityBlock(availability, day, secondStart, secondLength);
  }

  // Ensure nobody ends up with unrealistically sparse availability.
  if (availability.size < 8) {
    const fallbackStart = clampHour(preferredStart);
    const fallbackDay = Math.floor(random() * 5);
    const secondDay = (fallbackDay + 2) % 5;

    addAvailabilityBlock(availability, fallbackDay, fallbackStart, 4);
    addAvailabilityBlock(
      availability,
      secondDay,
      clampHour(fallbackStart + 1),
      3,
    );
  }

  return Array.from(availability).sort((a, b) => a - b);
};

export const createMockCandidates = (count: number): Candidate[] =>
  Array.from({ length: count }, (_, index) => {
    const gender = index % 2 === 0 ? "M" : "F";

    return {
      id: `candidate-${index + 1}`,
      name: buildName(index, gender),
      gender,
    };
  });

export const createMockInterviewers = (count: number): Interviewer[] =>
  Array.from({ length: count }, (_, index) => {
    const gender = index % 2 === 0 ? "F" : "M";

    return {
      id: `interviewer-${index + 1}`,
      name: buildName(index, gender),
      gender,
      availability: buildAvailability(index),
    };
  });

export const MOCK_CANDIDATES = createMockCandidates(
  DEFAULT_MOCK_CANDIDATE_COUNT,
);
export const MOCK_INTERVIEWERS = createMockInterviewers(
  DEFAULT_MOCK_INTERVIEWER_COUNT,
);
