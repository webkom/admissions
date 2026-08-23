type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | readonly ClassValue[]
  | { [key: string]: unknown };

const flatten = (value: ClassValue, out: string[]): void => {
  if (!value) return;
  if (typeof value === "string" || typeof value === "number") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const key in value as Record<string, unknown>) {
      if ((value as Record<string, unknown>)[key]) out.push(key);
    }
  }
};

const cn = (...values: ClassValue[]): string => {
  const classes: string[] = [];
  for (const value of values) flatten(value, classes);
  return classes.join(" ");
};

export default cn;
