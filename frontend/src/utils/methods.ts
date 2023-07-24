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

/**
 *
 * @param name
 * @param obj
 * @returns
 */
export const traverseObject: (name: string, obj: object) => string = (
  name,
  obj
) =>
  name
    .split(".")
    .reduce((accumulator, currentIndex) => {
      if (typeof accumulator === "string" || !accumulator) {
        return accumulator;
      }
      if (currentIndex in accumulator) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        return accumulator[currentIndex];
      }
      return "";
    }, obj)
    ?.toString();

export const uuidv4mock = () => {
  return (<any>[1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(
    /[018]/g,
    (c: number) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
  );
};
