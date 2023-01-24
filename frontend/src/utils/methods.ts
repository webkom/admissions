/**
 *  Removes an item if it matches the predicate, remove it if it doesn't.
 *
 * @param array     The original array
 * @param item      The item to either remove or add to the array
 * @param predicate Optional predicate to decide when to remove or add
 * @returns The new, updated, array
 */
export const toggleFromArray: <T>(
  array: T[],
  item: T,
  predicate?: (value: T, index: number, array: T[]) => boolean
) => void = (array, item, predicate = (value) => value === item) =>
  array.includes(item)
    ? array.filter((value, index, array) => !predicate(value, index, array))
    : [...array, item];

/**
 * Replace double quotation marks with single quotation marks
 *
 * @param text The string to be replaced
 * @returns A string where " is replaced by '
 */
export const replaceQuotationMarks = (text: string) =>
  text.replaceAll('"', "'");
