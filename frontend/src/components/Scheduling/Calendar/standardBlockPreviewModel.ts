export interface StandardBlockPreviewInput {
  startMinute: number;
  interviewDuration: number;
  interviewCount: number;
  pauseMinutes: number;
}

export interface StandardBlockInterview {
  id: string;
  number: number;
  startMinute: number;
  endMinute: number;
}

export interface StandardBlockPreviewLayout extends StandardBlockPreviewInput {
  interviews: StandardBlockInterview[];
  blockEndMinute: number;
  blockDuration: number;
  nextBlockStartMinute: number;
  totalPatternDuration: number;
  accessibleDescription: string;
}

export const formatClockMinute = (minute: number) => {
  const normalized = ((minute % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
};

const joinNorwegianList = (parts: string[]) => {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} og ${parts[parts.length - 1]}`;
};

export const buildStandardBlockPreviewLayout = ({
  startMinute,
  interviewDuration,
  interviewCount,
  pauseMinutes,
}: StandardBlockPreviewInput): StandardBlockPreviewLayout => {
  const interviews = Array.from({ length: interviewCount }, (_, index) => {
    const interviewStartMinute = startMinute + index * interviewDuration;
    return {
      id: `interview-${index + 1}`,
      number: index + 1,
      startMinute: interviewStartMinute,
      endMinute: interviewStartMinute + interviewDuration,
    };
  });
  const blockDuration = interviewDuration * interviewCount;
  const blockEndMinute = startMinute + blockDuration;
  const nextBlockStartMinute = blockEndMinute + pauseMinutes;
  const interviewDescription = joinNorwegianList(
    interviews.map(
      (interview) =>
        `intervju ${interview.number} går fra ${formatClockMinute(
          interview.startMinute,
        )} til ${formatClockMinute(interview.endMinute)}`,
    ),
  );
  const pauseDescription =
    pauseMinutes > 0
      ? `Deretter følger en pause på ${pauseMinutes} minutter. `
      : "Det er ingen pause mellom blokkene. ";

  return {
    startMinute,
    interviewDuration,
    interviewCount,
    pauseMinutes,
    interviews,
    blockEndMinute,
    blockDuration,
    nextBlockStartMinute,
    totalPatternDuration: blockDuration + pauseMinutes,
    accessibleDescription: `Intervjublokk fra ${formatClockMinute(
      startMinute,
    )} til ${formatClockMinute(
      blockEndMinute,
    )} med ${interviewCount} intervjuer på ${interviewDuration} minutter. ${interviewDescription}. ${pauseDescription}Neste blokk starter ${formatClockMinute(
      nextBlockStartMinute,
    )}.`,
  };
};
