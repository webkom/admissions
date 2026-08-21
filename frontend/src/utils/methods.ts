export const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).replaceAll('"', '""');
  return /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(text) ? `'${text}` : text;
};
