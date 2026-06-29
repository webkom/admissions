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
  predicate?: (value: T, index: number, array: T[]) => boolean,
) => void = (array, item, predicate = (value) => value === item) =>
  array.includes(item)
    ? array.filter((value, index, array) => !predicate(value, index, array))
    : [...array, item];

/**
 * Make an applicant-supplied value safe to put in a CSV cell.
 *
 * Defuses spreadsheet formula injection: Excel/Sheets execute a cell whose
 * value starts with =, +, -, @, tab or carriage return, so an answer like
 * `=HYPERLINK(...)` would run when a recruiter opens applications.csv. Such
 * values are prefixed with a single quote so they render as plain text.
 * Embedded double quotes are also normalised to single quotes.
 *
 * @param value The applicant-derived value
 * @returns A string safe to write to a CSV cell
 */
export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', "'");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};
