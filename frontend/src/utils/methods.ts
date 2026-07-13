/**
 *  Removes an item if it matches the predicate, and adds it otherwise.
 *
 * @param array     The original array
 * @param item      The item to either remove or add to the array
 * @param predicate Optional predicate to decide when to remove or add
 * @returns The new, updated, array
 */
export const toggleFromArray: <T>(
  array: T[],
  item: T,
  predicate?: (value: T, index: number, array: T[]) => boolean,
) => T[] = (array, item, predicate = (value) => value === item) =>
  array.includes(item)
    ? array.filter((value, index, array) => !predicate(value, index, array))
    : [...array, item];

export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(text) ? `'${text}` : text;
};
