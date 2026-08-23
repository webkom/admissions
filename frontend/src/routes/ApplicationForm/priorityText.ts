interface ParsedPriorityText {
  rankedGroups: string[];
  comments: string;
  hasExplicitRanking: boolean;
}

export const parsePriorityText = (
  value: string,
  selectedGroupNames: string[],
): ParsedPriorityText => {
  const selectedLookup = new Map(
    selectedGroupNames.map((groupName) => [
      normalizeText(groupName),
      groupName,
    ]),
  );
  const matchedGroups: string[] = [];
  const otherLines: string[] = [];

  value
    .split("\n")
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) {
        otherLines.push("");
        return;
      }
      const withoutNumber = line.replace(/^\d+\s*[.)-:]*\s*/, "").trim();
      const matchedGroup = selectedLookup.get(normalizeText(withoutNumber));
      if (matchedGroup && !matchedGroups.includes(matchedGroup)) {
        matchedGroups.push(matchedGroup);
        return;
      }
      otherLines.push(line);
    });

  const remainingGroups = selectedGroupNames.filter(
    (groupName) => !matchedGroups.includes(groupName),
  );

  return {
    rankedGroups: [...matchedGroups, ...remainingGroups],
    comments: otherLines.join("\n").trim(),
    hasExplicitRanking: matchedGroups.length > 0,
  };
};

export const serializePriorityText = (
  rankedGroups: string[],
  comments: string,
  includeRanking = true,
) => {
  const rankingLines = includeRanking
    ? rankedGroups.map((groupName, index) => `${index + 1}. ${groupName}`)
    : [];
  const trimmedComments = comments.trim();
  if (!trimmedComments) return rankingLines.join("\n");
  if (!rankingLines.length) return trimmedComments;
  return [...rankingLines, "", trimmedComments].join("\n");
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
