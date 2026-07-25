export const breakpoints = {
  phone: "31.25rem",
  handheld: "40rem",
  compact: "43.75rem",
  medium: "48rem",
  portrait: "56.25rem",
  tablet: "62.5rem",
  large: "64rem",
  wide: "80rem",
  ultraWide: "96rem",
} as const;

export const calendarGrid = {
  timeColumnWidth: 64,
  dayColumnMinWidth: 120,
  scheduleTimeColumnWidth: 80,
  scheduleDayColumnMinWidth: 160,
  minimumWidth: 760,
} as const;

export const applicationTableColumnWidths = {
  expander: 36,
  identity: 170,
  contact: 210,
  group: 130,
  status: 185,
  timestamp: 115,
  applicationText: 800,
  actions: 160,
} as const;

export const iconSizes = {
  nano: 9,
  micro: 10,
  tiny: 11,
  compact: 12,
  detail: 13,
  small: 14,
  control: 15,
  medium: 16,
  standard: 18,
  feature: 20,
  hero: 28,
} as const;

export const iconStrokeWidths = {
  standard: 2,
  strong: 2.5,
  emphasis: 3,
} as const;

export const interactionTimings = {
  copiedFeedbackMs: 2500,
} as const;
